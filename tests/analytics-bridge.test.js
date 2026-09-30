import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '../core/analytics.js';

afterEach(() => vi.unstubAllGlobals());

function environment(hostname = 'cortexapp.it', optedOut = false, consent = 'accepted') {
    const window = { location: { hostname }, clarity: vi.fn(), __cxLogStep: vi.fn(), gtag: vi.fn() };
    vi.stubGlobal('window', window);
    vi.stubGlobal('localStorage', { getItem: key => key === 'cortex_cookie_consent' ? consent : (optedOut && key === 'cortex_no_track' ? '1' : null) });
    return window;
}

describe('generation and study analytics delivery', () => {
    it('forwards the sequence to Clarity without transmitting event payloads', () => {
        const window = environment();
        const payload = { count: 8, flow: 'pdf_photo_text', tracking_version: 2 };
        track('cards_generated', payload);
        track('study_session_start', { card_count: 8 });
        expect(window.clarity.mock.calls).toEqual([
            ['event', 'cards_generated'], ['event', 'study_session_start']
        ]);
        expect(window.__cxLogStep).toHaveBeenNthCalledWith(1, 'cards_generated', payload);
        expect(window.gtag).toHaveBeenNthCalledWith(1, 'event', 'cards_generated', expect.objectContaining(payload));
    });

    it('respects the administrator/user opt-out for every destination', () => {
        const window = environment('cortexapp.it', true);
        track('cards_generated', { count: 8 });
        expect(window.clarity).not.toHaveBeenCalled();
        expect(window.__cxLogStep).not.toHaveBeenCalled();
        expect(window.gtag).not.toHaveBeenCalled();
    });

    it('does not send analytics before explicit consent', () => {
        const window = environment('cortexapp.it', false, null);
        track('cards_generated', { count: 8 });
        expect(window.clarity).not.toHaveBeenCalled();
        expect(window.__cxLogStep).not.toHaveBeenCalled();
        expect(window.gtag).not.toHaveBeenCalled();
    });

    it('drops personal and free-text metadata before forwarding analytics', () => {
        const window = environment();
        track('cards_generated', { count: 8, email: 'person@example.com', prompt: 'private material', flow: 'photo' });
        expect(window.__cxLogStep).toHaveBeenCalledWith('cards_generated', { count: 8, flow: 'photo' });
        expect(window.gtag).toHaveBeenCalledWith('event', 'cards_generated', expect.objectContaining({ count: 8, flow: 'photo' }));
        expect(JSON.stringify(window.gtag.mock.calls)).not.toContain('person@example.com');
        expect(JSON.stringify(window.gtag.mock.calls)).not.toContain('private material');
    });

    it('keeps Clarity failures isolated from the other analytics destinations', () => {
        const window = environment();
        window.clarity.mockImplementation(() => { throw new Error('unavailable'); });
        expect(() => track('cards_generated', { count: 8 })).not.toThrow();
        expect(window.__cxLogStep).toHaveBeenCalled();
        expect(window.gtag).toHaveBeenCalled();
    });
});
