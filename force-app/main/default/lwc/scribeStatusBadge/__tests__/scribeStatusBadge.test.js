import { createElement } from 'lwc';
import ScribeStatusBadge from 'c/scribeStatusBadge';

function build(props = {}) {
    const element = createElement('c-scribe-status-badge', { is: ScribeStatusBadge });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-scribe-status-badge', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('never relies on colour alone: renders both a label and a tone icon', () => {
        const element = build({ label: 'Rep confirmed', tone: 'success' });
        const label = element.shadowRoot.querySelector('.badge__label');
        const icon = element.shadowRoot.querySelector('lightning-icon');
        expect(label.textContent).toBe('Rep confirmed');
        expect(icon.iconName).toBe('utility:check');
    });

    it('applies the tone as a class so the pill styling stays declarative', () => {
        const element = build({ label: 'Field update', tone: 'accent' });
        expect(element.shadowRoot.querySelector('.badge_accent')).not.toBeNull();
    });

    it('falls back to the neutral tone for unknown tones', () => {
        const element = build({ label: 'Unknown', tone: 'chartreuse' });
        expect(element.shadowRoot.querySelector('.badge_neutral')).not.toBeNull();
    });

    it('can drop the icon when the label alone carries the meaning', () => {
        const element = build({ label: '4 writes', tone: 'neutral', hideIcon: true });
        expect(element.shadowRoot.querySelector('lightning-icon')).toBeNull();
        expect(element.shadowRoot.querySelector('.badge__label').textContent).toBe('4 writes');
    });
});
