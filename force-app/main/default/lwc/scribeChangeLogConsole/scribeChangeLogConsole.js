import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getChanges from '@salesforce/apex/Scribe_ChangeLogConsoleController.getChanges';
import getFilterOptions from '@salesforce/apex/Scribe_ChangeLogConsoleController.getFilterOptions';
import {
    changeMeta,
    describeChange,
    formatDateTime,
    formatTime,
    friendlyError,
    isOverwrite,
    plural,
    recordUrl,
    valueOrBlank
} from 'c/scribeUtils';

/** Server page size, and how far "Load more" is allowed to go. */
const PAGE_SIZE = 200;
const MAX_ROWS = 1000;
/** Call groups rendered per transcript page - keeps the DOM small. */
const GROUPS_PER_PAGE = 6;

const CONFIRM_OPTIONS = [
    { label: 'All writes', value: '' },
    { label: 'Rep confirmed', value: 'confirmed' },
    { label: 'Auto-applied', value: 'auto' }
];

const VIEW_OPTIONS = [
    {
        value: 'transcript',
        label: 'Transcript',
        icon: 'utility:richtextbulletedlist'
    },
    { value: 'table', label: 'Table', icon: 'utility:table' }
];

const COLUMNS = [
    {
        label: 'Change #',
        fieldName: 'name',
        type: 'text',
        initialWidth: 110,
        sortable: true
    },
    {
        label: 'Type',
        fieldName: 'typeLabel',
        type: 'text',
        initialWidth: 130,
        sortable: true
    },
    {
        label: 'Object',
        fieldName: 'objectApiName',
        type: 'text',
        initialWidth: 120,
        sortable: true
    },
    {
        label: 'Record',
        fieldName: 'recordUrl',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'relatedRecordName' },
            target: '_self'
        },
        wrapText: true
    },
    { label: 'Field', fieldName: 'fieldName', type: 'text', sortable: true },
    { label: 'Before', fieldName: 'oldValue', type: 'text', wrapText: true },
    { label: 'After', fieldName: 'newValue', type: 'text', wrapText: true },
    { label: 'Rep', fieldName: 'repName', type: 'text', sortable: true },
    {
        label: 'Confirmed',
        fieldName: 'confirmedLabel',
        type: 'text',
        initialWidth: 130
    },
    {
        label: 'When',
        fieldName: 'createdDate',
        type: 'date',
        sortable: true,
        typeAttributes: {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }
    },
    {
        label: 'Source call',
        fieldName: 'callUrl',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'sourceCallLogName' },
            target: '_self'
        },
        initialWidth: 140
    },
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
    confirmOptions = CONFIRM_OPTIONS;

    rows = [];
    error;

    isLoading = true;
    isRefreshing = false;
    isLoadingMore = false;

    // Server-side filters (each change re-queries).
    repFilter = '';
    objectFilter = '';
    typeFilter = '';
    startDate = null;
    endDate = null;

    // Client-side filters, applied to what is already loaded.
    searchTerm = '';
    confirmFilter = '';

    view = 'transcript';
    page = 1;
    maxRows = PAGE_SIZE;
    sortedBy = 'createdDate';
    sortedDirection = 'desc';
    filtersExpanded = true;
    lastUpdated;

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
                (data.changeTypes || []).map((t) => ({
                    label: changeMeta(t).label,
                    value: t
                }))
            );
        } else if (error) {
            // The filter lists are a convenience; the log itself still loads.
            console.error('Scribe: getFilterOptions failed', error);
        }
    }

    async loadData() {
        this.error = undefined;
        try {
            const data = await getChanges({
                repId: this.repFilter || null,
                objectApiName: this.objectFilter || null,
                changeType: this.typeFilter || null,
                startDate: this.startDate || null,
                endDate: this.endDate || null,
                maxRows: this.maxRows
            });
            this.rows = (data || []).map((row) => this.toDisplayRow(row));
            this.lastUpdated = new Date();
        } catch (e) {
            console.error('Scribe: getChanges failed', e);
            this.error = friendlyError(e, "We couldn't load the change log. Nothing was modified.");
            this.rows = [];
        } finally {
            this.isLoading = false;
        }
    }

    /** One audit row, prepared once for both the transcript and the table. */
    toDisplayRow(row) {
        const meta = changeMeta(row.changeType);
        const overwrite = isOverwrite(row.changeType);
        return {
            id: row.id,
            name: row.name,
            changeType: row.changeType,
            typeLabel: meta.label,
            typeTone: meta.tone,
            typeIcon: meta.icon,
            objectApiName: row.objectApiName,
            relatedRecordId: row.relatedRecordId,
            relatedRecordName: row.relatedRecordName,
            recordLabel: row.relatedRecordName || 'Record not named',
            recordUrl: recordUrl(row.relatedRecordId),
            fieldName: row.fieldName,
            oldValue: overwrite ? valueOrBlank(row.oldValue) : row.oldValue,
            newValue: overwrite ? valueOrBlank(row.newValue) : row.newValue,
            isDiff: overwrite,
            diffAssistive: `${row.fieldName || 'Value'} changed from ${valueOrBlank(
                row.oldValue
            )} to ${valueOrBlank(row.newValue)}`,
            headline: describeChange(row),
            repName: row.repName || 'Scribe',
            repConfirmed: row.repConfirmed,
            confirmedLabel: row.repConfirmed ? 'Rep confirmed' : 'Auto-applied',
            confirmedTone: row.repConfirmed ? 'success' : 'neutral',
            confirmedIcon: row.repConfirmed ? 'utility:check' : 'utility:magicwand',
            confirmedTooltip: row.repConfirmed
                ? 'The rep explicitly approved this write before Scribe made it.'
                : 'An additive write that does not need confirmation.',
            callLogId: row.sourceCallLogId,
            sourceCallLogName: row.sourceCallLogName,
            callUrl: recordUrl(row.sourceCallLogId),
            callSummary: row.sourceCallSummary,
            createdDate: row.createdDate,
            createdTime: row.createdDate ? new Date(row.createdDate).getTime() : 0,
            when: formatDateTime(row.createdDate),
            menuLabel: `Actions for change ${row.name}`,
            noRecord: !row.relatedRecordId,
            noCall: !row.sourceCallLogId,
            searchBlob: [
                row.name,
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
                .toLowerCase()
        };
    }

    // ── Derived data ───────────────────────────────────────────────────────

    get visibleRows() {
        const term = this.searchTerm.trim().toLowerCase();
        const filtered = this.rows.filter((r) => {
            const matchesTerm = !term || r.searchBlob.includes(term);
            const matchesConfirm =
                !this.confirmFilter ||
                (this.confirmFilter === 'confirmed' ? r.repConfirmed : !r.repConfirmed);
            return matchesTerm && matchesConfirm;
        });
        return this.sortRows(filtered);
    }

    sortRows(rows) {
        const field = this.sortedBy || 'createdDate';
        const dir = this.sortedDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            if (field === 'createdDate') {
                return (a.createdTime - b.createdTime) * dir;
            }
            const av = (a[field] || '').toString().toLowerCase();
            const bv = (b[field] || '').toString().toLowerCase();
            if (av === bv) {
                return 0;
            }
            return av > bv ? dir : -dir;
        });
    }

    /** Writes grouped by the call they came from - the transcript unit. */
    get groups() {
        const groups = [];
        const index = new Map();
        this.visibleRows.forEach((row) => {
            const key = row.callLogId || 'unlinked';
            if (!index.has(key)) {
                const created = {
                    key,
                    callId: row.callLogId,
                    callName:
                        row.sourceCallLogName || (row.callLogId ? 'Call log' : 'No source call recorded'),
                    callUrl: row.callUrl,
                    summary: row.callSummary,
                    entries: [],
                    newest: row.createdTime,
                    repName: row.repName
                };
                index.set(key, created);
                groups.push(created);
            }
            const group = index.get(key);
            group.entries.push(row);
            if (!group.summary && row.callSummary) {
                group.summary = row.callSummary;
            }
            if (row.createdTime > group.newest) {
                group.newest = row.createdTime;
                group.repName = row.repName;
            }
        });
        return groups.map((g) => {
            const overwrites = g.entries.filter((e) => e.isDiff).length;
            return {
                ...g,
                meta: `${formatDateTime(g.entries[0].createdDate)} · logged by ${g.repName}`,
                writeCountLabel: plural(g.entries.length, 'write'),
                hasOverwrites: overwrites > 0,
                overwriteLabel: `${overwrites} overwrote a value`
            };
        });
    }

    get pagedGroups() {
        const start = (this.page - 1) * GROUPS_PER_PAGE;
        return this.groups.slice(start, start + GROUPS_PER_PAGE);
    }

    get pageCount() {
        return Math.max(1, Math.ceil(this.groups.length / GROUPS_PER_PAGE));
    }

    get showPager() {
        return this.groups.length > GROUPS_PER_PAGE;
    }

    get pagerLabel() {
        return `Page ${this.page} of ${this.pageCount} · ${plural(this.groups.length, 'call')}`;
    }

    get isFirstPage() {
        return this.page <= 1;
    }

    get isLastPage() {
        return this.page >= this.pageCount;
    }

    // ── Labels and state gates ─────────────────────────────────────────────

    get isTranscriptView() {
        return this.view === 'transcript';
    }

    get viewOptions() {
        return VIEW_OPTIONS.map((o) => ({
            ...o,
            pressed: this.view === o.value ? 'true' : 'false',
            class: this.view === o.value ? 'viewtoggle__btn viewtoggle__btn_on' : 'viewtoggle__btn'
        }));
    }

    get viewDescription() {
        return this.isTranscriptView
            ? 'Each call, the recap Scribe worked from, and every record it changed as a result.'
            : 'The same audit rows as a sortable grid, for scanning row by row.';
    }

    get isBusy() {
        return this.isRefreshing || this.isLoadingMore;
    }

    get isEmpty() {
        return this.visibleRows.length === 0;
    }

    get hasServerFilters() {
        return !!(this.repFilter || this.objectFilter || this.typeFilter || this.startDate || this.endDate);
    }

    get hasClientFilters() {
        return !!this.confirmFilter || this.searchTerm.trim() !== '';
    }

    get isResetDisabled() {
        return !this.hasServerFilters && !this.hasClientFilters;
    }

    get dateRangeInvalid() {
        return !!this.startDate && !!this.endDate && this.startDate > this.endDate;
    }

    get resultCountLabel() {
        if (this.isLoading || this.error) {
            return undefined;
        }
        return `${this.visibleRows.length} of ${plural(this.rows.length, 'loaded change')}`;
    }

    get loadedCountLabel() {
        if (this.isLoading || this.error) {
            return undefined;
        }
        return this.isTranscriptView
            ? plural(this.groups.length, 'call')
            : plural(this.visibleRows.length, 'row');
    }

    get filterSummary() {
        const parts = [];
        if (this.repFilter) {
            parts.push(this.labelFor(this.repOptions, this.repFilter));
        }
        if (this.objectFilter) {
            parts.push(this.objectFilter);
        }
        if (this.typeFilter) {
            parts.push(changeMeta(this.typeFilter).label);
        }
        if (this.confirmFilter) {
            parts.push(this.labelFor(CONFIRM_OPTIONS, this.confirmFilter));
        }
        if (this.startDate) {
            parts.push(`from ${this.startDate}`);
        }
        if (this.endDate) {
            parts.push(`to ${this.endDate}`);
        }
        if (this.searchTerm.trim()) {
            parts.push(`matching "${this.searchTerm.trim()}"`);
        }
        return parts.length
            ? `Filtered by ${parts.join(' · ')}.`
            : 'No filters applied - showing the newest changes.';
    }

    labelFor(options, value) {
        const found = options.find((o) => o.value === value);
        return found ? found.label : value;
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

    get canLoadMore() {
        // A full page back means there is probably more history behind it.
        return this.rows.length >= this.maxRows && this.maxRows < MAX_ROWS;
    }

    get loadMoreLabel() {
        return this.isLoadingMore ? 'Loading records…' : `Load ${PAGE_SIZE} more`;
    }

    get loadProgress() {
        const target = Math.min(this.maxRows, MAX_ROWS);
        return Math.min(100, Math.round((this.rows.length / target) * 100));
    }

    get loadMoreProgressLabel() {
        return `Loading up to ${this.maxRows} changes - ${this.rows.length} received so far.`;
    }

    get coverageLabel() {
        if (!this.rows.length) {
            return 'Nothing loaded.';
        }
        const suffix = this.canLoadMore ? ' There is likely older history behind this.' : '';
        return `Showing the ${plural(this.rows.length, 'most recent change')} for these filters.${suffix}`;
    }

    // ── Empty state copy ───────────────────────────────────────────────────

    get emptyIcon() {
        if (this.hasClientFilters) {
            return 'utility:search';
        }
        return this.hasServerFilters ? 'utility:filterList' : 'utility:record_create';
    }

    get emptyHeading() {
        if (this.hasClientFilters) {
            return 'Nothing in the loaded set matches';
        }
        return this.hasServerFilters
            ? 'No changes match these filters'
            : "Scribe hasn't written anything yet";
    }

    get emptyMessage() {
        if (this.hasClientFilters) {
            return 'Search and confirmation only look at the changes already loaded. Clear them, or widen the date range and load more history.';
        }
        if (this.hasServerFilters) {
            return 'Try a wider date range, a different rep, or all change types.';
        }
        return 'When the Scribe agent logs a call, updates an Opportunity, creates a task or adds a contact, each of those writes lands here with its before and after values.';
    }

    get emptyAction() {
        return this.hasClientFilters || this.hasServerFilters ? 'Reset filters' : 'Open call logs';
    }

    get emptyActionIcon() {
        return this.hasClientFilters || this.hasServerFilters ? 'utility:undo' : 'utility:open';
    }

    handleEmptyAction() {
        if (this.hasClientFilters || this.hasServerFilters) {
            this.handleReset();
        } else {
            this[NavigationMixin.Navigate]({
                type: 'standard__objectPage',
                attributes: { objectApiName: 'Scribe_Call_Log__c', actionName: 'list' },
                state: { filterName: 'All' }
            });
        }
    }

    // ── Handlers ───────────────────────────────────────────────────────────

    handleRep(event) {
        this.repFilter = event.detail.value;
        this.reload();
    }

    handleObject(event) {
        this.objectFilter = event.detail.value;
        this.reload();
    }

    handleType(event) {
        this.typeFilter = event.detail.value;
        this.reload();
    }

    handleStart(event) {
        this.startDate = event.target.value || null;
        this.reload();
    }

    handleEnd(event) {
        this.endDate = event.target.value || null;
        this.reload();
    }

    handleSearch(event) {
        this.searchTerm = event.target.value || '';
        this.page = 1;
    }

    handleConfirm(event) {
        this.confirmFilter = event.detail.value;
        this.page = 1;
    }

    handleFiltersToggle(event) {
        this.filtersExpanded = event.detail.expanded;
    }

    handleViewChange(event) {
        this.view = event.currentTarget.dataset.value;
        this.page = 1;
    }

    handleSort(event) {
        this.sortedBy = event.detail.fieldName;
        this.sortedDirection = event.detail.sortDirection;
    }

    handlePrevPage() {
        if (!this.isFirstPage) {
            this.page -= 1;
        }
    }

    handleNextPage() {
        if (!this.isLastPage) {
            this.page += 1;
        }
    }

    /** Re-query the server after a server-side filter changed. */
    async reload() {
        this.page = 1;
        this.isRefreshing = true;
        await this.loadData();
        this.isRefreshing = false;
    }

    async handleRefresh() {
        if (this.isBusy) {
            return;
        }
        this.isRefreshing = true;
        await this.loadData();
        this.isRefreshing = false;
        if (this.error) {
            this.toast('Refresh failed', this.error.message, 'error');
        } else {
            this.toast('Change log refreshed', this.coverageLabel, 'success');
        }
    }

    handleRetry() {
        this.handleRefresh();
    }

    async handleLoadMore() {
        if (this.isBusy || !this.canLoadMore) {
            return;
        }
        this.maxRows = Math.min(this.maxRows + PAGE_SIZE, MAX_ROWS);
        this.isLoadingMore = true;
        const before = this.rows.length;
        await this.loadData();
        this.isLoadingMore = false;
        if (this.error) {
            this.toast('Could not load more', this.error.message, 'error');
            return;
        }
        const added = this.rows.length - before;
        this.toast(
            added > 0 ? 'More history loaded' : 'Nothing older to load',
            added > 0
                ? `Added ${plural(added, 'change')}.`
                : 'You have reached the start of the audit trail.',
            added > 0 ? 'success' : 'info'
        );
    }

    handleReset() {
        this.repFilter = '';
        this.objectFilter = '';
        this.typeFilter = '';
        this.confirmFilter = '';
        this.searchTerm = '';
        this.startDate = null;
        this.endDate = null;
        this.maxRows = PAGE_SIZE;
        this.reload();
    }

    handleRowMenu(event) {
        const action = event.detail.value;
        const { record, call } = event.currentTarget.dataset;
        if (action === 'open_record' && record) {
            this.navigateTo(record);
        } else if (action === 'open_call' && call) {
            this.navigateTo(call);
        }
    }

    handleRowAction(event) {
        const action = event.detail.action.name;
        const row = event.detail.row;
        if (action === 'open_call' && row.callLogId) {
            this.navigateTo(row.callLogId);
        } else if (action === 'open_record' && row.relatedRecordId) {
            this.navigateTo(row.relatedRecordId);
        }
    }

    handleOpenRecord(event) {
        event.preventDefault();
        const recordId = event.currentTarget.dataset.id;
        if (recordId) {
            this.navigateTo(recordId);
        }
    }

    navigateTo(recordId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
