/**
 * Topic 5, Multi-Contact Detection. Finds people mentioned on the call who
 * aren't already Contacts on the Opportunity/Account and drafts new Contact
 * records, but only creates them on an explicit apply, since contact creation
 * has downstream effects. Each created Contact is linked to the Account, added as
 * an OpportunityContactRole, and audited as a Contact Created row.
 *
 * Two-phase: apply=false returns the drafts to show the rep; apply=true creates
 * them after confirmation (the topic also carries require_user_confirmation).
 * Candidates come from either agent-supplied drafts (contactList) or, failing
 * that, the deterministic people extraction, never invented.
 */
public with sharing class Scribe_DetectNewContactsInvocable {

    public class Request {
        @InvocableVariable(label='Opportunity Id' required=true) public String opportunityId;
        @InvocableVariable(label='Apply Changes'
            description='False = return drafts only. True = create the Contacts. Defaults to false.')
        public Boolean apply;
        @InvocableVariable(label='Source Call Log Id') public String callLogId;
        @InvocableVariable(label='Call Summary') public String callSummary;
        @InvocableVariable(label='Rep User Id') public String repUserId;
        @InvocableVariable(label='Contact Drafts'
            description='Optional. One per line as "First|Last|Title|Email". When blank, Scribe uses the people it extracted.')
        public String contactList;
    }

    public class Response {
        @InvocableVariable public Boolean success;
        @InvocableVariable public Boolean applied;
        @InvocableVariable public Integer draftCount;
        @InvocableVariable public Integer createdCount;
        @InvocableVariable public String summary;
    }

    @InvocableMethod(label='Scribe: Detect New Contacts'
        description='Drafts and (on apply) creates Contacts for new stakeholders mentioned on the call.')
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

        Opportunity opp = [SELECT Id, Name, AccountId FROM Opportunity WHERE Id = :oppId LIMIT 1];

        List<Scribe_CallParse.Person> candidates = resolveCandidates(req, callLogId);
        Set<String> existing = existingContactKeys(oppId, opp.AccountId);

        List<Scribe_CallParse.Person> drafts = new List<Scribe_CallParse.Person>();
        Set<String> seen = new Set<String>();
        for (Scribe_CallParse.Person p : candidates) {
            String key = nameKey(p.firstName, p.lastName);
            if (String.isBlank(p.lastName) || existing.contains(key) || seen.contains(key)) { continue; }
            seen.add(key);
            drafts.add(p);
        }

        r.success = true;
        r.draftCount = drafts.size();

        if (drafts.isEmpty()) {
            r.applied = false;
            r.createdCount = 0;
            r.summary = 'No new stakeholders to add, everyone mentioned is already a Contact on this deal.';
            return r;
        }

        if (!doApply) {
            r.applied = false;
            r.createdCount = 0;
            r.summary = 'New stakeholder(s) to add (awaiting confirmation): ' + describe(drafts) + '.';
            return r;
        }

        List<Contact> contacts = new List<Contact>();
        for (Scribe_CallParse.Person p : drafts) {
            contacts.add(new Contact(
                FirstName = p.firstName,
                LastName = p.lastName,
                Title = String.isBlank(p.title) ? null : p.title,
                AccountId = opp.AccountId,
                Scribe_Generated__c = true,
                Scribe_Source_Call_Log__c = callLogId
            ));
        }
        insert contacts;

        List<OpportunityContactRole> roles = new List<OpportunityContactRole>();
        List<Scribe_Change_Log__c> audit = new List<Scribe_Change_Log__c>();
        for (Contact ct : contacts) {
            roles.add(new OpportunityContactRole(
                OpportunityId = oppId, ContactId = ct.Id, Role = 'Other', IsPrimary = false));
            audit.add(Scribe_ChangeLogService.buildContactCreated(ct, callLogId, repId));
        }
        // Contact roles are helpful but must never block the audit trail.
        Database.insert(roles, false);
        Scribe_ChangeLogService.insertLogs(audit);

        r.applied = true;
        r.createdCount = contacts.size();
        r.summary = 'Created ' + contacts.size() + ' new Contact(s) on ' + opp.Name + ': ' + describe(drafts) + '.';
        return r;
    }

    private static List<Scribe_CallParse.Person> resolveCandidates(Request req, Id callLogId) {
        if (String.isNotBlank(req.contactList)) {
            return parseDrafts(req.contactList);
        }
        Scribe_CallParse parse = Scribe_ExtractionService.resolve(callLogId, req.callSummary, null);
        return parse.people;
    }

    @TestVisible
    private static List<Scribe_CallParse.Person> parseDrafts(String raw) {
        List<Scribe_CallParse.Person> out = new List<Scribe_CallParse.Person>();
        for (String line : raw.split('[\\n;]')) {
            if (String.isBlank(line)) { continue; }
            List<String> parts = line.split('\\|');
            String first = parts.size() > 0 ? parts[0].trim() : '';
            String last = parts.size() > 1 ? parts[1].trim() : '';
            String title = parts.size() > 2 ? parts[2].trim() : '';
            // "Jane Smith" in a single field → split it.
            if (String.isBlank(last) && first.contains(' ')) {
                Integer sp = first.lastIndexOf(' ');
                last = first.substring(sp + 1);
                first = first.substring(0, sp);
            }
            if (String.isNotBlank(last)) {
                out.add(new Scribe_CallParse.Person(first, last, title));
            }
        }
        return out;
    }

    private static Set<String> existingContactKeys(Id oppId, Id accountId) {
        Set<String> keys = new Set<String>();
        for (OpportunityContactRole ocr : [
            SELECT Contact.FirstName, Contact.LastName
            FROM OpportunityContactRole WHERE OpportunityId = :oppId
        ]) {
            keys.add(nameKey(ocr.Contact.FirstName, ocr.Contact.LastName));
        }
        if (accountId != null) {
            for (Contact c : [
                SELECT FirstName, LastName FROM Contact WHERE AccountId = :accountId
            ]) {
                keys.add(nameKey(c.FirstName, c.LastName));
            }
        }
        return keys;
    }

    private static String nameKey(String first, String last) {
        return ((first == null ? '' : first) + '|' + (last == null ? '' : last)).toLowerCase().trim();
    }

    private static String describe(List<Scribe_CallParse.Person> people) {
        List<String> bits = new List<String>();
        for (Scribe_CallParse.Person p : people) {
            bits.add((p.firstName + ' ' + p.lastName).trim()
                + (String.isBlank(p.title) ? '' : ' (' + p.title + ')'));
        }
        return String.join(bits, ', ');
    }
}
