import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getChanges from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges';
import getFilterOptions from '@salesforce/apex/Scribe_ChangeLogConsoleController.getFilterOptions';

const COLUMNS = [
    { label: 'Change #', fieldName: 'name', type: 'text', fixedWidth: 110 },
    { label: 'Type', fieldName: 'changeType', type: 'text', fixedWidth: 130 },
    { label: 'Object', fieldName: 'objectApiName', type: 'text', fixedWidth: 130 },
    { label: 'Record', fieldName: 'relatedRecordName', type: 'text', wrapText: true },
    { label: 'Field', fieldName: 'fieldName', type: 'text' },
    { label: 'Before', fieldName: 'oldValue', type: 'text', wrapText: true },
    { label: 'After', fieldName: 'newValue', type: 'text', wrapText: true },
    { label: 'Rep', fieldName: 'repName', type: 'text' },
    {
        label: 'Confirmed',
        fieldName: 'repConfirmed',
        type: 'boolean',
        fixedWidth: 90
    },
    { label: 'When', fieldName: 'createdDate', type: 'date',
        typeAttributes: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'Open source call', name: 'open_call' },
                { label: 'Open changed record', name: 'open_record' }
            ]
        }
    }
];

export default class ScribeChangeLogConsole extends NavigationMixin(LightningElement) {
    columns = COLUMNS;
    @track rows = [];
    @track error;
    isLoading = false;

    repFilter = '';
    objectFilter = '';
    typeFilter = '';
    startDate = null;
    endDate = null;
    maxRows = 200;

    repOptions = [{ label: 'All reps', value: '' }];
    objectOptions = [{ label: 'All objects', value: '' }];
    typeOptions = [{ label: 'All change types', value: '' }];

    connectedCallback() {
        this.loadData();
    }

    @wire(getFilterOptions)
    wiredOptions({ data, error }) {
        if (data) {
            this.repOptions = [{ label: 'All reps', value: '' }].concat(
                (data.reps || []).map((r) => ({ label: r.label, value: r.value }))
            );
            this.objectOptions = [{ label: 'All objects', value: '' }].concat(
                (data.objects || []).map((o) => ({ label: o, value: o }))
            );
            this.typeOptions = [{ label: 'All change types', value: '' }].concat(
                (data.changeTypes || []).map((t) => ({ label: t, value: t }))
            );
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    async loadData() {
        this.isLoading = true;
        this.error = undefined;
        try {
            this.rows = await getChanges({
                repId: this.repFilter || null,
                objectApiName: this.objectFilter || null,
                changeType: this.typeFilter || null,
                startDate: this.startDate || null,
                endDate: this.endDate || null,
                maxRows: this.maxRows
            });
        } catch (e) {
            this.error = this.reduceError(e);
            this.rows = [];
        } finally {
            this.isLoading = false;
        }
    }

    handleRep(e) { this.repFilter = e.detail.value; this.loadData(); }
    handleObject(e) { this.objectFilter = e.detail.value; this.loadData(); }
    handleType(e) { this.typeFilter = e.detail.value; this.loadData(); }
    handleStart(e) { this.startDate = e.target.value; this.loadData(); }
    handleEnd(e) { this.endDate = e.target.value; this.loadData(); }

    handleReset() {
        this.repFilter = '';
        this.objectFilter = '';
        this.typeFilter = '';
        this.startDate = null;
        this.endDate = null;
        this.loadData();
    }

    handleRowAction(event) {
        const action = event.detail.action.name;
        const row = event.detail.row;
        if (action === 'open_call' && row.sourceCallLogId) {
            this.navigateTo(row.sourceCallLogId);
        } else if (action === 'open_record' && row.relatedRecordId) {
            this.navigateTo(row.relatedRecordId);
        }
    }

    navigateTo(recordId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    get hasRows() {
        return this.rows && this.rows.length > 0;
    }

    get rowCountLabel() {
        return `${this.rows.length} change${this.rows.length === 1 ? '' : 's'}`;
    }

    reduceError(error) {
        if (Array.isArray(error?.body)) {
            return error.body.map((e) => e.message).join(', ');
        }
        return error?.body?.message || error?.message || 'Unknown error';
    }
}
