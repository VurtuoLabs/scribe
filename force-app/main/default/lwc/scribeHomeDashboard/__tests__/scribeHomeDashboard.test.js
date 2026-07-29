import { createElement } from 'lwc';
import ScribeHomeDashboard from 'c/scribeHomeDashboard';
import getSummary from '@salesforce/apex/Scribe_HomeDashboardController.getSummary';
import getChanges from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges';

jest.mock('@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges', () => ({ default: jest.fn() }), {
    virtual: true
});

jest.mock(
    '@salesforce/apex/Scribe_HomeDashboardController.getSummary',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const SUMMARY = {
    totalThisWeek: 20,
    totalAllTime: 140,
    topReps: [
        { label: 'Dana Reeve', count: 12 },
        { label: 'Sam Okafor', count: 8 }
    ],
    topObjects: [
        { label: 'Opportunity', count: 11 },
        { label: 'Task', count: 9 }
    ],
    byType: [
        { label: 'Field Update', count: 5 },
        { label: 'Task Created', count: 9 },
        { label: 'Call Logged', count: 4 },
        { label: 'Contact Created', count: 2 }
    ],
    trend: [
        { label: 'Jul 23', count: 1 },
        { label: 'Jul 24', count: 4 },
        { label: 'Jul 25', count: 0 },
        { label: 'Jul 26', count: 2 },
        { label: 'Jul 27', count: 6 },
        { label: 'Jul 28', count: 3 },
        { label: 'Jul 29', count: 4 }
    ]
};

const CHANGES = [
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
        sourceCallLogId: 'a02',
        sourceCallLogName: 'CL-0007',
        sourceCallSummary: 'Talked to Dana about pricing.',
        repConfirmed: true,
        createdDate: '2026-07-29T10:00:00.000Z'
    },
    {
        id: 'a03',
        name: 'CHG-0002',
        changeType: 'Task Created',
        objectApiName: 'Task',
        relatedRecordId: '00Tx1',
        relatedRecordName: 'Send pricing sheet',
        repName: 'Dana Reeve',
        sourceCallLogId: 'a02',
        sourceCallLogName: 'CL-0007',
        sourceCallSummary: 'Talked to Dana about pricing.',
        repConfirmed: false,
        createdDate: '2026-07-29T10:01:00.000Z'
    }
];

function build() {
    const element = createElement('c-scribe-home-dashboard', { is: ScribeHomeDashboard });
    document.body.appendChild(element);
    return element;
}

function flush() {
    return Promise.resolve().then(() => Promise.resolve());
}

describe('c-scribe-home-dashboard', () => {
    beforeEach(() => {
        getChanges.mockResolvedValue(CHANGES);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('shows skeleton placeholders before any data arrives', () => {
        const element = build();
        const skeletons = element.shadowRoot.querySelectorAll('c-scribe-skeleton-loader');
        expect(skeletons.length).toBeGreaterThan(0);
        expect(element.shadowRoot.querySelector('.masthead__title').textContent).toBe(
            'What Scribe wrote this week'
        );
    });

    it('makes overwritten field values the hero KPI', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        const cards = element.shadowRoot.querySelectorAll('c-scribe-kpi-card');
        expect(cards).toHaveLength(5);

        const hero = [...cards].find((c) => c.hero);
        expect(hero.label).toBe('Field values overwritten');
        expect(hero.value).toBe(5);
        expect(hero.trendLabel).toBe("25% of this week's 20 writes");
        expect(hero.actionLabel).toBe('Review these changes');
    });

    it('rolls the additive change types into a records-created KPI', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        const cards = [...element.shadowRoot.querySelectorAll('c-scribe-kpi-card')];
        const created = cards.find((c) => c.label === 'Records created');
        expect(created.value).toBe(11);
        expect(created.supportingText).toBe('9 tasks · 2 contacts');
    });

    it('renders the change-type breakdown and the rep and object rollups as meters', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        const meters = element.shadowRoot.querySelectorAll('c-scribe-meter-bar');
        // 4 change types + 2 reps + 2 objects
        expect(meters).toHaveLength(8);
        expect(meters[0].label).toBe('Field update');
    });

    it('renders a seven-column sparkline from the daily trend', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        expect(element.shadowRoot.querySelectorAll('.spark__col')).toHaveLength(7);
    });

    it('lists the latest entries with their before and after values', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        const entries = element.shadowRoot.querySelectorAll('.entry');
        expect(entries).toHaveLength(2);
        expect(element.shadowRoot.querySelector('.diff__old').textContent).toBe('Prospecting');
        expect(element.shadowRoot.querySelector('.diff__new').textContent).toBe('Qualification');
    });

    it('filters the entry list by the change-type chips', async () => {
        const element = build();
        getSummary.emit(SUMMARY);
        await flush();

        const chips = [...element.shadowRoot.querySelectorAll('.chip')];
        const taskChip = chips.find((c) => c.textContent.trim() === 'Task created');
        taskChip.click();
        await flush();

        expect(element.shadowRoot.querySelectorAll('.entry')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.diff__old')).toBeNull();
    });

    it('explains itself instead of showing zeroes when Scribe has never written anything', async () => {
        const element = build();
        getChanges.mockResolvedValue([]);
        getSummary.emit({
            ...SUMMARY,
            totalThisWeek: 0,
            totalAllTime: 0,
            byType: [],
            topReps: [],
            topObjects: []
        });
        await flush();

        const empty = element.shadowRoot.querySelector('c-scribe-empty-state');
        expect(empty.heading).toBe("Scribe hasn't written anything yet");
        expect(element.shadowRoot.querySelectorAll('c-scribe-kpi-card')).toHaveLength(0);
    });

    it('translates an Apex failure into a friendly message with a retry', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const element = build();
        getSummary.error({ message: 'System.QueryException: boom' }, 400, 'Bad Request');
        await flush();

        const errorState = element.shadowRoot.querySelector('c-scribe-error-state');
        expect(errorState).not.toBeNull();
        expect(errorState.detail).toContain('boom');
        expect(errorState.message).not.toContain('QueryException');
        console.error.mockRestore();
    });
});
