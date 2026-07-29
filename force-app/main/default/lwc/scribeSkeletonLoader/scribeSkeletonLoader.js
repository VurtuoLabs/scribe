import { LightningElement, api } from 'lwc';

/**
 * Shared skeleton placeholder for Scribe.
 *
 * Every variant is sized to the same box as the content it stands in for, so
 * nothing jumps when the real data arrives. That matters most for the
 * transcript-style copy in the change log, where a naive placeholder would
 * shift the whole page on load.
 */
const VARIANTS = ['text', 'kpi', 'meter', 'timeline', 'transcript'];

// Uneven widths read as prose rather than as a stack of identical bars.
const LINE_WIDTHS = ['100%', '92%', '97%', '78%', '88%', '61%'];

export default class ScribeSkeletonLoader extends LightningElement {
    /** One of: text, kpi, meter, timeline, transcript. */
    @api variant = 'text';
    /** Text lines to render for the `text` variant. */
    @api lines = 3;
    /** Repeated rows for the meter / timeline / transcript variants. */
    @api rows = 3;
    /** Screen-reader announcement while the placeholder is on screen. */
    @api label = 'Loading content';

    get resolvedVariant() {
        return VARIANTS.includes(this.variant) ? this.variant : 'text';
    }

    get isText() {
        return this.resolvedVariant === 'text';
    }
    get isKpi() {
        return this.resolvedVariant === 'kpi';
    }
    get isMeter() {
        return this.resolvedVariant === 'meter';
    }
    get isTimeline() {
        return this.resolvedVariant === 'timeline';
    }
    get isTranscript() {
        return this.resolvedVariant === 'transcript';
    }

    get lineItems() {
        const count = Math.max(1, Number(this.lines) || 1);
        return Array.from({ length: count }, (_, i) => ({
            key: `line-${i}`,
            style: `width:${LINE_WIDTHS[i % LINE_WIDTHS.length]}`
        }));
    }

    get rowItems() {
        const count = Math.max(1, Number(this.rows) || 1);
        return Array.from({ length: count }, (_, i) => ({ key: `row-${i}` }));
    }
}
