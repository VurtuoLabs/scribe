import { LightningElement, api } from 'lwc';

/**
 * Shared section header: title, optional description, optional record count and
 * an `actions` slot. When `collapsible` is set it renders a disclosure control
 * and fires `toggle` with the requested state; the parent owns the state so it
 * can persist or animate the region.
 */
export default class ScribeSectionHeader extends LightningElement {
    @api title = '';
    @api description;
    @api iconName;
    /** Short count/summary rendered as a quiet pill next to the title. */
    @api countLabel;
    @api collapsible = false;
    /** Left uninitialised so the default reads as "expanded" without a `true` literal. */
    @api expanded;

    get isExpanded() {
        return this.expanded !== false;
    }

    get expandedAttr() {
        return this.isExpanded ? 'true' : 'false';
    }

    get toggleIcon() {
        return this.isExpanded ? 'utility:chevrondown' : 'utility:chevronright';
    }

    get toggleAlternativeText() {
        return `${this.isExpanded ? 'Collapse' : 'Expand'} ${this.title}`;
    }

    handleToggle() {
        this.dispatchEvent(new CustomEvent('toggle', { detail: { expanded: !this.isExpanded } }));
    }
}
