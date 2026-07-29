import {
    changeMeta,
    describeChange,
    friendlyError,
    isOverwrite,
    plural,
    recordUrl,
    relativeTime,
    valueOrBlank
} from 'c/scribeUtils';

describe('c-scribe-utils', () => {
    describe('change vocabulary', () => {
        it('marks field updates as the only overwriting change type', () => {
            expect(isOverwrite('Field Update')).toBe(true);
            expect(isOverwrite('Task Created')).toBe(false);
            expect(isOverwrite('Call Logged')).toBe(false);
        });

        it('falls back to the raw value for unknown change types', () => {
            const meta = changeMeta('Something New');
            expect(meta.label).toBe('Something New');
            expect(meta.tone).toBe('neutral');
        });

        it('describes a field update with its field and record', () => {
            expect(
                describeChange({
                    changeType: 'Field Update',
                    fieldName: 'StageName',
                    relatedRecordName: 'Acme - 50 units'
                })
            ).toBe('StageName on Acme - 50 units');
        });

        it('describes additive changes with the record name', () => {
            expect(describeChange({ changeType: 'Task Created', relatedRecordName: 'Send pricing' })).toBe(
                'Send pricing'
            );
        });
    });

    describe('value formatting', () => {
        it('renders empty values as an explicit blank marker', () => {
            expect(valueOrBlank('')).toBe('(blank)');
            expect(valueOrBlank(null)).toBe('(blank)');
            expect(valueOrBlank('Qualification')).toBe('Qualification');
        });

        it('pluralises counts', () => {
            expect(plural(1, 'change')).toBe('1 change');
            expect(plural(2, 'change')).toBe('2 changes');
            expect(plural(2, 'entry', 'entries')).toBe('2 entries');
        });

        it('builds a relative record URL only when there is an id', () => {
            expect(recordUrl('006000000000001')).toBe('/lightning/r/006000000000001/view');
            expect(recordUrl(undefined)).toBeUndefined();
        });

        it('reports recent timestamps relatively', () => {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
            expect(relativeTime(tenMinutesAgo)).toBe('10 min ago');
            expect(relativeTime(undefined)).toBe('');
        });
    });

    describe('error translation', () => {
        it('turns an access error into an actionable sentence and keeps the raw text', () => {
            const result = friendlyError({ body: { message: 'INSUFFICIENT_ACCESS_OR_READONLY' } });
            expect(result.message).toContain('Scribe Reviewer');
            expect(result.detail).toBe('INSUFFICIENT_ACCESS_OR_READONLY');
        });

        it('falls back to the caller-supplied message for unrecognised failures', () => {
            const result = friendlyError({ body: { message: 'kaboom' } }, 'Could not load.');
            expect(result.message).toBe('Could not load.');
            expect(result.detail).toBe('kaboom');
        });

        it('flattens an array of Apex page errors', () => {
            const result = friendlyError({ body: [{ message: 'one' }, { message: 'two' }] });
            expect(result.detail).toBe('one, two');
        });
    });
});
