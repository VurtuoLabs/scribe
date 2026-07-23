/**
 * Topic 1, Log This Call. The entry point for almost every interaction.
 * Extracts stage-relevant facts, objections and sentiment, logs them against the
 * Opportunity as a permanent Scribe_Call_Log__c, and caches the single parse so
 * every downstream topic reads the same extraction. Lowest risk (purely
 * additive) so it runs without a heavy confirmation gate.
 */
public with sharing class Scribe_LogCallInvocable {

    public class Request {
        @InvocableVariable(label='Call Summary' required=true
            description='The rep\'s raw recap, bullet list, paragraph, or pasted transcript.')
        public String callSummary;

        @InvocableVariable(label='Opportunity Id'
            description='The Opportunity this call belongs to.')
        public String opportunityId;

        @InvocableVariable(label='Rep User Id'
            description='The rep whose conversation triggered this. Defaults to the running user.')
        public String repUserId;

        @InvocableVariable(label='Source Channel'
            description='Chat, Dictation, or Transcript. Defaults to Chat.')
        public String sourceChannel;
    }

    public class Response {
        @InvocableVariable public Boolean success;
        @InvocableVariable public String callLogId;
        @InvocableVariable public String callLogName;
        @InvocableVariable public String sentiment;
        @InvocableVariable public String objections;
        @InvocableVariable public Integer commitmentCount;
        @InvocableVariable public Integer peopleCount;
        @InvocableVariable public Boolean lowConfidence;
        @InvocableVariable public String summary;
    }

    @InvocableMethod(label='Scribe: Log This Call'
        description='Logs the recap against the Opportunity and caches the extraction for every other topic.')
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            out.add(handle(req));
        }
        return out;
    }

    private static Response handle(Request req) {
        Response r = new Response();
        Id repId = Scribe_Util.toIdOrRunningUser(req.repUserId);
        Id oppId = Scribe_Util.toIdOrNull(req.opportunityId);

        String stageName;
        if (oppId != null) {
            List<Opportunity> opps = [SELECT StageName FROM Opportunity WHERE Id = :oppId LIMIT 1];
            if (!opps.isEmpty()) { stageName = opps[0].StageName; }
        }

        Scribe_CallParse parse = Scribe_ExtractionService.parse(req.callSummary, stageName);

        Scribe_Call_Log__c log = new Scribe_Call_Log__c(
            Opportunity__c = oppId,
            Call_Summary__c = req.callSummary,
            Call_Date__c = Date.today(),
            Logged_By_Rep__c = repId,
            Source_Channel__c = String.isBlank(req.sourceChannel) ? 'Chat' : req.sourceChannel,
            Sentiment__c = parse.sentiment,
            Objections__c = parse.objections,
            Stage_At_Log__c = stageName,
            Extraction_JSON__c = parse.toJsonString()
        );
        insert log;

        Scribe_ChangeLogService.insertLogs(
            new List<Scribe_Change_Log__c>{ Scribe_ChangeLogService.buildCallLogged(log, repId) });

        r.success = true;
        r.callLogId = log.Id;
        r.callLogName = log.Name;
        r.sentiment = parse.sentiment;
        r.objections = parse.objections;
        r.commitmentCount = parse.commitments.size();
        r.peopleCount = parse.people.size();
        r.lowConfidence = parse.lowConfidence;
        r.summary = 'Logged ' + log.Name + ' (' + parse.sentiment.toLowerCase() + ' sentiment). '
            + 'Found ' + parse.commitments.size() + ' commitment(s) and '
            + parse.people.size() + ' person(s) mentioned'
            + (String.isBlank(parse.objections) ? '' : '; objections noted') + '.'
            + (parse.lowConfidence ? ' NOTE: the recap was thin, ask the rep to add detail before inferring changes.' : '');
        return r;
    }
}
