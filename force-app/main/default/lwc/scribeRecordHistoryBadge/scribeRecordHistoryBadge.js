import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import countForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.countForRecord';
import getChangesForRecord from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChangesForRecord';
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

/**
 * Record-page annotation: what Scribe changed here, and what it was working
 * from. The newest write stays visible because that is what a reader needs
 * first; the rest is one click away.
 */
export default class ScribeRecordHistoryBadge extends NavigationMixin(LightningElement) {
    @api recordId;

    count;
    rows;
    error;
    expanded = false;
    isRefreshing = false;

    wiredCountResult;
    wiredRowsResult;

    @wire(countForRecord, { recordId: '$recordId' })
    wiredCount(result) {
        this.wiredCountResult = result;
        const { data, error } = result;
        if (data !== undefined && data !== null) {
            this.count = data;
            this.error = undefined;
        } else if (error) {
            console.error('Scribe: countForRecord failed', error);
            this.error = friendlyError(error, "We couldn't check what Scribe changed on this record.");
        }
    }

    @wire(getChangesForRecord, { recordId: '$recordId' })
    wiredRows(result) {
        this.wiredRowsResult = result;
        const { data, error } = result;
        if (data) {
            this.rows = data.map((r) => this.toRow(r));
            this.error = undefined;
        } else if (error) {
            console.error('Scribe: getChangesForRecord failed', error);
            this.error = friendlyError(error, "We couldn't load this record's Scribe history.");
        }
    }

    toRow(r) {
        const meta = changeMeta(r.changeType);
        const overwrite = isOverwrite(r.changeType);
        return {
            id: r.id,
            typeLabel: meta.label,
            typeTone: meta.tone,
            typeIcon: meta.icon,
            dotClass: `history__dot history__dot_${meta.tone}`,
            headline: describeChange(r),
            isDiff: overwrite,
            oldValue: valueOrBlank(r.oldValue),
            newValue: valueOrBlank(r.newValue),
            diffAssistive: `${r.fieldName || 'Value'} changed from ${valueOrBlank(r.oldValue)} to ${valueOrBlank(
                r.newValue
            )}`,
            confirmedLabel: r.repConfirmed ? 'Rep confirmed' : 'Auto-applied',
            confirmedTone: r.repConfirmed ? 'success' : 'neutral',
            confirmedIcon: r.repConfirmed ? 'utility:check' : 'utility:magicwand',
            confirmedTooltip: r.repConfirmed
                ? 'The rep explicitly approved this write before Scribe made it.'
                : 'An additive write that does not need confirmation.',
            relative: relativeTime(r.createdDate),
            meta: r.repName ? `Logged by ${r.repName}` : 'Logged by Scribe',
            callLogId: r.sourceCallLogId,
            callUrl: recordUrl(r.sourceCallLogId),
            callLabel: r.sourceCallLogName ? `From ${r.sourceCallLogName}` : 'View source call'
        };
    }

    get isLoading() {
        return this.count === undefined && this.rows === undefined && !this.error;
    }

    get hasChanges() {
        return (this.count || 0) > 0;
    }

    get latest() {
        return this.rows && this.rows.length ? this.rows[0] : undefined;
    }

    get olderRows() {
        return this.rows ? this.rows.slice(1) : [];
    }

    get hasMore() {
        return this.olderRows.length > 0;
    }

    get badgeLabel() {
        return `Scribe made ${plural(this.count || 0, 'change')} to this record`;
    }

    get toggleLabel() {
        return this.expanded
            ? 'Hide earlier changes'
            : `Show ${plural(this.olderRows.length, 'earlier change')}`;
    }

    get toggleIcon() {
        return this.expanded ? 'utility:chevronup' : 'utility:chevrondown';
    }

    get expandedAttr() {
        return this.expanded ? 'true' : 'false';
    }

    get refreshLabel() {
        return this.isRefreshing ? 'Refreshing Scribe history' : 'Refresh Scribe history';
    }

    /** The Apex query is capped at 200 rows; say so rather than quietly hiding. */
    get isTruncated() {
        return !!this.rows && !!this.count && this.count > this.rows.length;
    }

    get truncationNote() {
        return `Showing the ${this.rows.length} most recent of ${this.count}. Open the Scribe change log for the full history.`;
    }

    toggle() {
        this.expanded = !this.expanded;
    }

    async handleRetry() {
        if (this.isRefreshing) {
            return;
        }
        this.isRefreshing = true;
        try {
            await Promise.all([refreshApex(this.wiredCountResult), refreshApex(this.wiredRowsResult)]);
        } catch (e) {
            console.error('Scribe: record history refresh failed', e);
            this.error = friendlyError(e, "We couldn't refresh this record's Scribe history.");
        } finally {
            this.isRefreshing = false;
        }
    }

    handleOpenCall(event) {
        event.preventDefault();
        const callLogId = event.currentTarget.dataset.id;
        if (callLogId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: callLogId, actionName: 'view' }
            });
        }
    }
}
