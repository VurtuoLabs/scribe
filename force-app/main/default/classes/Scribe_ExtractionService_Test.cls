@IsTest
private class Scribe_ExtractionService_Test {

    @IsTest
    static void parsesRichRecap() {
        Scribe_TestUtil.stubRequirements();
        Test.startTest();
        Scribe_CallParse p = Scribe_ExtractionService.parse(Scribe_TestUtil.RICH_RECAP, 'Qualification');
        Test.stopTest();

        System.assertEquals('Positive', p.sentiment, 'Recap reads positive overall');
        System.assert(!p.commitments.isEmpty(), 'Should find at least one commitment');
        System.assert(!p.people.isEmpty(), 'Should find named people');
        System.assert(String.isNotBlank(p.objections), 'Security concern is an objection');
        System.assert(p.coveredRequirementKeys.contains('Budget'), 'Budget keyword present');
        System.assert(p.coveredRequirementKeys.contains('EconomicBuyer'), 'Economic buyer covered');
    }

    @IsTest
    static void commitmentOwnershipAndTiming() {
        Scribe_CallParse p = Scribe_ExtractionService.parse(
            'I\'ll send the deck tomorrow. They will review it next week.', null);
        System.assertEquals(2, p.commitments.size(), 'Two commitments');
        Boolean sawRep = false, sawCustomer = false;
        for (Scribe_CallParse.Commitment c : p.commitments) {
            if (c.owner == 'rep') { sawRep = true; System.assertEquals(1, c.dueInDays, 'tomorrow=1 day'); }
            if (c.owner == 'customer') { sawCustomer = true; System.assertEquals(7, c.dueInDays, 'next week=7 days'); }
        }
        System.assert(sawRep && sawCustomer, 'Both sides captured');
    }

    @IsTest
    static void negativeSentimentDetected() {
        Scribe_CallParse p = Scribe_ExtractionService.parse(
            'The prospect is frustrated, there is real pushback on pricing and the deal is stalled.', null);
        System.assertEquals('Negative', p.sentiment);
    }

    @IsTest
    static void blankRecapIsLowConfidence() {
        Scribe_CallParse p = Scribe_ExtractionService.parse('  ', null);
        System.assert(p.lowConfidence, 'Empty recap flagged low confidence');
    }

    @IsTest
    static void inferDaysVariants() {
        System.assertEquals(0, Scribe_ExtractionService.inferDueInDays('i will do it today'));
        System.assertEquals(3, Scribe_ExtractionService.inferDueInDays('by friday'));
        System.assertEquals(14, Scribe_ExtractionService.inferDueInDays('end of month'));
        System.assertEquals(5, Scribe_ExtractionService.inferDueInDays('in 5 days'));
        System.assertEquals(null, Scribe_ExtractionService.inferDueInDays('no timing here'));
    }

    @IsTest
    static void resolveUsesCachedJson() {
        Account a = Scribe_TestUtil.account();
        Opportunity o = Scribe_TestUtil.opportunity(a.Id, 'Qualification');
        Scribe_CallParse original = Scribe_ExtractionService.parse('I\'ll call tomorrow.', null);
        Scribe_Call_Log__c log = new Scribe_Call_Log__c(
            Opportunity__c = o.Id, Call_Summary__c = 'I\'ll call tomorrow.',
            Extraction_JSON__c = original.toJsonString());
        insert log;

        Scribe_CallParse resolved = Scribe_ExtractionService.resolve(log.Id, null, null);
        System.assertEquals(original.commitments.size(), resolved.commitments.size(),
            'Resolved parse matches cached parse');
    }
}
