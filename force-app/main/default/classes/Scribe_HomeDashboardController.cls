/**
 * Controller for scribeHomeDashboard. Read-only aggregate rollups off the change
 * log: total changes this week, most active reps, most-touched objects, a
 * by-type breakdown, and a simple daily trend.
 */
public with sharing class Scribe_HomeDashboardController {

    public class Tally {
        @AuraEnabled public String label;
        @AuraEnabled public Integer count;
        public Tally(String label, Integer count) { this.label = label; this.count = count; }
    }

    public class Summary {
        @AuraEnabled public Integer totalThisWeek = 0;
        @AuraEnabled public Integer totalAllTime = 0;
        @AuraEnabled public List<Tally> topReps = new List<Tally>();
        @AuraEnabled public List<Tally> topObjects = new List<Tally>();
        @AuraEnabled public List<Tally> byType = new List<Tally>();
        @AuraEnabled public List<Tally> trend = new List<Tally>();
    }

    @AuraEnabled(cacheable=true)
    public static Summary getSummary() {
        Summary s = new Summary();

        s.totalThisWeek = [SELECT COUNT() FROM Scribe_Change_Log__c WHERE CreatedDate = THIS_WEEK];
        s.totalAllTime = [SELECT COUNT() FROM Scribe_Change_Log__c];

        for (AggregateResult ar : [
            SELECT Created_By_Rep__r.Name repName, COUNT(Id) cnt
            FROM Scribe_Change_Log__c
            WHERE CreatedDate = THIS_WEEK AND Created_By_Rep__c != null
            GROUP BY Created_By_Rep__r.Name
            ORDER BY COUNT(Id) DESC
            LIMIT 5
        ]) {
            s.topReps.add(new Tally((String) ar.get('repName'), (Integer) ar.get('cnt')));
        }

        for (AggregateResult ar : [
            SELECT Object_API_Name__c obj, COUNT(Id) cnt
            FROM Scribe_Change_Log__c
            WHERE CreatedDate = THIS_WEEK AND Object_API_Name__c != null
            GROUP BY Object_API_Name__c
            ORDER BY COUNT(Id) DESC
            LIMIT 5
        ]) {
            s.topObjects.add(new Tally((String) ar.get('obj'), (Integer) ar.get('cnt')));
        }

        for (AggregateResult ar : [
            SELECT Change_Type__c ct, COUNT(Id) cnt
            FROM Scribe_Change_Log__c
            WHERE CreatedDate = THIS_WEEK AND Change_Type__c != null
            GROUP BY Change_Type__c
            ORDER BY COUNT(Id) DESC
        ]) {
            s.byType.add(new Tally((String) ar.get('ct'), (Integer) ar.get('cnt')));
        }

        // 7-day trend, oldest first, zero-filled.
        Map<Date, Integer> counts = new Map<Date, Integer>();
        for (AggregateResult ar : [
            SELECT DAY_ONLY(CreatedDate) d, COUNT(Id) cnt
            FROM Scribe_Change_Log__c
            WHERE CreatedDate = LAST_N_DAYS:7
            GROUP BY DAY_ONLY(CreatedDate)
        ]) {
            counts.put((Date) ar.get('d'), (Integer) ar.get('cnt'));
        }
        for (Integer i = 6; i >= 0; i--) {
            Date d = Date.today().addDays(-i);
            s.trend.add(new Tally(d.format(), counts.containsKey(d) ? counts.get(d) : 0));
        }
        return s;
    }
}
