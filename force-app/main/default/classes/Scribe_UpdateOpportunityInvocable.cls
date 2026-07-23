/**
 * Topic 2 — Update Opportunity. Proposes specific field changes (Stage, Close
 * Date, Amount, Next Step) inferred from the call and, only on an explicit apply,
 * writes them field-by-field. Never writes anything the caller didn't pass, and
 * every applied change produces a Field Update audit row with before/after values.
 *
 * Two-phase by design: call with apply=false to get the proposal to show the rep,
 * then apply=true after they confirm (the topic also carries
 * require_user_confirmation, so the platform gates the write as well).
 */
public with sharing class Scribe_UpdateOpportunityInvocable {

    public class Request {
        @InvocableVariable(label='Opportunity Id' required=true)
        public String opportunityId;

        @InvocableVariable(label='Apply Changes'
            description='False = return the proposal only. True = commit the changes. Defaults to false.')
        public Boolean apply;

        @InvocableVariable(label='Source Call Log Id')
        public String callLogId;

        @InvocableVariable(label='Rep User Id')
        public String repUserId;

        @InvocableVariable(label='New Stage'
            description='Proposed StageName. Leave blank to not touch Stage.')
        public String newStage;

        @InvocableVariable(label='New Close Date'
            description='Proposed CloseDate (yyyy-MM-dd). Leave blank to not touch Close Date.')
        public String newCloseDate;

        @InvocableVariable(label='New Amount'
            description='Proposed Amount. Leave blank to not touch Amount.')
        public String newAmount;

        @InvocableVariable(label='New Next Step'
            description='Proposed NextStep text. Leave blank to not touch Next Step.')
        public String newNextStep;
    }

    public class Response {
        @InvocableVariable public Boolean success;
        @InvocableVariable public Boolean applied;
        @InvocableVariable public Integer changeCount;
        @InvocableVariable public String summary;
    }

    @InvocableMethod(label='Scribe: Update Opportunity'
        description='Proposes and (on apply) commits Opportunity field changes, auditing each one.')
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
        Boolean doApply = req.apply == true;
        Id repId = Scribe_Util.toIdOrRunningUser(req.repUserId);
        Id callLogId = Scribe_Util.toIdOrNull(req.callLogId);

        Opportunity opp = [
            SELECT Id, Name, StageName, CloseDate, Amount, NextStep
            FROM Opportunity WHERE Id = :oppId LIMIT 1
        ];

        List<String> lines = new List<String>();
        List<Scribe_Change_Log__c> audit = new List<Scribe_Change_Log__c>();
        Boolean dirty = false;

        // Stage
        if (String.isNotBlank(req.newStage) && req.newStage != opp.StageName) {
            lines.add('Stage: "' + opp.StageName + '" -> "' + req.newStage + '"');
            if (doApply) {
                audit.add(Scribe_ChangeLogService.buildFieldUpdate(oppId, opp.Name,
                    Scribe_Constants.OBJ_OPPORTUNITY, 'StageName', opp.StageName, req.newStage,
                    callLogId, repId, true));
                opp.StageName = req.newStage;
                dirty = true;
            }
        }
        // Close Date
        Date newClose = Scribe_Util.toDateOrNull(req.newCloseDate);
        if (newClose != null && newClose != opp.CloseDate) {
            lines.add('Close Date: "' + String.valueOf(opp.CloseDate) + '" -> "' + String.valueOf(newClose) + '"');
            if (doApply) {
                audit.add(Scribe_ChangeLogService.buildFieldUpdate(oppId, opp.Name,
                    Scribe_Constants.OBJ_OPPORTUNITY, 'CloseDate',
                    String.valueOf(opp.CloseDate), String.valueOf(newClose), callLogId, repId, true));
                opp.CloseDate = newClose;
                dirty = true;
            }
        }
        // Amount
        Decimal newAmt = Scribe_Util.toAmountOrNull(req.newAmount);
        if (newAmt != null && newAmt != opp.Amount) {
            lines.add('Amount: "' + String.valueOf(opp.Amount) + '" -> "' + String.valueOf(newAmt) + '"');
            if (doApply) {
                audit.add(Scribe_ChangeLogService.buildFieldUpdate(oppId, opp.Name,
                    Scribe_Constants.OBJ_OPPORTUNITY, 'Amount',
                    String.valueOf(opp.Amount), String.valueOf(newAmt), callLogId, repId, true));
                opp.Amount = newAmt;
                dirty = true;
            }
        }
        // Next Step
        if (String.isNotBlank(req.newNextStep) && req.newNextStep != opp.NextStep) {
            lines.add('Next Step: "' + (opp.NextStep == null ? '' : opp.NextStep) + '" -> "' + req.newNextStep + '"');
            if (doApply) {
                audit.add(Scribe_ChangeLogService.buildFieldUpdate(oppId, opp.Name,
                    Scribe_Constants.OBJ_OPPORTUNITY, 'NextStep',
                    opp.NextStep, req.newNextStep, callLogId, repId, true));
                opp.NextStep = req.newNextStep;
                dirty = true;
            }
        }

        r.changeCount = lines.size();
        r.success = true;

        if (lines.isEmpty()) {
            r.applied = false;
            r.summary = 'No field changes to make — the proposed values already match the record.';
            return r;
        }

        if (doApply && dirty) {
            update opp;
            Scribe_ChangeLogService.insertLogs(audit);
            r.applied = true;
            r.summary = 'Applied ' + lines.size() + ' field change(s) to ' + opp.Name + ': ' + String.join(lines, '; ') + '.';
        } else {
            r.applied = false;
            r.summary = 'Proposed change(s) for ' + opp.Name + ' (awaiting confirmation): ' + String.join(lines, '; ') + '.';
        }
        return r;
    }
}
