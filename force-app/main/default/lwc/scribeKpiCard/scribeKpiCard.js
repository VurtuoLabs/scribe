import { LightningElement, api } from 'lwc';

/**
 * Shared KPI card for the Scribe dashboard.
 *
 * Owns its own loading, error and empty presentation so the dashboard never has
 * to re-implement them. The `hero` variant is reserved for the single most
 * decision-critical number on the page - how many existing field values Scribe
 * overwrote - and is deliberately the only accent-filled card.
 */
const TREND_ICONS = {
    up: 'utility:arrowup',
    down: 'utility:arrowdown',
    flat: 'utility:dash'
};

export default class ScribeKpiCard extends LightningElement {
    @api label = '';
    @api value;
    @api supportingText;
    @api iconName;
    /** up | down | flat - the arrow only; meaning comes from `trendTone`. */
    @api trendDirection = 'flat';
    /** Human sentence next to the arrow, e.g. "12% of this week's writes". */
    @api trendLabel;
    /** positive | negative | neutral - up is not always good. */
    @api trendTone = 'neutral';
    @api actionLabel;
    @api actionIconName;
    @api actionVariant;
    /** Renders the accent-filled hero treatment. */
    @api hero = false;
    @api loading = false;
    /** Friendly message; the raw error goes in `errorDetail`. */
    @api errorMessage;
    @api errorDetail;
    /** Dims the card during a background refresh instead of flashing a skeleton. */
    @api refreshing = false;
    /** Shown instead of a value when there is genuinely nothing to count. */
    @api emptyValueLabel = '-';

    get displayValue() {
        if (this.value === null || this.value === undefined || this.value === '') {
            return this.emptyValueLabel;
        }
        return this.value;
    }

    get cardClass() {
        const parts = ['kpi'];
        if (this.hero) {
            parts.push('kpi_hero');
        }
        if (this.refreshing) {
            parts.push('kpi_refreshing');
        }
        return parts.join(' ');
    }

    get busyAttr() {
        return this.loading || this.refreshing ? 'true' : 'false';
    }

    get loadingLabel() {
        return `Loading ${this.label}`;
    }

    get trendIcon() {
        return TREND_ICONS[this.trendDirection] || TREND_ICONS.flat;
    }

    get trendClass() {
        return `kpi__trend kpi__trend_${this.trendTone}`;
    }

    get resolvedActionVariant() {
        if (this.actionVariant) {
            return this.actionVariant;
        }
        return this.hero ? 'inverse' : 'base';
    }

    handleAction() {
        this.dispatchEvent(new CustomEvent('action'));
    }

    handleRetry() {
        this.dispatchEvent(new CustomEvent('retry'));
    }
}
