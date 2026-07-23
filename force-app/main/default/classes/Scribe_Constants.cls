/**
 * Central constants for Scribe. Keeping change-type and object names in one place
 * means the audit layer and every invocable speak exactly the same vocabulary.
 */
public with sharing class Scribe_Constants {
    // Change_Type__c picklist values (must match Scribe_Change_Log__c metadata).
    public static final String CHANGE_CALL_LOGGED = 'Call Logged';
    public static final String CHANGE_FIELD_UPDATE = 'Field Update';
    public static final String CHANGE_TASK_CREATED = 'Task Created';
    public static final String CHANGE_STAGE_GAP_TASK = 'Stage Gap Task';
    public static final String CHANGE_CONTACT_CREATED = 'Contact Created';

    // Object API names, used on change-log rows.
    public static final String OBJ_OPPORTUNITY = 'Opportunity';
    public static final String OBJ_TASK = 'Task';
    public static final String OBJ_CONTACT = 'Contact';
    public static final String OBJ_CALL_LOG = 'Scribe_Call_Log__c';

    // Default reminder due window (days) when a stage requirement doesn't specify one.
    public static final Integer DEFAULT_REMINDER_DUE_DAYS = 3;

    // Default follow-up task due window (days) when a commitment gives no timing cue.
    public static final Integer DEFAULT_TASK_DUE_DAYS = 2;
}
