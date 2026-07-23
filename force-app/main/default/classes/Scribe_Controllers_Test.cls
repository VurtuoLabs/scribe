@IsTest
private class Scribe_Controllers_Test {

    @TestSetup
    static void seed() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_Call_Log__c log = new Scribe_Call_Log__c(
            Opportunity__c = o.Id, Call_Summary__c = 'seed', Logged_By_Rep__c = UserInfo.getUserId());
        insert log;
        List<Scribe_Change_Log__c> logs = new List<Scribe_Change_Log__c>{
            Scribe_ChangeLogService.buildCallLogged(log, UserInfo.getUserId()),
            Scribe_ChangeLogService.buildFieldUpdate(o.Id, o.Name, 'Opportunity', 'StageName',
                'Prospecting', 'Qualification', log.Id, UserInfo.getUserId(), true)
        };
        Scribe_ChangeLogService.insertLogs(logs);
        // Stamp Related_Record_Id for the record-history queries.
        for (Scribe_Change_Log__c c : logs) { c.Related_Record_Id__c = o.Id; }
        update logs;
    }

    @IsTest
    static void changeLogConsoleQueries() {
        Test.startTest();
        List<Scribe_ChangeLogConsoleController.ChangeRow> all =
            Scribe_ChangeLogConsoleController.getChanges(null, null, null, null, null, 50);
        List<Scribe_ChangeLogConsoleController.ChangeRow> filtered =
            Scribe_ChangeLogConsoleController.getChanges(
                UserInfo.getUserId(), 'Opportunity', Scribe_Constants.CHANGE_FIELD_UPDATE,
                Date.today().addDays(-1), Date.today(), 10);
        Scribe_ChangeLogConsoleController.FilterOptions opts =
            Scribe_ChangeLogConsoleController.getFilterOptions();
        Test.stopTest();

        System.assert(all.size() >= 2, 'Seeded rows returned');
        System.assertEquals(1, filtered.size(), 'Field update filter narrows to one');
        System.assert(!opts.changeTypes.isEmpty());
    }

    @IsTest
    static void recordHistoryQueries() {
        Opportunity o = [SELECT Id FROM Opportunity LIMIT 1];
        Test.startTest();
        List<Scribe_ChangeLogConsoleController.ChangeRow> rows =
            Scribe_ChangeLogConsoleController.getChangesForRecord(o.Id);
        Integer cnt = Scribe_ChangeLogConsoleController.countForRecord(o.Id);
        Test.stopTest();
        System.assertEquals(2, rows.size());
        System.assertEquals(2, cnt);
        System.assertEquals(0, Scribe_ChangeLogConsoleController.countForRecord(null));
    }

    @IsTest
    static void homeDashboardSummary() {
        Test.startTest();
        Scribe_HomeDashboardController.Summary s = Scribe_HomeDashboardController.getSummary();
        Test.stopTest();
        System.assert(s.totalThisWeek >= 2, 'Counts this week');
        System.assert(s.totalAllTime >= 2);
        System.assertEquals(7, s.trend.size(), 'Seven-day zero-filled trend');
        System.assert(!s.byType.isEmpty());
    }

    @IsTest
    static void utilHelpers() {
        System.assertEquals(null, Scribe_Util.toIdOrNull('bad'));
        System.assertEquals(UserInfo.getUserId(), Scribe_Util.toIdOrRunningUser(''));
        System.assertEquals(50000, Scribe_Util.toAmountOrNull('$50k'));
        System.assertEquals(2000000, Scribe_Util.toAmountOrNull('2m'));
        System.assertEquals(null, Scribe_Util.toAmountOrNull('abc'));
        System.assertNotEquals(null, Scribe_Util.toDateOrNull('2026-08-01'));
        System.assertEquals(null, Scribe_Util.toDateOrNull('nope'));
        // fromJson blank path returns a fresh parse with default sentiment.
        System.assertEquals('Neutral', Scribe_CallParse.fromJson(null).sentiment);
    }
}
