import { LightningElement, api } from 'lwc';

/**
 * Shared error state for Scribe.
 *
 * Shows a human sentence, not an Apex stack trace: the caller passes a friendly
 * `message` plus the raw `detail`, which stays collapsed behind "Technical
 * details" so a developer can still read it without the reviewer having to.
 * Fires `retry` when the user asks to try again.
 */
export default class ScribeErrorState extends LightningElement {
    @api heading = "That didn't load";
    @api message = 'Something went wrong on our side. Nothing was changed.';
    /** Raw error text, kept for developers. */
    @api detail;
    @api retryLabel = 'Try again';
    /** True while the parent is re-running the failed request. */
    @api retrying = false;
    /** `card` for a full region, `inline` for a compact strip. */
    @api variant = 'card';

    detailExpanded = false;

    get containerClass() {
        return this.variant === 'inline' ? 'err err_inline' : 'err';
    }

    get showRetry() {
        return !!this.retryLabel;
    }

    get retryButtonLabel() {
        return this.retrying ? 'Retrying…' : this.retryLabel;
    }

    get detailToggleLabel() {
        return this.detailExpanded ? 'Hide technical details' : 'Technical details';
    }

    get detailExpandedAttr() {
        return this.detailExpanded ? 'true' : 'false';
    }

    toggleDetail() {
        this.detailExpanded = !this.detailExpanded;
    }

    handleRetry() {
        this.dispatchEvent(new CustomEvent('retry'));
    }
}
