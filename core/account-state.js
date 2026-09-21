// Firebase, never a cached display name, determines whether an account is connected.
export function accountIdentity(user) {
    if (!user || user.isAnonymous) return null;
    const provider = user.providerData?.find(p => p.providerId === 'google.com');
    return { name: user.displayName || provider?.displayName || 'Account',
        avatar: user.photoURL || provider?.photoURL || null };
}

export function renderAccountState(user, updateUserUI) {
    const identity = accountIdentity(user);
    document.querySelectorAll('[data-account-only]').forEach(el => { el.hidden = !identity; });
    document.querySelectorAll('[data-guest-only]').forEach(el => { el.hidden = !!identity; });
    const status = document.getElementById('account-status');
    if (status) status.textContent = identity ? `Connesso come ${identity.name}` : 'Modalità ospite · dati salvati su questo dispositivo';
    if (identity) updateUserUI(identity.name, identity.avatar);
    else {
        const wrap = document.getElementById('user-profile-wrap');
        if (wrap) wrap.style.display = 'none';
        const initials = document.getElementById('user-initials');
        if (initials) initials.replaceChildren();
        ['mm_is_logged_in', 'mm_user_name', 'mm_user_avatar', 'mm_user_email', 'cortex_uid', 'cortex_username', 'cortex_photo'].forEach(key => localStorage.removeItem(key));
        window._cortexUserEmail = '';
        window._fbUserId = user?.uid || null;
    }
}
