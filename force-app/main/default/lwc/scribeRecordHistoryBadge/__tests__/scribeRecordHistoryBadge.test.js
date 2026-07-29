import { createElement } from 'lwc';
import ScribeRecordHistoryBadge from 'c/scribeRecordHistoryBadge';
import countForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.countForRecord';
import getChangesForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChangesForRecord';

jest.mock(
    '@salesforce/apex/Scribe_ChangeLogConsoleController.countForRecord',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/Scribe_ChangeLogConsoleController.getChangesForRecord',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const ROWS = [
    {
        id: 'a01',
        changeType: 'Field Update',
        fieldName: 'StageName',
        oldValue: 'Prospecting',
        newValue: 'Qualification',
        relatedRecordName: 'Acme - 50 units',
        repName: 'Dana Reeve',
        sourceCallLogId: 'a90',
        sourceCallLogName: 'CL-0007',
        repConfirmed: true,
        createdDate: '2026-07-29T10:00:00.000Z'
    },
    {
        id: 'a02',
        changeType: 'Task Created',
        relatedRecordName: 'Send pricing sheet',
        repName: 'Dana Reeve',
        sourceCallLogId: 'a90',
        sourceCallLogName: 'CL-0007',
        repConfirmed: false,
        createdDate: '2026-07-28T10:00:00.000Z'
    }
];

function build() {
    const element = createElement('c-scribe-record-history-badge', { is: ScribeRecordHistoryBadge });
    element.recordId = '006x1';
    document.body.appendChild(element);
    return element;
}

function flush() {
    return Promise.resolve().then(() => Promise.resolve());
}

describe('c-scribe-record-history-badge', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('reserves the loaded height with a skeleton while it checks', () => {
        const element = build();
        expect(element.shadowRoot.querySelector('c-scribe-skeleton-loader')).not.toBeNull();
        expect(element.shadowRoot.querySelector('.card__skeleton')).not.toBeNull();
    });

    it('renders a quiet empty state rather than nothing when Scribe never touched the record', async () => {
        const element = build();
        countForRecord.emit(0);
        getChangesForRecord.emit([]);
        await flush();

        const empty = element.shadowRoot.querySelector('c-scribe-empty-state');
        expect(empty).not.toBeNull();
        expect(empty.variant).toBe('inline');
        expect(element.shadowRoot.querySelector('.latest')).toBeNull();
    });

    it('keeps the most recent change visible and the rest behind a disclosure', async () => {
        const element = build();
        countForRecord.emit(2);
        getChangesForRecord.emit(ROWS);
        await flush();

        expect(element.shadowRoot.querySelector('.card__title').textContent).toBe(
            'Scribe made 2 changes to this record'
        );
        expect(element.shadowRoot.querySelector('.latest__headline').textContent).toBe(
            'StageName on Acme - 50 units'
        );
        expect(element.shadowRoot.querySelector('.diff__new').textContent).toBe('Qualification');
        expect(element.shadowRoot.querySelector('.history')).toBeNull();

        const toggle = element.shadowRoot.querySelector('.card__toggle lightning-button');
        expect(toggle.label).toBe('Show 1 earlier change');
        toggle.click();
        await flush();

        expect(element.shadowRoot.querySelectorAll('.history__item')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.card__toggle lightning-button').label).toBe(
            'Hide earlier changes'
        );
    });

    it('says so when the record has more history than the query returns', async () => {
        const element = build();
        countForRecord.emit(240);
        getChangesForRecord.emit(ROWS);
        await flush();

        element.shadowRoot.querySelector('.card__toggle lightning-button').click();
        await flush();

        expect(element.shadowRoot.querySelector('.history__note').textContent).toContain(
            'Showing the 2 most recent of 240'
        );
    });

    it('surfaces a friendly error with a retry instead of silently rendering nothing', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const element = build();
        countForRecord.error({ message: 'INSUFFICIENT_ACCESS_OR_READONLY' }, 400, 'Bad Request');
        await flush();

        const errorState = element.shadowRoot.querySelector('c-scribe-error-state');
        expect(errorState).not.toBeNull();
        expect(errorState.message).toContain('Scribe Reviewer');
        expect(errorState.detail).toContain('INSUFFICIENT_ACCESS');
        console.error.mockRestore();
    });
});
