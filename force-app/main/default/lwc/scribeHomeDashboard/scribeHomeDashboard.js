import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSummary from '@salesforce/apex/Scribe_HomeDashboardController.getSummary';
import getChanges from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges';
import {
    changeMeta,
    describeChange,
    friendlyError,
    isOverwrite,
    plural,
    recordUrl,
    relativeTime,
    formatTime,
    valueOrBlank
} from 'c/scribeUtils';

/** How many recent audit rows the "Latest entries" timeline reads. */
const TIMELINE_ROWS = 12;

const SORT_OPTIONS = [
    { label: 'Newest first', value: 'desc' },
    { label: 'Oldest first', value: 'asc' }
];

/** Change types that add a record rather than replace an existing value. */
const CREATION_TYPES = ['Task Created', 'Stage Gap Task', 'Contact Created'];

export default class ScribeHomeDashboard extends NavigationMixin(LightningElement) {
    // ── Weekly rollup (wired so it can be refreshed in place) ──────────────
    summary;
    summaryError;
    wiredSummary;

    // ── Latest entries (imperative, so the timeline owns its own states) ───
    entries = [];
    entriesError;
    isEntriesLoading = true;

    // ── UI state ──────────────────────────────────────────────────────────
    isRefreshing = false;
    searchTerm = '';
    typeFilter = '';
    sortDirection = 'desc';
    breakdownExpanded = true;
    repsExpanded = true;
    objectsExpanded = true;
    lastUpdated;

    sortOptions = SORT_OPTIONS;

    connectedCallback() {
        this.loadEntries();
    }

    @wire(getSummary)
    wiredSummaryHandler(result) {
        this.wiredSummary = result;
        const { data, error } = result;
        if (data) {
            this.summary = data;
            this.summaryError = undefined;
            this.lastUpdated = new Date();
        } else if (error) {
            // Keep the raw error for developers, show the rep a sentence.
            console.error('Scribe: getSummary failed', error);
            this.summaryError = friendlyError(
                error,
                "We couldn't build this week's rollup. Your data is untouched."
            );
        }
    }

    async loadEntries() {
        this.isEntriesLoading = true;
        this.entriesError = undefined;
        try {
            const rows = await getChanges({
                repId: null,
                objectApiName: null,
                changeType: null,
                startDate: null,
                endDate: null,
                maxRows: TIMELINE_ROWS
            });
            this.entries = (rows || []).map((row) => this.toEntry(row));
        } catch (e) {
            console.error('Scribe: getChanges failed', e);
            this.entriesError = friendlyError(e, "We couldn't load the latest entries.");
            this.entries = [];
        } finally {
            this.isEntriesLoading = false;
        }
    }

    /** One audit row as a timeline entry. */
    toEntry(row) {
        const meta = changeMeta(row.changeType);
        const overwrite = isOverwrite(row.changeType);
        const rep = row.repName || 'Scribe';
        const parts = [rep];
        if (row.objectApiName) {
            parts.push(row.objectApiName);
        }
        return {
            id: row.id,
            badgeLabel: meta.label,
            badgeTone: meta.tone,
            badgeIcon: meta.icon,
            dotClass: `entry__dot entry__dot_${meta.tone}`,
            headline: describeChange(row),
            isDiff: overwrite,
            oldValue: valueOrBlank(row.oldValue),
            newValue: valueOrBlank(row.newValue),
            diffAssistive: `${row.fieldName || 'Value'} changed from ${valueOrBlank(
                row.oldValue
            )} to ${valueOrBlank(row.newValue)}`,
            confirmedLabel: row.repConfirmed ? 'Rep confirmed' : 'Auto-applied',
            confirmedTone: row.repConfirmed ? 'success' : 'neutral',
            confirmedIcon: row.repConfirmed ? 'utility:check' : 'utility:magicwand',
            confirmedTooltip: row.repConfirmed
                ? 'The rep explicitly approved this write before Scribe made it.'
                : 'An additive write that does not need confirmation.',
            relative: relativeTime(row.createdDate),
            meta: parts.join(' · '),
            callLogId: row.sourceCallLogId,
            callUrl: recordUrl(row.sourceCallLogId),
            callLabel: row.sourceCallLogName ? `From ${row.sourceCallLogName}` : 'View source call',
            createdDate: row.createdDate ? new Date(row.createdDate).getTime() : 0,
            searchBlob: [
                row.relatedRecordName,
                row.fieldName,
                row.oldValue,
                row.newValue,
                row.repName,
                row.objectApiName,
                meta.label
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase(),
            changeType: row.changeType
        };
    }

    // ── Loading / error / empty gates ──────────────────────────────────────

    get isSummaryLoading() {
        return !this.summary && !this.summaryError;
    }

    get showSummaryContent() {
        return !this.summaryError;
    }

    get showGlobalEmpty() {
        return !!this.summary && this.summary.totalAllTime === 0 && !this.summaryError;
    }

    get refreshLabel() {
        return this.isRefreshing ? 'Refreshing data…' : 'Refresh';
    }

    get lastUpdatedLabel() {
        if (this.isRefreshing) {
            return 'Refreshing…';
        }
        return this.lastUpdated ? `Updated ${formatTime(this.lastUpdated)}` : 'Loading…';
    }

    // ── KPI values ─────────────────────────────────────────────────────────

    get typeCounts() {
        const counts = {};
        (this.summary?.byType || []).forEach((t) => {
            counts[t.label] = t.count;
        });
        return counts;
    }

    get totalThisWeek() {
        return this.summary ? this.summary.totalThisWeek : 0;
    }

    get totalAllTime() {
        return this.summary ? this.summary.totalAllTime : 0;
    }

    get heroValue() {
        return this.typeCounts['Field Update'] || 0;
    }

    get heroSupport() {
        return this.heroValue === 0
            ? 'Scribe replaced no existing field value this week. Every write was additive.'
            : 'Values a person had already entered, replaced by Scribe after the rep confirmed each one.';
    }

    get heroTrendLabel() {
        if (!this.totalThisWeek) {
            return undefined;
        }
        const share = Math.round((this.heroValue / this.totalThisWeek) * 100);
        return `${share}% of this week's ${plural(this.totalThisWeek, 'write')}`;
    }

    get heroTrendDirection() {
        return 'flat';
    }

    get callsLogged() {
        return this.typeCounts['Call Logged'] || 0;
    }

    get recordsCreated() {
        return CREATION_TYPES.reduce((sum, t) => sum + (this.typeCounts[t] || 0), 0);
    }

    get recordsCreatedSupport() {
        const tasks = (this.typeCounts['Task Created'] || 0) + (this.typeCounts['Stage Gap Task'] || 0);
        const contacts = this.typeCounts['Contact Created'] || 0;
        return `${plural(tasks, 'task')} · ${plural(contacts, 'contact')}`;
    }

    get totalSupport() {
        return 'Every audit row Scribe wrote since Monday.';
    }

    // ── 7-day sparkline ────────────────────────────────────────────────────

    get trendData() {
        return this.summary?.trend || [];
    }

    get sparkBars() {
        const raw = this.trendData;
        const max = raw.reduce((m, t) => Math.max(m, t.count), 0) || 1;
        return raw.map((t, i) => ({
            key: `${t.label}-${i}`,
            // A visible stub for zero days keeps the axis readable.
            style: `height:${t.count === 0 ? 3 : Math.max(8, Math.round((t.count / max) * 100))}%`,
            title: `${t.label}: ${plural(t.count, 'change')}`
        }));
    }

    get sparkAccessibleLabel() {
        const raw = this.trendData;
        if (!raw.length) {
            return 'Daily change volume for the last seven days';
        }
        return `Daily change volume, last seven days: ${raw.map((t) => `${t.label} ${t.count}`).join(', ')}`;
    }

    get sparkFirstLabel() {
        return this.trendData.length ? this.trendData[0].label : '';
    }

    get volumeTrendLabel() {
        const raw = this.trendData;
        if (!raw.length) {
            return undefined;
        }
        const today = raw[raw.length - 1].count;
        const average = Math.round(raw.reduce((sum, t) => sum + t.count, 0) / raw.length);
        return `${today} today vs ${average}/day average`;
    }

    get volumeTrendDirection() {
        const raw = this.trendData;
        if (!raw.length) {
            return 'flat';
        }
        const today = raw[raw.length - 1].count;
        const average = raw.reduce((sum, t) => sum + t.count, 0) / raw.length;
        if (today > average) {
            return 'up';
        }
        return today < average ? 'down' : 'flat';
    }

    // ── Breakdown + rollups ────────────────────────────────────────────────

    get breakdown() {
        const rows = this.summary?.byType || [];
        const max = rows.reduce((m, t) => Math.max(m, t.count), 0) || 1;
        return rows.map((t, i) => {
            const meta = changeMeta(t.label);
            return {
                key: `${t.label}-${i}`,
                label: meta.label,
                count: t.count,
                max,
                tone: meta.kind === 'overwrite' ? 'accent' : 'plum',
                hint:
                    meta.kind === 'overwrite'
                        ? 'Replaced an existing value - worth a look.'
                        : 'Additive: nothing existing was changed.'
            };
        });
    }

    get hasBreakdown() {
        return this.breakdown.length > 0;
    }

    get breakdownCountLabel() {
        return this.summary ? plural(this.totalThisWeek, 'change') : undefined;
    }

    get repRows() {
        return this.toRollupRows(this.summary?.topReps);
    }

    get objectRows() {
        return this.toRollupRows(this.summary?.topObjects);
    }

    toRollupRows(tallies) {
        const rows = tallies || [];
        const max = rows.reduce((m, t) => Math.max(m, t.count), 0) || 1;
        return rows.map((t, i) => ({
            key: `${t.label}-${i}`,
            label: t.label,
            count: t.count,
            max
        }));
    }

    get hasReps() {
        return this.repRows.length > 0;
    }

    get hasObjects() {
        return this.objectRows.length > 0;
    }

    // ── Latest entries: search, chips, sort ────────────────────────────────

    get visibleEntries() {
        const term = this.searchTerm.trim().toLowerCase();
        const filtered = this.entries.filter((e) => {
            const matchesType = !this.typeFilter || e.changeType === this.typeFilter;
            const matchesTerm = !term || e.searchBlob.includes(term);
            return matchesType && matchesTerm;
        });
        const direction = this.sortDirection === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => (a.createdDate - b.createdDate) * direction);
    }

    get hasVisibleEntries() {
        return this.visibleEntries.length > 0;
    }

    get entriesCountLabel() {
        if (this.isEntriesLoading || this.entriesError) {
            return undefined;
        }
        return plural(this.visibleEntries.length, 'entry', 'entries');
    }

    get typeChips() {
        const present = [];
        this.entries.forEach((e) => {
            if (!present.includes(e.changeType)) {
                present.push(e.changeType);
            }
        });
        if (present.length < 2) {
            return [];
        }
        const chips = [{ value: '', label: 'All' }].concat(
            present.map((t) => ({ value: t, label: changeMeta(t).label }))
        );
        return chips.map((c) => ({
            ...c,
            pressed: this.typeFilter === c.value ? 'true' : 'false',
            class: this.typeFilter === c.value ? 'chip chip_on' : 'chip'
        }));
    }

    get hasTypeChips() {
        return this.typeChips.length > 0;
    }

    get hasEntryFilters() {
        return !!this.typeFilter || this.searchTerm.trim() !== '';
    }

    get entriesEmptyIcon() {
        return this.hasEntryFilters ? 'utility:search' : 'utility:note';
    }

    get entriesEmptyHeading() {
        return this.hasEntryFilters ? 'No entries match this filter' : 'No entries logged yet';
    }

    get entriesEmptyMessage() {
        return this.hasEntryFilters
            ? 'Try a different search term, or clear the filter to see everything Scribe wrote recently.'
            : 'Recent writes will appear here as soon as Scribe logs its next call.';
    }

    get entriesEmptyAction() {
        return this.hasEntryFilters ? 'Clear filters' : undefined;
    }

    // ── Handlers ───────────────────────────────────────────────────────────

    handleSearch(event) {
        this.searchTerm = event.target.value || '';
    }

    handleSortChange(event) {
        this.sortDirection = event.detail.value;
    }

    handleTypeChip(event) {
        this.typeFilter = event.currentTarget.dataset.value || '';
    }

    handleClearEntryFilters() {
        this.searchTerm = '';
        this.typeFilter = '';
    }

    handleBreakdownToggle(event) {
        this.breakdownExpanded = event.detail.expanded;
    }

    handleRepsToggle(event) {
        this.repsExpanded = event.detail.expanded;
    }

    handleObjectsToggle(event) {
        this.objectsExpanded = event.detail.expanded;
    }

    async handleRefresh() {
        if (this.isRefreshing) {
            return;
        }
        this.isRefreshing = true;
        try {
            await Promise.all([refreshApex(this.wiredSummary), this.loadEntries()]);
            this.lastUpdated = new Date();
            if (!this.summaryError && !this.entriesError) {
                this.toast('Dashboard refreshed', 'Showing the change log as of just now.', 'success');
            }
        } catch (e) {
            console.error('Scribe: dashboard refresh failed', e);
            const friendly = friendlyError(e, "We couldn't refresh the dashboard.");
            this.toast('Refresh failed', friendly.message, 'error');
        } finally {
            this.isRefreshing = false;
        }
    }

    handleRetryEntries() {
        this.loadEntries();
    }

    handleOpenRecord(event) {
        event.preventDefault();
        const recordId = event.currentTarget.dataset.id;
        if (!recordId) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    /** Straight to the audit rows that replaced an existing value. */
    handleReviewFieldUpdates() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Scribe_Change_Log__c', actionName: 'list' },
            state: { filterName: 'Field_Updates_Only' }
        });
    }

    handleOpenConsole() {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Scribe_Change_Log' }
        });
    }

    handleOpenCallLogs() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Scribe_Call_Log__c', actionName: 'list' },
            state: { filterName: 'All' }
        });
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
