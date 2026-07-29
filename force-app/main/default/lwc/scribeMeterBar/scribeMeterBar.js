import { LightningElement, api } from 'lwc';

/**
 * Shared horizontal meter used for the dashboard's "what Scribe wrote"
 * breakdown and the per-rep / per-object rollups.
 *
 * The bar is decorative reinforcement only: the label, the count and the share
 * are always present as text, and the track carries an aria-label so a screen
 * reader gets the same information without the graphic.
 */
export default class ScribeMeterBar extends LightningElement {
    @api label = '';
    @api value = 0;
    /** Denominator for the bar width. Falls back to the value itself. */
    @api max = 0;
    /** accent | plum | neutral */
    @api tone = 'accent';
    @api hint;
    @api showPercent = false;

    get numericValue() {
        const n = Number(this.value);
        return Number.isFinite(n) ? n : 0;
    }

    get numericMax() {
        const n = Number(this.max);
        return Number.isFinite(n) && n > 0 ? n : this.numericValue || 1;
    }

    get percent() {
        return Math.round((this.numericValue / this.numericMax) * 100);
    }

    get percentLabel() {
        return `${this.percent}%`;
    }

    get fillStyle() {
        // A hairline minimum keeps a non-zero count visible.
        const width = this.numericValue > 0 ? Math.max(this.percent, 2) : 0;
        return `width:${width}%`;
    }

    get trackClass() {
        return `meter__track meter__track_${this.tone}`;
    }

    get accessibleLabel() {
        return `${this.label}: ${this.numericValue} of ${this.numericMax} (${this.percentLabel})`;
    }
}
