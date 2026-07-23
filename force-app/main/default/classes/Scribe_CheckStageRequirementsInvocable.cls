/**
 * Topic 4 — Flag Missing Info. Compares what the deal has actually covered
 * (across this recap and every prior Scribe call log on the Opportunity) against
 * what the current stage requires per Scribe_Stage_Requirement__mdt, and creates
 * a reminder Task for whatever is still missing. Turns Scribe from a passive
 * notetaker into something that actively catches deal risk. Each reminder Task is
 * audited as a Stage Gap Task.
 */
public with sharing class Scribe_CheckStageRequirementsInvocable {

    public class Request {
        @InvocableVariable(label='Opportunity Id' required=true) public String opportunityId;
        @InvocableVariable(label='Source Call Log Id') public String callLogId;
        @InvocableVariable(label='Call Summary'
            description='Raw recap. Used only when no Call Log Id is supplied.')
        public String callSummary;
        @InvocableVariable(label='Rep User Id') public String repUserId;
    }

    public class Response {
        @InvocableVariable public Boolean success;
        @InvocableVariable public Integer missingCount;
        @InvocableVariable public Integer tasksCreated;
        @InvocableVariable public String summary;
    }

    @InvocableMethod(label='Scribe: Check Stage Requirements'
        description='Flags stage requirements the deal has not covered and creates reminder Tasks.')
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            out.add(handle(req));
        }
        return out;
    }

    private static Response handle(Request req) {
        Response r = new Response();
        Id oppId = Scribe_Util.toIdOrNull(req.opportunityId);
        if (oppId == null) {
            r.success = false;
            r.summary = 'No valid Opportunity Id was provided.';
            return r;
        }
        Id repId = Scribe_Util.toIdOrRunningUser(req.repUserId);
        Id callLogId = Scribe_Util.toIdOrNull(req.callLogId);

        Opportunity opp = [SELECT Id, Name, StageName, OwnerId FROM Opportunity WHERE Id = :oppId LIMIT 1];

        List<Scribe_Stage_Requirement__mdt> reqs =
            Scribe_ExtractionService.loadRequirements(opp.StageName);
        if (reqs.isEmpty()) {
            r.success = true;
            r.missingCount = 0;
            r.tasksCreated = 0;
            r.summary = 'No stage requirements are configured for stage "' + opp.StageName + '", so nothing to flag.';
            return r;
        }

        // Coverage across this recap plus all prior call logs on the deal.
        String corpus = buildCorpus(oppId, callLogId, req.callSummary).toLowerCase();
        Set<String> covered = Scribe_ExtractionService.coveredRequirementKeys(corpus, opp.StageName);

        List<Scribe_Stage_Requirement__mdt> missing = new List<Scribe_Stage_Requirement__mdt>();
        for (Scribe_Stage_Requirement__mdt req0 : reqs) {
            if (!covered.contains(req0.Requirement_Key__c)) { missing.add(req0); }
        }

        r.success = true;
        r.missingCount = missing.size();

        if (missing.isEmpty()) {
            r.tasksCreated = 0;
            r.summary = 'Everything the "' + opp.StageName + '" stage needs looks covered. No gaps to flag.';
            return r;
        }

        // Build reminder tasks, skipping gaps that already have an open Scribe reminder.
        Set<String> wantedSubjects = new Set<String>();
        Map<String, Scribe_Stage_Requirement__mdt> bySubject = new Map<String, Scribe_Stage_Requirement__mdt>();
        for (Scribe_Stage_Requirement__mdt m : missing) {
            String subj = subjectFor(m);
            wantedSubjects.add(subj);
            bySubject.put(subj, m);
        }
        Set<String> existing = new Set<String>();
        for (Task t : [
            SELECT Subject FROM Task
            WHERE WhatId = :oppId AND Scribe_Generated__c = true
              AND IsClosed = false AND Subject IN :wantedSubjects
        ]) {
            existing.add(t.Subject);
        }

        List<Task> tasks = new List<Task>();
        for (String subj : bySubject.keySet()) {
            if (existing.contains(subj)) { continue; }
            Scribe_Stage_Requirement__mdt m = bySubject.get(subj);
            Integer due = m.Reminder_Due_In_Days__c != null
                ? Integer.valueOf(m.Reminder_Due_In_Days__c)
                : Scribe_Constants.DEFAULT_REMINDER_DUE_DAYS;
            tasks.add(new Task(
                Subject = subj.abbreviate(255),
                ActivityDate = Date.today().addDays(due),
                OwnerId = repId,
                WhatId = oppId,
                Status = 'Not Started',
                Priority = 'High',
                Description = 'Scribe flagged this as missing for the "' + opp.StageName
                    + '" stage: ' + m.Requirement_Label__c + '.',
                Scribe_Generated__c = true,
                Scribe_Source_Call_Log__c = callLogId
            ));
        }

        List<String> missingLabels = new List<String>();
        for (Scribe_Stage_Requirement__mdt m : missing) { missingLabels.add(m.Requirement_Label__c); }

        if (tasks.isEmpty()) {
            r.tasksCreated = 0;
            r.summary = 'Still missing for "' + opp.StageName + '": ' + String.join(missingLabels, ', ')
                + ' — reminders already exist, so no duplicates were created.';
            return r;
        }

        insert tasks;
        List<Scribe_Change_Log__c> audit = new List<Scribe_Change_Log__c>();
        for (Task t : tasks) {
            audit.add(Scribe_ChangeLogService.buildTaskCreated(t, callLogId, repId, true));
        }
        Scribe_ChangeLogService.insertLogs(audit);

        r.tasksCreated = tasks.size();
        r.summary = 'Stage "' + opp.StageName + '" is missing: ' + String.join(missingLabels, ', ')
            + '. Created ' + tasks.size() + ' reminder task(s).';
        return r;
    }

    private static String subjectFor(Scribe_Stage_Requirement__mdt m) {
        return String.isNotBlank(m.Reminder_Task_Subject__c)
            ? m.Reminder_Task_Subject__c
            : 'Scribe: address "' + m.Requirement_Label__c + '"';
    }

    private static String buildCorpus(Id oppId, Id currentLogId, String callSummary) {
        List<String> parts = new List<String>();
        if (String.isNotBlank(callSummary)) { parts.add(callSummary); }
        for (Scribe_Call_Log__c log : [
            SELECT Call_Summary__c FROM Scribe_Call_Log__c
            WHERE Opportunity__c = :oppId
            ORDER BY CreatedDate DESC LIMIT 50
        ]) {
            if (String.isNotBlank(log.Call_Summary__c)) { parts.add(log.Call_Summary__c); }
        }
        return String.join(parts, '\n');
    }
}
