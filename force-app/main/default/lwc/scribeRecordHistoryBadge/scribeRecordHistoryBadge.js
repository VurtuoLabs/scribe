import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import countForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.countForRecord';
import getChangesForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChangesForRecord';

export default class ScribeRecordHistoryBadge extends NavigationMixin(LightningElement) {
    @api recordId;
    count = 0;
    expanded = false;
    rows = [];

    @wire(countForRecord, { recordId: '$recordId' })
    wiredCount({ data }) {
        if (data !== undefined && data !== null) {
            this.count = data;
        }
    }

    @wire(getChangesForRecord, { recordId: '$recordId' })
    wiredRows({ data }) {
        if (data) {
            this.rows = data.map((r) => ({
                id: r.id,
                title: this.describe(r),
                meta: `${r.repName || 'Scribe'} · ${new Date(r.createdDate).toLocaleDateString()}`,
                callLogId: r.sourceCallLogId
            }));
        }
    }

    describe(r) {
        if (r.changeType === 'Field Update') {
            return `${r.fieldName}: "${r.oldValue || ''}" → "${r.newValue || ''}"`;
        }
        return `${r.changeType}: ${r.relatedRecordName || ''}`;
    }

    get hasChanges() {
        return this.count > 0;
    }

    get badgeLabel() {
        return `Scribe made ${this.count} change${this.count === 1 ? '' : 's'} to this record`;
    }

    get toggleLabel() {
        return this.expanded ? 'Hide' : 'Show';
    }

    toggle() {
        this.expanded = !this.expanded;
    }

    openCall(event) {
        const callLogId = event.currentTarget.dataset.id;
        if (callLogId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: callLogId, actionName: 'view' }
            });
        }
    }
}
