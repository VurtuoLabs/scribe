import { createElement } from 'lwc';
import ScribeChangeLogConsole from 'c/scribeChangeLogConsole';
import getChanges from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges';
import getFilterOptions from '@salesforce/apex/Scribe_ChangeLogConsoleController.getFilterOptions';

jest.mock('@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges', () => ({ default: jest.fn() }), {
    virtual: true
});

jest.mock(
    '@salesforce/apex/Scribe_ChangeLogConsoleController.getFilterOptions',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const ROWS = [
    {
        id: 'a01',
        name: 'CHG-0001',
        changeType: 'Field Update',
        objectApiName: 'Opportunity',
        relatedRecordId: '006x1',
        relatedRecordName: 'Acme - 50 units',
        fieldName: 'StageName',
        oldValue: 'Prospecting',
        newValue: 'Qualification',
        repName: 'Dana Reeve',
        sourceCallLogId: 'a90',
        sourceCallLogName: 'CL-0007',
        sourceCallSummary: 'Dana walked through pricing and asked for a redline review.',
        repConfirmed: true,
        createdDate: '2026-07-29T10:00:00.000Z'
    },
    {
        id: 'a02',
        name: 'CHG-0002',
        changeType: 'Task Created',
        objectApiName: 'Task',
        relatedRecordId: '00Tx1',
        relatedRecordName: 'Send pricing sheet',
        repName: 'Dana Reeve',
        sourceCallLogId: 'a90',
        sourceCallLogName: 'CL-0007',
        sourceCallSummary: 'Dana walked through pricing and asked for a redline review.',
        repConfirmed: false,
        createdDate: '2026-07-29T10:01:00.000Z'
    },
    {
        id: 'a03',
        name: 'CHG-0003',
        changeType: 'Contact Created',
        objectApiName: 'Contact',
        relatedRecordId: '003x1',
        relatedRecordName: 'Priya Raman',
        repName: 'Sam Okafor',
        sourceCallLogId: 'a91',
        sourceCallLogName: 'CL-0008',
        sourceCallSummary: 'Sam mentioned their CFO Priya would join the next call.',
        repConfirmed: true,
        createdDate: '2026-07-28T16:30:00.000Z'
    }
];

function build() {
    const element = createElement('c-scribe-change-log-console', { is: ScribeChangeLogConsole });
    document.body.appendChild(element);
    return element;
}

function flush() {
    return Promise.resolve().then(() => Promise.resolve());
}

describe('c-scribe-change-log-console', () => {
    beforeEach(() => {
        getChanges.mockResolvedValue(ROWS);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('shows a transcript-shaped skeleton on first load', () => {
        const element = build();
        const skeleton = element.shadowRoot.querySelector('c-scribe-skeleton-loader');
        expect(skeleton).not.toBeNull();
        expect(skeleton.variant).toBe('transcript');
    });

    it('groups writes under the call they came from, with the recap beside them', async () => {
        const element = build();
        await flush();

        const calls = element.shadowRoot.querySelectorAll('.call');
        expect(calls).toHaveLength(2);

        const firstRecap = element.shadowRoot.querySelector('.recap');
        expect(firstRecap.textContent).toContain('Dana walked through pricing');

        // Two writes came from the first call, one from the second.
        expect(element.shadowRoot.querySelectorAll('.write')).toHaveLength(3);
    });

    it('renders the before and after values for an overwrite only', async () => {
        const element = build();
        await flush();

        const diffs = element.shadowRoot.querySelectorAll('.diff');
        expect(diffs).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.diff__old').textContent).toBe('Prospecting');
        expect(element.shadowRoot.querySelector('.diff__new').textContent).toBe('Qualification');
    });

    it('filters the loaded set from the search box without re-querying Apex', async () => {
        const element = build();
        await flush();
        expect(getChanges).toHaveBeenCalledTimes(1);

        const search = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
            (i) => i.label === 'Search loaded changes'
        );
        search.value = 'priya';
        search.dispatchEvent(new CustomEvent('change'));
        await flush();

        expect(getChanges).toHaveBeenCalledTimes(1);
        expect(element.shadowRoot.querySelectorAll('.call')).toHaveLength(1);
        expect(element.shadowRoot.querySelectorAll('.write')).toHaveLength(1);
    });

    it('re-queries Apex when a server-side filter changes', async () => {
        const element = build();
        await flush();

        const objectCombobox = [...element.shadowRoot.querySelectorAll('lightning-combobox')].find(
            (c) => c.label === 'Object'
        );
        objectCombobox.dispatchEvent(new CustomEvent('change', { detail: { value: 'Opportunity' } }));
        await flush();

        expect(getChanges).toHaveBeenCalledTimes(2);
        expect(getChanges.mock.calls[1][0].objectApiName).toBe('Opportunity');
    });

    it('switches to a sortable datatable when the table view is chosen', async () => {
        const element = build();
        await flush();

        expect(element.shadowRoot.querySelector('lightning-datatable')).toBeNull();

        const tableToggle = [...element.shadowRoot.querySelectorAll('.viewtoggle__btn')].find(
            (b) => b.dataset.value === 'table'
        );
        tableToggle.click();
        await flush();

        const table = element.shadowRoot.querySelector('lightning-datatable');
        expect(table).not.toBeNull();
        expect(table.data).toHaveLength(3);
        expect(element.shadowRoot.querySelectorAll('.call')).toHaveLength(0);
    });

    it('offers a filter reset when the filtered result is empty', async () => {
        const element = build();
        await flush();

        const search = [...element.shadowRoot.querySelectorAll('lightning-input')].find(
            (i) => i.label === 'Search loaded changes'
        );
        search.value = 'nothing matches this';
        search.dispatchEvent(new CustomEvent('change'));
        await flush();

        const empty = element.shadowRoot.querySelector('c-scribe-empty-state');
        expect(empty.heading).toBe('Nothing in the loaded set matches');
        expect(empty.actionLabel).toBe('Reset filters');
    });

    it('explains the product instead of showing a blank table when there is no history', async () => {
        getChanges.mockResolvedValue([]);
        const element = build();
        await flush();

        const empty = element.shadowRoot.querySelector('c-scribe-empty-state');
        expect(empty.heading).toBe("Scribe hasn't written anything yet");
        expect(empty.actionLabel).toBe('Open call logs');
    });

    it('shows a friendly error with the raw Apex text kept for developers', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        getChanges.mockRejectedValue({ body: { message: 'System.LimitException: Too many SOQL rows' } });
        const element = build();
        await flush();

        const errorState = element.shadowRoot.querySelector('c-scribe-error-state');
        expect(errorState).not.toBeNull();
        expect(errorState.message).toContain('Narrow the dates');
        expect(errorState.detail).toContain('System.LimitException');
        console.error.mockRestore();
    });

    it('labels change types using the shared vocabulary in the filter list', async () => {
        const element = build();
        getFilterOptions.emit({
            reps: [{ label: 'Dana Reeve', value: '005x1' }],
            objects: ['Opportunity', 'Task'],
            changeTypes: ['Field Update', 'Task Created']
        });
        await flush();

        const typeCombobox = [...element.shadowRoot.querySelectorAll('lightning-combobox')].find(
            (c) => c.label === 'Change type'
        );
        expect(typeCombobox.options).toEqual([
            { label: 'All change types', value: '' },
            { label: 'Field update', value: 'Field Update' },
            { label: 'Task created', value: 'Task Created' }
        ]);
    });
});
