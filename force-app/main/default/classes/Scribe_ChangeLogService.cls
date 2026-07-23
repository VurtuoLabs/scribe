/**
 * The audit backbone. Every write Scribe makes — no exceptions — funnels through
 * here so a Scribe_Change_Log__c row exists for it. This is deliberately not
 * optional or configurable: the whole point of the audit layer is that nothing
 * Scribe does is invisible.
 *
 * Methods build the rows; callers hand them to insertLogs() so a topic's write
 * and its audit row commit together and stay bulk-safe.
 */
public with sharing class Scribe_ChangeLogService {

    public static Scribe_Change_Log__c buildCallLogged(
            Scribe_Call_Log__c callLog, Id repId) {
        return base(Scribe_Constants.CHANGE_CALL_LOGGED,
                    callLog.Id, callLog.Name, Scribe_Constants.OBJ_CALL_LOG,
                    callLog.Id, repId, false);
    }

    public static Scribe_Change_Log__c buildFieldUpdate(
            Id recordId, String recordName, String objectApiName, String fieldName,
            String oldValue, String newValue, Id callLogId, Id repId, Boolean confirmed) {
        Scribe_Change_Log__c c = base(Scribe_Constants.CHANGE_FIELD_UPDATE,
                    recordId, recordName, objectApiName, callLogId, repId, confirmed);
        c.Field_Name__c = fieldName;
        c.Old_Value__c = truncate(oldValue);
        c.New_Value__c = truncate(newValue);
        return c;
    }

    public static Scribe_Change_Log__c buildTaskCreated(
            Task t, Id callLogId, Id repId, Boolean isStageGap) {
        return base(isStageGap ? Scribe_Constants.CHANGE_STAGE_GAP_TASK
                               : Scribe_Constants.CHANGE_TASK_CREATED,
                    t.Id, t.Subject, Scribe_Constants.OBJ_TASK, callLogId, repId, false);
    }

    public static Scribe_Change_Log__c buildContactCreated(
            Contact ct, Id callLogId, Id repId) {
        return base(Scribe_Constants.CHANGE_CONTACT_CREATED,
                    ct.Id, (ct.FirstName + ' ' + ct.LastName).trim(),
                    Scribe_Constants.OBJ_CONTACT, callLogId, repId, true);
    }

    /**
     * Persist the audit rows. Uses allOrNone=false so a single bad row never
     * suppresses the rest of the audit trail; failures are logged, not swallowed.
     */
    public static void insertLogs(List<Scribe_Change_Log__c> logs) {
        if (logs == null || logs.isEmpty()) { return; }
        List<Database.SaveResult> results = Database.insert(logs, false);
        for (Database.SaveResult sr : results) {
            if (!sr.isSuccess()) {
                for (Database.Error e : sr.getErrors()) {
                    System.debug(LoggingLevel.ERROR, 'Scribe change-log insert failed: ' + e.getMessage());
                }
            }
        }
    }

    private static Scribe_Change_Log__c base(
            String changeType, Id recordId, String recordName, String objectApiName,
            Id callLogId, Id repId, Boolean confirmed) {
        return new Scribe_Change_Log__c(
            Change_Type__c = changeType,
            Related_Record_Id__c = recordId,
            Related_Record_Name__c = truncateName(recordName),
            Object_API_Name__c = objectApiName,
            Source_Call_Log__c = callLogId,
            Created_By_Rep__c = repId,
            Rep_Confirmed__c = confirmed == true
        );
    }

    private static String truncate(String val) {
        if (val == null) { return null; }
        return val.length() > 32000 ? val.substring(0, 32000) : val;
    }

    private static String truncateName(String val) {
        if (val == null) { return null; }
        return val.length() > 255 ? val.substring(0, 255) : val;
    }
}
