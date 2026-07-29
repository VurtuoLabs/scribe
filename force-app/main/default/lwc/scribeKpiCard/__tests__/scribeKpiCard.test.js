import { createElement } from 'lwc';
import ScribeKpiCard from 'c/scribeKpiCard';

function build(props = {}) {
    const element = createElement('c-scribe-kpi-card', { is: ScribeKpiCard });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-scribe-kpi-card', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('shows a skeleton inside the same card box while loading', () => {
        const element = build({ label: 'Changes written', loading: true });
        expect(element.shadowRoot.querySelector('c-scribe-skeleton-loader')).not.toBeNull();
        // The wrapper is always present, which is what prevents layout shift.
        expect(element.shadowRoot.querySelector('.kpi')).not.toBeNull();
        expect(element.shadowRoot.querySelector('.kpi__value')).toBeNull();
    });

    it('renders label, value, supporting text and trend once loaded', () => {
        const element = build({
            label: 'Field values overwritten',
            value: 7,
            supportingText: 'Replaced by Scribe.',
            trendLabel: '35% of this week',
            trendDirection: 'up'
        });
        expect(element.shadowRoot.querySelector('.kpi__label').textContent).toContain(
            'Field values overwritten'
        );
        expect(element.shadowRoot.querySelector('.kpi__value').textContent).toBe('7');
        expect(element.shadowRoot.querySelector('.kpi__support').textContent).toBe('Replaced by Scribe.');
        expect(element.shadowRoot.querySelector('.kpi__trend').textContent).toContain('35% of this week');
    });

    it('marks the hero card so only one KPI can dominate the page', () => {
        const element = build({ label: 'Overwrites', value: 2, hero: true });
        expect(element.shadowRoot.querySelector('.kpi_hero')).not.toBeNull();
    });

    it('shows a placeholder rather than a blank space when there is no value', () => {
        const element = build({ label: 'Calls logged' });
        expect(element.shadowRoot.querySelector('.kpi__value').textContent).toBe('-');
    });

    it('renders its own error state and asks the parent to retry', () => {
        const element = build({ label: 'Calls logged', errorMessage: 'We could not count these.' });
        const errorState = element.shadowRoot.querySelector('c-scribe-error-state');
        expect(errorState).not.toBeNull();
        expect(errorState.message).toBe('We could not count these.');

        const handler = jest.fn();
        element.addEventListener('retry', handler);
        errorState.dispatchEvent(new CustomEvent('retry'));
        expect(handler).toHaveBeenCalled();
    });

    it('emits action when its call to action is pressed', () => {
        const element = build({ label: 'Overwrites', value: 3, actionLabel: 'Review these changes' });
        const handler = jest.fn();
        element.addEventListener('action', handler);
        element.shadowRoot.querySelector('lightning-button').click();
        expect(handler).toHaveBeenCalled();
    });
});
