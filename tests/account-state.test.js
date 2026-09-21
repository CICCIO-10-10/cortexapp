import { describe, it, expect, vi, afterEach } from 'vitest';
import { accountIdentity, renderAccountState } from '../core/account-state.js';
afterEach(() => vi.unstubAllGlobals());
describe('account state', () => {
    it('does not confuse an anonymous Firebase session with a Google account', () => {
        expect(accountIdentity(null)).toBeNull();
        expect(accountIdentity({ isAnonymous:true, displayName:'Cached name' })).toBeNull();
        expect(accountIdentity({ uid:'a', providerData:[{providerId:'google.com', displayName:'Ada', photoURL:'https://example.test/avatar'}] })).toEqual({name:'Ada', avatar:'https://example.test/avatar'});
    });
    it('clears stale identity and logout controls when switching to guest, without deleting study data', () => {
        const account = {}, guest = {}, status = {}, wrap = {style:{}}, initials = {replaceChildren:vi.fn()};
        const removed = [];
        vi.stubGlobal('document', {querySelectorAll:s => s === '[data-account-only]' ? [account] : [guest], getElementById:id => ({'account-status':status,'user-profile-wrap':wrap,'user-initials':initials})[id]});
        vi.stubGlobal('localStorage', {removeItem:key => removed.push(key)});
        vi.stubGlobal('window', {});
        const update = vi.fn();
        renderAccountState({uid:'registered',displayName:'Ada'}, update);
        expect(account.hidden).toBe(false);
        expect(guest.hidden).toBe(true);
        expect(update).toHaveBeenCalledWith('Ada',null);
        renderAccountState({uid:'guest',isAnonymous:true}, update);
        expect(account.hidden).toBe(true);
        expect(guest.hidden).toBe(false);
        expect(wrap.style.display).toBe('none');
        expect(removed).toContain('mm_is_logged_in');
        expect(removed.every(key => !/deck|session|gamification/.test(key))).toBe(true);
        expect(window._cortexUserEmail).toBe('');
    });
});
