/**
 * Controller for scribeChangeLogConsole and scribeRecordHistoryBadge. Read-only:
 * the change log is an audit trail, so nothing here mutates it. Filtering is done
 * with bound variables (never string-concatenated user input) to stay injection-safe.
 */
public with sharing class Scribe_ChangeLogConsoleController {

    public class ChangeRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String changeType;
        @AuraEnabled public String objectApiName;
        @AuraEnabled public String relatedRecordId;
        @AuraEnabled public String relatedRecordName;
        @AuraEnabled public String fieldName;
        @AuraEnabled public String oldValue;
        @AuraEnabled public String newValue;
        @AuraEnabled public String repName;
        @AuraEnabled public Id sourceCallLogId;
        @AuraEnabled public String sourceCallLogName;
        @AuraEnabled public Boolean repConfirmed;
        @AuraEnabled public Datetime createdDate;
    }

    public class FilterOptions {
        @AuraEnabled public List<Map<String, String>> reps = new List<Map<String, String>>();
        @AuraEnabled public List<String> objects = new List<String>();
        @AuraEnabled public List<String> changeTypes = new List<String>();
    }

    @AuraEnabled(cacheable=true)
    public static List<ChangeRow> getChanges(String repId, String objectApiName,
            String changeType, Date startDate, Date endDate, Integer maxRows) {
        Integer lim = (maxRows == null || maxRows <= 0 || maxRows > 2000) ? 200 : maxRows;

        String soql =
            'SELECT Id, Name, Change_Type__c, Object_API_Name__c, Related_Record_Id__c, ' +
            'Related_Record_Name__c, Field_Name__c, Old_Value__c, New_Value__c, ' +
            'Created_By_Rep__r.Name, Source_Call_Log__c, Source_Call_Log__r.Name, ' +
            'Rep_Confirmed__c, CreatedDate FROM Scribe_Change_Log__c';

        List<String> clauses = new List<String>();
        Id repFilter = String.isBlank(repId) ? null : (Id) repId;
        if (repFilter != null) { clauses.add('Created_By_Rep__c = :repFilter'); }
        if (String.isNotBlank(objectApiName)) { clauses.add('Object_API_Name__c = :objectApiName'); }
        if (String.isNotBlank(changeType)) { clauses.add('Change_Type__c = :changeType'); }
        if (startDate != null) { clauses.add('CreatedDate >= :startDt'); }
        if (endDate != null) { clauses.add('CreatedDate <= :endDt'); }
        Datetime startDt = startDate == null ? null : Datetime.newInstance(startDate, Time.newInstance(0, 0, 0, 0));
        Datetime endDt = endDate == null ? null : Datetime.newInstance(endDate.addDays(1), Time.newInstance(0, 0, 0, 0));

        if (!clauses.isEmpty()) { soql += ' WHERE ' + String.join(clauses, ' AND '); }
        soql += ' ORDER BY CreatedDate DESC LIMIT :lim';

        List<ChangeRow> rows = new List<ChangeRow>();
        for (Scribe_Change_Log__c c : (List<Scribe_Change_Log__c>) Database.query(soql)) {
            rows.add(toRow(c));
        }
        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static List<ChangeRow> getChangesForRecord(String recordId) {
        List<ChangeRow> rows = new List<ChangeRow>();
        if (String.isBlank(recordId)) { return rows; }
        for (Scribe_Change_Log__c c : [
            SELECT Id, Name, Change_Type__c, Object_API_Name__c, Related_Record_Id__c,
                   Related_Record_Name__c, Field_Name__c, Old_Value__c, New_Value__c,
                   Created_By_Rep__r.Name, Source_Call_Log__c, Source_Call_Log__r.Name,
                   Rep_Confirmed__c, CreatedDate
            FROM Scribe_Change_Log__c
            WHERE Related_Record_Id__c = :recordId
            ORDER BY CreatedDate DESC LIMIT 200
        ]) {
            rows.add(toRow(c));
        }
        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static Integer countForRecord(String recordId) {
        if (String.isBlank(recordId)) { return 0; }
        return [SELECT COUNT() FROM Scribe_Change_Log__c WHERE Related_Record_Id__c = :recordId];
    }

    @AuraEnabled(cacheable=true)
    public static FilterOptions getFilterOptions() {
        FilterOptions opts = new FilterOptions();
        Set<Id> repIds = new Set<Id>();
        Set<String> objs = new Set<String>();
        for (Scribe_Change_Log__c c : [
            SELECT Created_By_Rep__c, Created_By_Rep__r.Name, Object_API_Name__c
            FROM Scribe_Change_Log__c
            WHERE CreatedDate = LAST_N_DAYS:180
            LIMIT 5000
        ]) {
            if (c.Created_By_Rep__c != null && !repIds.contains(c.Created_By_Rep__c)) {
                repIds.add(c.Created_By_Rep__c);
                opts.reps.add(new Map<String, String>{
                    'value' => c.Created_By_Rep__c, 'label' => c.Created_By_Rep__r.Name });
            }
            if (String.isNotBlank(c.Object_API_Name__c)) { objs.add(c.Object_API_Name__c); }
        }
        opts.objects = new List<String>(objs);
        opts.objects.sort();
        opts.changeTypes = new List<String>{
            Scribe_Constants.CHANGE_CALL_LOGGED, Scribe_Constants.CHANGE_FIELD_UPDATE,
            Scribe_Constants.CHANGE_TASK_CREATED, Scribe_Constants.CHANGE_STAGE_GAP_TASK,
            Scribe_Constants.CHANGE_CONTACT_CREATED };
        return opts;
    }

    private static ChangeRow toRow(Scribe_Change_Log__c c) {
        ChangeRow row = new ChangeRow();
        row.id = c.Id;
        row.name = c.Name;
        row.changeType = c.Change_Type__c;
        row.objectApiName = c.Object_API_Name__c;
        row.relatedRecordId = c.Related_Record_Id__c;
        row.relatedRecordName = c.Related_Record_Name__c;
        row.fieldName = c.Field_Name__c;
        row.oldValue = c.Old_Value__c;
        row.newValue = c.New_Value__c;
        row.repName = c.Created_By_Rep__r.Name;
        row.sourceCallLogId = c.Source_Call_Log__c;
        row.sourceCallLogName = c.Source_Call_Log__r.Name;
        row.repConfirmed = c.Rep_Confirmed__c;
        row.createdDate = c.CreatedDate;
        return row;
    }
}
