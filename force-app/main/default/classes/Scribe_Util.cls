/**
 * Small shared helpers for the invocables, Id coercion and date parsing that
 * degrade gracefully instead of throwing on the loose strings an agent passes.
 */
public with sharing class Scribe_Util {

    /** Parse a string Id, returning null (not throwing) on blank/invalid input. */
    public static Id toIdOrNull(String value) {
        if (String.isBlank(value)) { return null; }
        try {
            return Id.valueOf(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    /** Parse a User Id, falling back to the running user when blank/invalid. */
    public static Id toIdOrRunningUser(String value) {
        Id parsed = toIdOrNull(value);
        return parsed != null ? parsed : UserInfo.getUserId();
    }

    /**
     * Parse a loose date string ("2026-08-01", "8/1/2026") into a Date, or null.
     * Used when the agent surfaces a close-date phrase from the recap.
     */
    public static Date toDateOrNull(String value) {
        if (String.isBlank(value)) { return null; }
        String v = value.trim();
        try {
            return Date.valueOf(v);
        } catch (Exception e) {
            // fall through to alternate formats
        }
        try {
            return Date.parse(v);
        } catch (Exception e) {
            return null;
        }
    }

    /** Parse a loose currency/number string ("$50k", "50000", "50,000") into a Decimal, or null. */
    public static Decimal toAmountOrNull(String value) {
        if (String.isBlank(value)) { return null; }
        String v = value.trim().toLowerCase().replaceAll('[\\$,\\s]', '');
        Decimal multiplier = 1;
        if (v.endsWith('k')) { multiplier = 1000; v = v.removeEnd('k'); }
        else if (v.endsWith('m')) { multiplier = 1000000; v = v.removeEnd('m'); }
        try {
            return Decimal.valueOf(v) * multiplier;
        } catch (Exception e) {
            return null;
        }
    }
}
