import { it, expect, vi, afterEach } from 'vitest';
vi.mock('../core/i18n.js', () => ({ t: key => `translated:${key}` }));
import { updateOnlineStatus } from '../core/ui.js';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('renders offline and reconnection messages without an undefined translator', () => {
    vi.useFakeTimers();
    const badge = { style: { display: 'none' }, innerHTML: '' }, toast = {};
    vi.stubGlobal('document', { getElementById: id => id === 'offline-badge' ? badge : toast });
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('window', {});
    updateOnlineStatus();
    expect(badge.innerHTML).toBe('translated:ui_offline');
    navigator.onLine = true;
    updateOnlineStatus();
    expect(badge.style.display).toBe('none');
    expect(toast.textContent).toBe('translated:ui_reconnected');
});
