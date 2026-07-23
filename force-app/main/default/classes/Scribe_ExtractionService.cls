/**
 * The extraction/classification engine. Turns a free-form call recap into one
 * structured Scribe_CallParse. This is the ONLY place the raw text is
 * interpreted, so every topic gets identical, deterministic extraction.
 *
 * Design goal honored here: never invent data. Everything returned traces to a
 * literal cue in the recap. When the recap is too thin, lowConfidence is set and
 * the caller is expected to ask the rep to clarify rather than guess.
 */
public with sharing class Scribe_ExtractionService {

    // Sentence boundary and commitment cues.
    private static final Set<String> POSITIVE_WORDS = new Set<String>{
        'excited','great','love','happy','positive','impressed','keen','on board',
        'moving forward','green light','enthusiastic','confident','win','strong fit'
    };
    private static final Set<String> NEGATIVE_WORDS = new Set<String>{
        'concerned','worried','pushback','objection','hesitant','stalled','risk',
        'blocker','unhappy','frustrated','too expensive','budget cut','not sure',
        'competitor','losing','delay','slipping','cold'
    };
    private static final Set<String> OBJECTION_WORDS = new Set<String>{
        'concern','worried','objection','too expensive','pushback','hesitant',
        'not sure','competitor','risk','blocker','pricing is','budget cut','legal',
        'security review','need approval','not convinced'
    };
    private static final Set<String> COMMITMENT_CUES = new Set<String>{
        'i\'ll','i will','we\'ll','we will','i\'m going to','we\'re going to',
        'let me','i can','we can send','going to send','plan to','i am going to',
        'we are going to','they\'ll','they will','he\'ll','she\'ll','they\'re going to'
    };
    private static final Set<String> CUSTOMER_TOKENS = new Set<String>{
        'they','their','customer','client','prospect','he ','she ','buyer'
    };

    /**
     * Parse a raw recap into structured data. Optionally supply the Opportunity's
     * StageName so stage-requirement coverage can be evaluated in one pass.
     */
    public static Scribe_CallParse parse(String rawSummary, String stageName) {
        Scribe_CallParse result = new Scribe_CallParse();
        if (String.isBlank(rawSummary) || rawSummary.trim().length() < 12) {
            result.lowConfidence = true;
            result.notes = 'The recap was empty or too short to extract anything reliably.';
            return result;
        }
        String lower = rawSummary.toLowerCase();

        result.sentiment = classifySentiment(lower);
        result.objections = extractObjections(rawSummary);
        result.commitments = extractCommitments(rawSummary);
        result.people = extractPeople(rawSummary);
        result.coveredRequirementKeys = coveredRequirementKeys(lower, stageName);

        // Graceful degradation: a thin recap that yielded nothing actionable.
        if (result.commitments.isEmpty() && result.people.isEmpty()
                && String.isBlank(result.objections) && rawSummary.trim().length() < 40) {
            result.lowConfidence = true;
            result.notes = 'The recap was too vague to confidently extract commitments, people, or field changes.';
        }
        return result;
    }

    @TestVisible
    private static String classifySentiment(String lower) {
        Integer pos = countHits(lower, POSITIVE_WORDS);
        Integer neg = countHits(lower, NEGATIVE_WORDS);
        if (neg > pos) { return 'Negative'; }
        if (pos > neg && pos > 0) { return 'Positive'; }
        return 'Neutral';
    }

    @TestVisible
    private static String extractObjections(String raw) {
        List<String> hits = new List<String>();
        for (String sentence : splitSentences(raw)) {
            String s = sentence.toLowerCase();
            for (String w : OBJECTION_WORDS) {
                if (s.contains(w)) {
                    hits.add(sentence.trim());
                    break;
                }
            }
        }
        return String.join(hits, ' | ');
    }

    @TestVisible
    private static List<Scribe_CallParse.Commitment> extractCommitments(String raw) {
        List<Scribe_CallParse.Commitment> out = new List<Scribe_CallParse.Commitment>();
        for (String sentence : splitSentences(raw)) {
            String s = sentence.toLowerCase();
            Boolean isCommitment = false;
            for (String cue : COMMITMENT_CUES) {
                if (s.contains(cue)) { isCommitment = true; break; }
            }
            if (!isCommitment) { continue; }

            String owner = 'rep';
            for (String ct : CUSTOMER_TOKENS) {
                if (s.startsWith(ct) || s.contains(' ' + ct)) { owner = 'customer'; break; }
            }
            // Rep first-person cues win back ownership when both appear.
            if (s.contains('i\'ll') || s.contains('i will') || s.contains('we\'ll')
                    || s.contains('we will') || s.contains('let me') || s.contains('i\'m going to')) {
                owner = 'rep';
            }
            out.add(new Scribe_CallParse.Commitment(
                cleanCommitment(sentence.trim()), owner, inferDueInDays(s)));
        }
        return out;
    }

    @TestVisible
    private static Integer inferDueInDays(String lower) {
        if (lower.contains('today') || lower.contains('right now') || lower.contains('this afternoon')) { return 0; }
        if (lower.contains('tomorrow')) { return 1; }
        if (lower.contains('this week') || lower.contains('by friday') || lower.contains('by eow')) { return 3; }
        if (lower.contains('next week')) { return 7; }
        if (lower.contains('end of month') || lower.contains('end of the month')) { return 14; }
        if (lower.contains('next month')) { return 30; }
        // "in N days"
        Matcher m = Pattern.compile('in (\\d{1,2}) days').matcher(lower);
        if (m.find()) { return Integer.valueOf(m.group(1)); }
        return null;
    }

    @TestVisible
    private static List<Scribe_CallParse.Person> extractPeople(String raw) {
        List<Scribe_CallParse.Person> out = new List<Scribe_CallParse.Person>();
        Set<String> seen = new Set<String>();
        // Title-anchored: "their CFO Jane Smith" / "Jane Smith, VP of Ops"
        Map<String, String> titleMap = new Map<String, String>{
            'cfo' => 'CFO', 'ceo' => 'CEO', 'coo' => 'COO', 'cto' => 'CTO',
            'cio' => 'CIO', 'cmo' => 'CMO', 'ciso' => 'CISO',
            'vp' => 'VP', 'president' => 'President', 'director' => 'Director',
            'head of' => 'Head', 'procurement' => 'Procurement', 'general counsel' => 'General Counsel'
        };
        // Capture "Firstname Lastname" proper-noun pairs.
        Matcher nm = Pattern.compile('([A-Z][a-z]+) ([A-Z][a-z]+)').matcher(raw);
        String lowerRaw = raw.toLowerCase();
        while (nm.find()) {
            String first = nm.group(1);
            String last = nm.group(2);
            String key = (first + ' ' + last).toLowerCase();
            if (seen.contains(key)) { continue; }
            // Skip obvious non-person phrases.
            if (STOP_PAIRS.contains(key)) { continue; }
            seen.add(key);
            String title = '';
            Integer idx = lowerRaw.indexOf(key);
            String window = lowerRaw.substring(Math.max(0, idx - 25),
                Math.min(lowerRaw.length(), idx + key.length() + 25));
            for (String tk : titleMap.keySet()) {
                if (window.contains(tk)) { title = titleMap.get(tk); break; }
            }
            out.add(new Scribe_CallParse.Person(first, last, title));
        }
        return out;
    }

    private static final Set<String> STOP_PAIRS = new Set<String>{
        'close date','next step','follow up','the customer','the prospect',
        'this week','next week','the deal','sales cloud'
    };

    /**
     * Return the single parse for a call, reusing the cached extraction on the
     * Call Log when available so downstream topics don't re-parse the text. Falls
     * back to parsing raw text (from the log or the passed summary) when no cache
     * exists. This is how "one extraction, many outputs" is enforced in code.
     */
    public static Scribe_CallParse resolve(Id callLogId, String callSummary, String stageName) {
        if (callLogId != null) {
            List<Scribe_Call_Log__c> logs = [
                SELECT Extraction_JSON__c, Call_Summary__c, Stage_At_Log__c
                FROM Scribe_Call_Log__c WHERE Id = :callLogId LIMIT 1
            ];
            if (!logs.isEmpty()) {
                Scribe_Call_Log__c log = logs[0];
                if (String.isNotBlank(log.Extraction_JSON__c)) {
                    return Scribe_CallParse.fromJson(log.Extraction_JSON__c);
                }
                return parse(log.Call_Summary__c,
                    String.isBlank(stageName) ? log.Stage_At_Log__c : stageName);
            }
        }
        return parse(callSummary, stageName);
    }

    /**
     * Which stage requirements the recap addressed, by matching the CMT
     * detection keywords against the text. Keys NOT returned are the gaps.
     */
    public static Set<String> coveredRequirementKeys(String lower, String stageName) {
        Set<String> covered = new Set<String>();
        if (String.isBlank(stageName)) { return covered; }
        for (Scribe_Stage_Requirement__mdt req : loadRequirements(stageName)) {
            if (String.isBlank(req.Detection_Keywords__c)) { continue; }
            for (String kw : req.Detection_Keywords__c.toLowerCase().split(',')) {
                String k = kw.trim();
                if (k.length() > 0 && lower.contains(k)) {
                    covered.add(req.Requirement_Key__c);
                    break;
                }
            }
        }
        return covered;
    }

    /** Active requirements for a stage, ordered. Test-injectable. */
    @TestVisible
    private static List<Scribe_Stage_Requirement__mdt> testRequirements;

    public static List<Scribe_Stage_Requirement__mdt> loadRequirements(String stageName) {
        if (testRequirements != null) {
            List<Scribe_Stage_Requirement__mdt> filtered = new List<Scribe_Stage_Requirement__mdt>();
            for (Scribe_Stage_Requirement__mdt r : testRequirements) {
                if (r.Is_Active__c && r.Stage_Name__c == stageName) { filtered.add(r); }
            }
            return filtered;
        }
        return [
            SELECT Stage_Name__c, Requirement_Key__c, Requirement_Label__c,
                   Detection_Keywords__c, Reminder_Task_Subject__c, Reminder_Due_In_Days__c,
                   Sort_Order__c, Is_Active__c
            FROM Scribe_Stage_Requirement__mdt
            WHERE Is_Active__c = true AND Stage_Name__c = :stageName
            ORDER BY Sort_Order__c ASC NULLS LAST
        ];
    }

    // ---- helpers ----

    private static Integer countHits(String lower, Set<String> words) {
        Integer n = 0;
        for (String w : words) {
            if (lower.contains(w)) { n++; }
        }
        return n;
    }

    @TestVisible
    private static List<String> splitSentences(String raw) {
        List<String> out = new List<String>();
        for (String part : raw.split('[\\.\\!\\?\\n;]')) {
            if (part != null && part.trim().length() > 0) { out.add(part.trim()); }
        }
        return out;
    }

    private static String cleanCommitment(String sentence) {
        String s = sentence.trim();
        // Trim leading conjunctions/bullets.
        s = s.replaceFirst('^[\\-\\*\\u2022\\s]+', '');
        if (s.length() > 240) { s = s.substring(0, 237) + '...'; }
        if (s.length() > 0) {
            s = s.substring(0, 1).toUpperCase() + s.substring(1);
        }
        return s;
    }
}
