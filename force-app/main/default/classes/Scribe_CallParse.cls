/**
 * The single structured parse of a call recap. Produced once by
 * Scribe_ExtractionService and consumed by every topic's action, so all five
 * topics reason over identical extracted data rather than re-parsing the text
 * five different (and possibly inconsistent) ways.
 *
 * This DTO is intentionally serializable to JSON so it can be cached on
 * Scribe_Call_Log__c.Extraction_JSON__c at log time.
 */
public class Scribe_CallParse {

    /** A commitment someone made on the call ("I'll send pricing"). */
    public class Commitment {
        public String text;         // The commitment, cleaned up into a task-like phrase.
        public String owner;        // 'rep' or 'customer' — who promised it.
        public Integer dueInDays;   // Inferred timing cue in days, null when none found.
        public Commitment() {}
        public Commitment(String text, String owner, Integer dueInDays) {
            this.text = text;
            this.owner = owner;
            this.dueInDays = dueInDays;
        }
    }

    /** A person mentioned on the call who may need a Contact record. */
    public class Person {
        public String firstName;
        public String lastName;
        public String title;        // Inferred role/title, may be blank.
        public Person() {}
        public Person(String firstName, String lastName, String title) {
            this.firstName = firstName;
            this.lastName = lastName;
            this.title = title;
        }
    }

    public String sentiment = 'Neutral';                 // Positive / Neutral / Negative
    public String objections = '';                        // Free-text objections, blank when none.
    public List<Commitment> commitments = new List<Commitment>();
    public List<Person> people = new List<Person>();
    public Set<String> coveredRequirementKeys = new Set<String>(); // Stage requirement keys the recap addressed.
    public Boolean lowConfidence = false;                 // True when the recap was too thin to parse confidently.
    public String notes = '';                             // Why it was low-confidence, for graceful degradation.

    public String toJsonString() {
        return JSON.serialize(this);
    }

    public static Scribe_CallParse fromJson(String jsonStr) {
        if (String.isBlank(jsonStr)) {
            return new Scribe_CallParse();
        }
        return (Scribe_CallParse) JSON.deserialize(jsonStr, Scribe_CallParse.class);
    }
}
