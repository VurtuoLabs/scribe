/**
 * Topic 3 — Create Follow-Up Tasks. Scans the recap for commitments ("I'll...",
 * "we will...") on either side of the conversation and creates one Task per
 * commitment, with an owner and due date inferred from context. This is the topic
 * most responsible for making sure verbal commitments don't silently disappear.
 * Additive and lower-risk, so it runs without a heavy confirmation gate — but the
 * agent still shows what it extracted first. Every Task gets an audit row.
 */
public with sharing class Scribe_CreateTasksInvocable {

    public class Request {
        @InvocableVariable(label='Opportunity Id') public String opportunityId;
        @InvocableVariable(label='Source Call Log Id'
            description='When provided, the cached extraction is reused instead of re-parsing.')
        public String callLogId;
        @InvocableVariable(label='Call Summary'
            description='Raw recap. Used only when no Call Log Id is supplied.')
        public String callSummary;
        @InvocableVariable(label='Rep User Id') public String repUserId;
    }

    public class Response {
        @InvocableVariable public Boolean success;
        @InvocableVariable public Integer taskCount;
        @InvocableVariable public String summary;
    }

    @InvocableMethod(label='Scribe: Create Follow-Up Tasks'
        description='Turns each commitment in the recap into a Task and audits every one.')
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
        Id callLogId = Scribe_Util.toIdOrNull(req.callLogId);

        Scribe_CallParse parse = Scribe_ExtractionService.resolve(callLogId, req.callSummary, null);

        if (parse.commitments.isEmpty()) {
            r.success = true;
            r.taskCount = 0;
            r.summary = parse.lowConfidence
                ? 'The recap was too vague to pull out any commitments — ask the rep what they promised to do next.'
                : 'No commitments were found in the recap, so no tasks were created.';
            return r;
        }

        List<Task> tasks = new List<Task>();
        for (Scribe_CallParse.Commitment c : parse.commitments) {
            Integer due = c.dueInDays != null ? c.dueInDays : Scribe_Constants.DEFAULT_TASK_DUE_DAYS;
            String prefix = c.owner == 'customer' ? 'Follow up (customer commitment): ' : 'Follow up: ';
            tasks.add(new Task(
                Subject = (prefix + c.text).abbreviate(255),
                ActivityDate = Date.today().addDays(due),
                OwnerId = repId,
                WhatId = oppId,
                Status = 'Not Started',
                Priority = 'Normal',
                Description = 'Auto-created by Scribe from a call recap. Commitment owner: ' + c.owner + '.',
                Scribe_Generated__c = true,
                Scribe_Source_Call_Log__c = callLogId
            ));
        }
        insert tasks;

        List<Scribe_Change_Log__c> audit = new List<Scribe_Change_Log__c>();
        for (Task t : tasks) {
            audit.add(Scribe_ChangeLogService.buildTaskCreated(t, callLogId, repId, false));
        }
        Scribe_ChangeLogService.insertLogs(audit);

        r.success = true;
        r.taskCount = tasks.size();
        r.summary = 'Created ' + tasks.size() + ' follow-up task(s): '
            + previewSubjects(tasks) + '.';
        return r;
    }

    private static String previewSubjects(List<Task> tasks) {
        List<String> subs = new List<String>();
        for (Task t : tasks) { subs.add('"' + t.Subject + '" (due ' + t.ActivityDate.format() + ')'); }
        return String.join(subs, '; ');
    }
}
