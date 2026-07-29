import { LightningElement, api } from 'lwc';

/**
 * Shared status pill for Scribe.
 *
 * State is never carried by colour alone: every pill renders a text label and,
 * unless the caller opts out, an icon that matches the tone. Tones map to
 * meaning (what Scribe did / whether a human confirmed it), not to decoration.
 */
const TONE_ICONS = {
    success: 'utility:check',
    warning: 'utility:warning',
    error: 'utility:error',
    info: 'utility:info',
    accent: 'utility:edit',
    plum: 'utility:record_create',
    neutral: 'utility:dash'
};

const TONES = Object.keys(TONE_ICONS);

export default class ScribeStatusBadge extends LightningElement {
    @api label = '';
    /** success | warning | error | info | accent | plum | neutral */
    @api tone = 'neutral';
    /** Override the tone's default icon. Pass an empty string for no icon. */
    @api iconName;
    /** Native tooltip, for pills whose label is deliberately terse. */
    @api tooltip;
    @api hideIcon = false;

    get resolvedTone() {
        return TONES.includes(this.tone) ? this.tone : 'neutral';
    }

    get resolvedIcon() {
        if (this.hideIcon) {
            return undefined;
        }
        if (this.iconName !== undefined) {
            return this.iconName || undefined;
        }
        return TONE_ICONS[this.resolvedTone];
    }

    get badgeClass() {
        return `badge badge_${this.resolvedTone}`;
    }
}
