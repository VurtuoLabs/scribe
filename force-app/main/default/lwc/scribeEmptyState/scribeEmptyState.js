import { LightningElement, api } from 'lwc';

/**
 * Shared empty state for Scribe: a relevant icon, a short explanation of why
 * the region is empty, and - when the user can actually do something about it - 
 * a single action button. Used by the dashboard, the change-log console and the
 * record badge so no Scribe surface ever renders a blank card.
 *
 * Fires `action` when the button is pressed; the parent decides what that means.
 */
export default class ScribeEmptyState extends LightningElement {
    @api iconName = 'utility:note';
    @api heading = 'Nothing here yet';
    @api message;
    @api actionLabel;
    @api actionIconName;
    @api actionVariant = 'brand-outline';
    /** `card` for a full region, `inline` for a compact one-line note. */
    @api variant = 'card';

    get isInline() {
        return this.variant === 'inline';
    }

    get containerClass() {
        return this.isInline ? 'es es_inline' : 'es';
    }

    get resolvedIconSize() {
        return this.isInline ? 'x-small' : 'small';
    }

    handleAction() {
        this.dispatchEvent(new CustomEvent('action'));
    }
}
