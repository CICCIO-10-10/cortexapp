import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '../core/analytics.js';

afterEach(() => vi.unstubAllGlobals());

function environment(hostname = 'cortexapp.it', optedOut = false) {
    const window = { location: { hostname }, clarity: vi.fn(), __cxLogStep: vi.fn(), gtag: vi.fn() };
    vi.stubGlobal('window', window);
    vi.stubGlobal('localStorage', { getItem: () => optedOut ? '1' : null });
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
        expect(window.gtag).toHaveBeenCalledWith('event', 'cards_generated', payload);
    });

    it('respects the administrator/user opt-out for every destination', () => {
        const window = environment('cortexapp.it', true);
        track('cards_generated', { count: 8 });
        expect(window.clarity).not.toHaveBeenCalled();
        expect(window.__cxLogStep).not.toHaveBeenCalled();
        expect(window.gtag).not.toHaveBeenCalled();
    });

    it('keeps Clarity failures isolated from the other analytics destinations', () => {
        const window = environment();
        window.clarity.mockImplementation(() => { throw new Error('unavailable'); });
        expect(() => track('cards_generated', { count: 8 })).not.toThrow();
        expect(window.__cxLogStep).toHaveBeenCalled();
        expect(window.gtag).toHaveBeenCalled();
    });
});
