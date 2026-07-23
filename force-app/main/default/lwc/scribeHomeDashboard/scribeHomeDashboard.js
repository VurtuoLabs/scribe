import { LightningElement, wire } from 'lwc';
import getSummary from '@salesforce/apex/Scribe_HomeDashboardController.getSummary';

export default class ScribeHomeDashboard extends LightningElement {
    summary;
    error;

    @wire(getSummary)
    wiredSummary({ data, error }) {
        if (data) {
            this.summary = data;
            this.error = undefined;
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    get totalThisWeek() {
        return this.summary ? this.summary.totalThisWeek : 0;
    }

    get totalAllTime() {
        return this.summary ? this.summary.totalAllTime : 0;
    }

    get topReps() {
        return this.summary?.topReps || [];
    }

    get topObjects() {
        return this.summary?.topObjects || [];
    }

    get byType() {
        return this.summary?.byType || [];
    }

    // Trend rows with a bar width (%) relative to the busiest day, for a lightweight chart.
    get trend() {
        const raw = this.summary?.trend || [];
        const max = raw.reduce((m, t) => Math.max(m, t.count), 0) || 1;
        return raw.map((t, i) => ({
            key: `${t.label}-${i}`,
            label: t.label,
            count: t.count,
            style: `width:${Math.round((t.count / max) * 100)}%`
        }));
    }

    get hasReps() { return this.topReps.length > 0; }
    get hasObjects() { return this.topObjects.length > 0; }

    reduceError(error) {
        return error?.body?.message || error?.message || 'Unknown error';
    }
}
