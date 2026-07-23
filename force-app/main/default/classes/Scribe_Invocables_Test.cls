@IsTest
private class Scribe_Invocables_Test {

    private static Scribe_LogCallInvocable.Request logReq(String summary, Id oppId) {
        Scribe_LogCallInvocable.Request r = new Scribe_LogCallInvocable.Request();
        r.callSummary = summary;
        r.opportunityId = oppId;
        return r;
    }

    @IsTest
    static void logCallCreatesLogAndAudit() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_TestUtil.stubRequirements();

        Test.startTest();
        List<Scribe_LogCallInvocable.Response> res =
            Scribe_LogCallInvocable.run(new List<Scribe_LogCallInvocable.Request>{
                logReq(Scribe_TestUtil.RICH_RECAP, o.Id) });
        Test.stopTest();

        System.assert(res[0].success);
        System.assert(res[0].commitmentCount > 0);
        System.assertEquals(1, [SELECT COUNT() FROM Scribe_Call_Log__c]);
        System.assertEquals(1, [SELECT COUNT() FROM Scribe_Change_Log__c
            WHERE Change_Type__c = :Scribe_Constants.CHANGE_CALL_LOGGED]);
    }

    @IsTest
    static void updateOpportunityProposeThenApply() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');

        Scribe_UpdateOpportunityInvocable.Request p = new Scribe_UpdateOpportunityInvocable.Request();
        p.opportunityId = o.Id;
        p.apply = false;
        p.newStage = 'Needs Analysis';
        p.newAmount = '$50k';
        p.newNextStep = 'Send proposal';

        Test.startTest();
        Scribe_UpdateOpportunityInvocable.Response proposeRes =
            Scribe_UpdateOpportunityInvocable.run(new List<Scribe_UpdateOpportunityInvocable.Request>{ p })[0];
        System.assertEquals(false, proposeRes.applied, 'Propose does not write');
        System.assertEquals(3, proposeRes.changeCount);
        System.assertEquals(0, [SELECT COUNT() FROM Scribe_Change_Log__c]);

        p.apply = true;
        Scribe_UpdateOpportunityInvocable.Response applyRes =
            Scribe_UpdateOpportunityInvocable.run(new List<Scribe_UpdateOpportunityInvocable.Request>{ p })[0];
        Test.stopTest();

        System.assert(applyRes.applied, 'Apply writes');
        Opportunity updated = [SELECT StageName, Amount FROM Opportunity WHERE Id = :o.Id];
        System.assertEquals('Needs Analysis', updated.StageName);
        System.assertEquals(50000, updated.Amount);
        System.assertEquals(3, [SELECT COUNT() FROM Scribe_Change_Log__c
            WHERE Change_Type__c = :Scribe_Constants.CHANGE_FIELD_UPDATE]);
    }

    @IsTest
    static void updateOpportunityBadId() {
        Scribe_UpdateOpportunityInvocable.Request p = new Scribe_UpdateOpportunityInvocable.Request();
        p.opportunityId = 'not-an-id';
        Scribe_UpdateOpportunityInvocable.Response res =
            Scribe_UpdateOpportunityInvocable.run(new List<Scribe_UpdateOpportunityInvocable.Request>{ p })[0];
        System.assertEquals(false, res.success);
    }

    @IsTest
    static void createTasksFromCommitments() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');

        Scribe_CreateTasksInvocable.Request r = new Scribe_CreateTasksInvocable.Request();
        r.opportunityId = o.Id;
        r.callSummary = 'I\'ll send pricing tomorrow. We will schedule a demo next week.';

        Test.startTest();
        Scribe_CreateTasksInvocable.Response res =
            Scribe_CreateTasksInvocable.run(new List<Scribe_CreateTasksInvocable.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(2, res.taskCount);
        System.assertEquals(2, [SELECT COUNT() FROM Task WHERE Scribe_Generated__c = true]);
        System.assertEquals(2, [SELECT COUNT() FROM Scribe_Change_Log__c
            WHERE Change_Type__c = :Scribe_Constants.CHANGE_TASK_CREATED]);
    }

    @IsTest
    static void createTasksNoCommitments() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_CreateTasksInvocable.Request r = new Scribe_CreateTasksInvocable.Request();
        r.opportunityId = o.Id;
        r.callSummary = 'Just a quick check-in, nothing new to report on this one really.';
        Scribe_CreateTasksInvocable.Response res =
            Scribe_CreateTasksInvocable.run(new List<Scribe_CreateTasksInvocable.Request>{ r })[0];
        System.assertEquals(0, res.taskCount);
    }

    @IsTest
    static void checkStageFlagsGapsAndDedupes() {
        Scribe_TestUtil.stubRequirements();
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');

        Scribe_CheckStageRequirementsInvocable.Request r = new Scribe_CheckStageRequirementsInvocable.Request();
        r.opportunityId = o.Id;
        r.callSummary = 'We talked about budget of $30k only.'; // covers Budget; Timeline + EconomicBuyer missing

        Test.startTest();
        Scribe_CheckStageRequirementsInvocable.Response res1 =
            Scribe_CheckStageRequirementsInvocable.run(
                new List<Scribe_CheckStageRequirementsInvocable.Request>{ r })[0];
        // Second run should create no duplicate reminders.
        Scribe_CheckStageRequirementsInvocable.Response res2 =
            Scribe_CheckStageRequirementsInvocable.run(
                new List<Scribe_CheckStageRequirementsInvocable.Request>{ r })[0];
        Test.stopTest();

        System.assertEquals(2, res1.missingCount, 'Timeline + EconomicBuyer missing');
        System.assertEquals(2, res1.tasksCreated);
        System.assertEquals(0, res2.tasksCreated, 'No duplicate reminders on re-run');
        System.assertEquals(2, [SELECT COUNT() FROM Scribe_Change_Log__c
            WHERE Change_Type__c = :Scribe_Constants.CHANGE_STAGE_GAP_TASK]);
    }

    @IsTest
    static void checkStageNoRequirements() {
        Scribe_ExtractionService.testRequirements = new List<Scribe_Stage_Requirement__mdt>();
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Prospecting');
        Scribe_CheckStageRequirementsInvocable.Request r = new Scribe_CheckStageRequirementsInvocable.Request();
        r.opportunityId = o.Id;
        r.callSummary = 'anything';
        Scribe_CheckStageRequirementsInvocable.Response res =
            Scribe_CheckStageRequirementsInvocable.run(
                new List<Scribe_CheckStageRequirementsInvocable.Request>{ r })[0];
        System.assertEquals(0, res.missingCount);
    }

    @IsTest
    static void detectContactsProposeThenApply() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_TestUtil.contact(a.Id, 'Existing', 'Person');

        Scribe_DetectNewContactsInvocable.Request r = new Scribe_DetectNewContactsInvocable.Request();
        r.opportunityId = o.Id;
        r.apply = false;
        r.contactList = 'Jane|Smith|CFO\nBob|Jones|VP Sales\nExisting|Person|Dup';

        Test.startTest();
        Scribe_DetectNewContactsInvocable.Response propose =
            Scribe_DetectNewContactsInvocable.run(new List<Scribe_DetectNewContactsInvocable.Request>{ r })[0];
        System.assertEquals(2, propose.draftCount, 'Existing Person deduped');
        System.assertEquals(0, [SELECT COUNT() FROM Contact WHERE Scribe_Generated__c = true]);

        r.apply = true;
        Scribe_DetectNewContactsInvocable.Response applied =
            Scribe_DetectNewContactsInvocable.run(new List<Scribe_DetectNewContactsInvocable.Request>{ r })[0];
        Test.stopTest();

        System.assert(applied.applied);
        System.assertEquals(2, applied.createdCount);
        System.assertEquals(2, [SELECT COUNT() FROM Contact WHERE Scribe_Generated__c = true]);
        System.assertEquals(2, [SELECT COUNT() FROM OpportunityContactRole WHERE OpportunityId = :o.Id]);
        System.assertEquals(2, [SELECT COUNT() FROM Scribe_Change_Log__c
            WHERE Change_Type__c = :Scribe_Constants.CHANGE_CONTACT_CREATED]);
    }

    @IsTest
    static void detectContactsAutoFromSummary() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_DetectNewContactsInvocable.Request r = new Scribe_DetectNewContactsInvocable.Request();
        r.opportunityId = o.Id;
        r.apply = true;
        r.callSummary = 'Met with Jane Smith and Bob Jones on the call.';
        Scribe_DetectNewContactsInvocable.Response res =
            Scribe_DetectNewContactsInvocable.run(new List<Scribe_DetectNewContactsInvocable.Request>{ r })[0];
        System.assert(res.createdCount >= 2, 'Both names created from summary');
    }
}
