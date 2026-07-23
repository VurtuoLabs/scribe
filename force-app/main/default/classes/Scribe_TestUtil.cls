/**
 * Shared test data factory + in-memory stage-requirement injection so tests never
 * depend on which Scribe_Stage_Requirement__mdt rows happen to exist in the org.
 */
@IsTest
public class Scribe_TestUtil {

    public static Account account() {
        Account a = new Account(Name = 'Acme Corp');
        insert a;
        return a;
    }

    public static Opportunity opportunity(Id accountId, String stage) {
        Opportunity o = new Opportunity(
            Name = 'Acme Expansion',
            StageName = stage,
            CloseDate = Date.today().addDays(30),
            Amount = 25000,
            NextStep = 'Initial follow-up',
            AccountId = accountId
        );
        insert o;
        return o;
    }

    public static Contact contact(Id accountId, String first, String last) {
        Contact c = new Contact(FirstName = first, LastName = last, AccountId = accountId);
        insert c;
        return c;
    }

    /** Point the extraction service at deterministic in-memory requirements. */
    public static void stubRequirements() {
        Scribe_ExtractionService.testRequirements = new List<Scribe_Stage_Requirement__mdt>{
            req('Qualification', 'Budget', 'Budget discussed', 'budget,price,pricing', 'Scribe: confirm budget', 3, 10),
            req('Qualification', 'Timeline', 'Timeline established', 'timeline,timeframe,go live', 'Scribe: establish timeline', 3, 20),
            req('Qualification', 'EconomicBuyer', 'Economic buyer identified', 'economic buyer,cfo,decision maker', 'Scribe: identify economic buyer', 3, 30)
        };
    }

    public static Scribe_Stage_Requirement__mdt req(String stage, String key, String label,
            String keywords, String subject, Integer due, Integer sort) {
        return new Scribe_Stage_Requirement__mdt(
            Stage_Name__c = stage,
            Requirement_Key__c = key,
            Requirement_Label__c = label,
            Detection_Keywords__c = keywords,
            Reminder_Task_Subject__c = subject,
            Reminder_Due_In_Days__c = due,
            Sort_Order__c = sort,
            Is_Active__c = true
        );
    }

    public static final String RICH_RECAP =
        'Great call with Acme. Jane Smith, their CFO, is the economic buyer and is excited about moving forward. ' +
        'Budget is around $50k. I\'ll send the pricing proposal tomorrow and we will loop in Bob Jones next week. ' +
        'They are a bit concerned about the security review timeline.';
}
