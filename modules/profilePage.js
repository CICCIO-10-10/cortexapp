import { t } from '../core/i18n.js';
/**
 * profilePage.js — UI pagina profilo Cortex
 *
 * Renderizza il profilo proprio o di un altro utente.
 * Gestisce la parte manuale (form edit) e mostra la parte AI generata.
 */

import { TRANSLATIONS } from '../data/translations.js';
const _t = () => TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it;

import {
    getProfile, saveProfile,
    followUser, unfollowUser, isFollowing,
    sendFriendRequest, isFriend,
    discoverByUniversity, discoverByCorso,
    getSharedDecks, challengeFriendOnDeck,
} from '../services/socialProfile.js';

// ─── Render profilo ───────────────────────────────────────────────────────────

export async function renderProfilePage(targetUid = null) {
    const myUid = localStorage.getItem('cortex_uid');
    const isOwnProfile = !targetUid || targetUid === myUid;
    const uid = isOwnProfile ? myUid : targetUid;

    const container = document.getElementById('profile-page') || document.getElementById('page-profile');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af">Caricamento profilo...</div>`;

    const profile = await getProfile(uid);

    if (!profile) {
        if (isOwnProfile) {
            container.innerHTML = _renderSetupPrompt();
            return;
        }
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af">Profilo non trovato.</div>`;
        return;
    }

    const following = isOwnProfile ? false : await isFollowing(uid);
    const friend = isOwnProfile ? false : await isFriend(uid);
    const sharedDecks = (!isOwnProfile && friend) ? await getSharedDecks(uid) : [];

    container.innerHTML = _renderProfile(profile, { isOwnProfile, following, friend, sharedDecks });
    _bindProfileEvents(container, profile, { isOwnProfile, uid, following, friend, sharedDecks });
}

function _renderProfile(p, { isOwnProfile, following, friend, sharedDecks }) {
    const avatar = p.photoURL
        ? `<img src="${p.photoURL}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #7c3aed">`
        : `<div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;font-size:2.2rem;font-weight:700;color:#fff;border:3px solid #7c3aed">${(p.displayName||'?')[0].toUpperCase()}</div>`;

    return `
    <div style="max-width:480px;margin:0 auto;padding:20px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">

        <!-- Header profilo -->
        <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-block;margin-bottom:12px">${avatar}</div>
            <h2 style="color:var(--text);font-size:1.3rem;font-weight:700;margin:0 0 4px">${p.displayName || t('profile_unnamed')}</h2>
            ${p.university ? `<div style="color:#8b5cf6;font-size:0.85rem;font-weight:500">${p.university}${p.corso ? ` · ${p.corso}` : ''}</div>` : ''}
            ${p.bio ? `<p style="color:#9ca3af;font-size:0.88rem;margin:10px 0 0;line-height:1.5">${p.bio}</p>` : ''}
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
            ${_statBox(p.streak || 0, 'Streak 🔥')}
            ${_statBox(p.totalCards || 0, t('profile_cards'))}
            ${_statBox(p.publicDecks || 0, t('profile_public_decks'))}
        </div>

        <!-- Follower/Following/Amici -->
        <div style="display:flex;justify-content:center;gap:24px;margin-bottom:20px">
            <div style="text-align:center">
                <div style="color:var(--text);font-weight:700;font-size:1.1rem">${p.followersCount || 0}</div>
                <div style="color:#9ca3af;font-size:0.75rem">Follower</div>
            </div>
            <div style="text-align:center">
                <div style="color:var(--text);font-weight:700;font-size:1.1rem">${p.followingCount || 0}</div>
                <div style="color:#9ca3af;font-size:0.75rem">Seguiti</div>
            </div>
            <div style="text-align:center">
                <div style="color:var(--text);font-weight:700;font-size:1.1rem">${p.friendsCount || 0}</div>
                <div style="color:#9ca3af;font-size:0.75rem">Amici</div>
            </div>
        </div>

        <!-- Info studio -->
        ${(p.materiaPreferita || p.annoCorso || p.studyStyle) ? `
        <div style="background:#1a1030;border:1px solid #2d2050;border-radius:16px;padding:16px;margin-bottom:20px">
            ${p.materiaPreferita || p.annoCorso ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${p.studyStyle ? '10px' : '0'}">
                ${p.annoCorso ? `<span style="background:#2d1f5e;color:#8b5cf6;padding:4px 12px;border-radius:99px;font-size:0.8rem">${p.annoCorso} anno</span>` : ''}
                ${p.materiaPreferita ? `<span style="background:#2d1f5e;color:#8b5cf6;padding:4px 12px;border-radius:99px;font-size:0.8rem">❤️ ${p.materiaPreferita}</span>` : ''}
            </div>` : ''}
            ${p.studyStyle ? `<div style="color:#9ca3af;font-size:0.85rem;line-height:1.5;font-style:italic">"${p.studyStyle}"</div>` : ''}
        </div>
        ` : ''}

        <!-- Azioni -->
        ${isOwnProfile ? `
            <div style="display:flex;flex-direction:column;gap:10px">
                <button id="btn-edit-profile" style="${_btnStyle('#7c3aed')}">✏️ Modifica profilo</button>
            </div>
        ` : `
            <div style="display:flex;flex-direction:column;gap:10px">
                ${friend
                    ? `<button id="btn-challenge" style="${_btnStyle('#059669')}">⚔️ Sfidami${sharedDecks.length > 0 ? ` su ${sharedDecks[0]}` : ''}</button>`
                    : `<button id="btn-friend-req" style="${_btnStyle('#7c3aed')}">👋 Invia richiesta di amicizia</button>`
                }
                <button id="btn-follow" style="${_btnStyle(following ? '#374151' : '#4b3f72', '#fff')}">
                    ${following ? (_t().following||'✓ Seguito') : (_t().follow||'+ Segui')}
                </button>
            </div>

            ${sharedDecks.length > 0 ? `
            <div style="margin-top:16px;background:#1a1030;border-radius:12px;padding:12px">
                <div style="color:#9ca3af;font-size:0.78rem;margin-bottom:8px">📚 Mazzi in comune</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${sharedDecks.map(d => `<span style="background:#2d1f5e;color:#8b5cf6;padding:4px 10px;border-radius:99px;font-size:0.78rem">${d}</span>`).join('')}
                </div>
            </div>
            ` : ''}
        `}

        <!-- Mazzi pubblici -->
        <div id="profile-public-decks" style="margin-top:24px"></div>

        <!-- Discovery -->
        ${isOwnProfile && (p.university || p.corso) ? `
        <div id="profile-discovery" style="margin-top:24px"></div>
        ` : ''}
    </div>`;
}

// ─── Binding eventi ───────────────────────────────────────────────────────────

function _bindProfileEvents(container, profile, { isOwnProfile, uid, following, friend, sharedDecks }) {
    if (isOwnProfile) {
        container.querySelector('#btn-edit-profile')?.addEventListener('click', () => {
            _showEditModal(profile);
        });

        // Carica discovery
        _loadDiscovery(container, profile);

    } else {
        container.querySelector('#btn-follow')?.addEventListener('click', async (e) => {
            if (following) {
                await unfollowUser(uid);
                e.target.textContent = (_t().follow||'+ Segui');
                e.target.style.background = '#4b3f72';
            } else {
                await followUser(uid);
                e.target.textContent = (_t().following||'✓ Seguito');
                e.target.style.background = '#374151';
            }
        });

        container.querySelector('#btn-friend-req')?.addEventListener('click', async (e) => {
            e.target.disabled = true;
            await sendFriendRequest(uid);
            e.target.textContent = '✓ Richiesta inviata';
        });

        container.querySelector('#btn-challenge')?.addEventListener('click', () => {
            const deck = sharedDecks[0] || null;
            challengeFriendOnDeck(uid, deck);
        });
    }

    // Carica mazzi pubblici
    _loadPublicDecks(container, uid);
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function _showEditModal(profile) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;background:#0008;
        display:flex;align-items:flex-end;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#0f0c1a;border-radius:24px 24px 0 0;padding:24px;width:100%;max-width:480px;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h3 style="color:var(--text);margin:0;font-size:1.1rem">Modifica profilo</h3>
                <button id="modal-close" style="background:none;border:none;color:#9ca3af;font-size:1.4rem;cursor:pointer">✕</button>
            </div>

            ${_field('Nome', 'edit-name', profile.displayName, 'Il tuo nome', 50)}
            ${_field('Bio', 'edit-bio', profile.bio, 'Raccontati in 150 caratteri...', 150, true)}
            ${_field('Università', 'edit-uni', profile.university, 'es. Università di Bologna', 80)}
            ${_field('Corso di laurea', 'edit-corso', profile.corso, 'es. Medicina, Giurisprudenza...', 80)}
            ${_field('Anno', 'edit-anno', profile.annoCorso, 'es. 1°, 2°, Magistrale...', 20)}
            ${_field('Materia preferita', 'edit-materia', profile.materiaPreferita, 'es. Anatomia, Diritto privato...', 60)}
            ${_field('Il tuo stile di studio', 'edit-style', profile.studyStyle, 'Come studi? Quando? Con quale metodo?', 200, true)}

            <label style="display:flex;align-items:center;gap:10px;margin:16px 0;cursor:pointer">
                <input type="checkbox" id="edit-public" ${profile.isPublic !== false ? 'checked' : ''}
                    style="width:18px;height:18px;accent-color:#7c3aed">
                <span style="color:#9ca3af;font-size:0.88rem">Profilo pubblico (visibile nella Discovery)</span>
            </label>

            <button id="modal-save" style="${_btnStyle('#7c3aed')}">Salva</button>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#modal-save').addEventListener('click', async (e) => {
        e.target.textContent = (_t().saving||'Salvataggio...');
        e.target.disabled = true;

        const ok = await saveProfile({
            displayName:      modal.querySelector('#edit-name').value,
            bio:              modal.querySelector('#edit-bio').value,
            university:       modal.querySelector('#edit-uni').value,
            corso:            modal.querySelector('#edit-corso').value,
            annoCorso:        modal.querySelector('#edit-anno').value,
            materiaPreferita: modal.querySelector('#edit-materia').value,
            studyStyle:       modal.querySelector('#edit-style').value,
            isPublic:         modal.querySelector('#edit-public').checked,
        });

        modal.remove();
        if (ok) {
            if (window.showToast) window.showToast(t('profile_updated'), 'success');
            renderProfilePage();
        }
    });
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function _loadDiscovery(container, profile) {
    const slot = container.querySelector('#profile-discovery');
    if (!slot) return;

    const peers = profile.corso
        ? await discoverByCorso(profile.corso, 5)
        : await discoverByUniversity(profile.university, 5);

    if (peers.length === 0) return;

    slot.innerHTML = `
        <div style="margin-bottom:10px">
            <span style="color:#9ca3af;font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:1px">
                👥 Studenti del tuo ${profile.corso ? 'corso' : 'ateneo'}
            </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
            ${peers.map(p => `
                <div data-uid="${p.uid}" class="peer-card" style="
                    display:flex;align-items:center;gap:12px;
                    background:#1a1030;border-radius:12px;padding:10px 14px;
                    cursor:pointer;border:1px solid #2d2050;
                ">
                    <div style="width:40px;height:40px;border-radius:50%;background:#4b3f72;
                                display:flex;align-items:center;justify-content:center;
                                color:#fff;font-weight:700;flex-shrink:0">
                        ${(p.displayName||'?')[0].toUpperCase()}
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="color:var(--text);font-weight:600;font-size:0.9rem">${p.displayName}</div>
                        ${p.aiStyleLabel ? `<div style="color:#6b7280;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.aiStyleLabel}</div>` : ''}
                    </div>
                    <div style="color:#8b5cf6;font-size:0.75rem;flex-shrink:0">${p.streak || 0}🔥</div>
                </div>
            `).join('')}
        </div>
    `;

    slot.querySelectorAll('.peer-card').forEach(card => {
        card.addEventListener('click', () => {
            renderProfilePage(card.dataset.uid);
        });
    });
}

// ─── Mazzi pubblici ───────────────────────────────────────────────────────────

async function _loadPublicDecks(container, uid) {
    const slot = container.querySelector('#profile-public-decks');
    if (!slot || typeof firebase === 'undefined') return;

    try {
        const snap = await firebase.firestore()
            .collection('publicDecks')
            .where('ownerUid', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(6)
            .get();

        if (snap.empty) return;

        slot.innerHTML = `
            <div style="margin-bottom:10px">
                <span style="color:#9ca3af;font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:1px">📚 Mazzi pubblici</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
                ${snap.docs.map(d => {
                    const deck = d.data();
                    return `
                    <div style="background:#1a1030;border-radius:12px;padding:12px 14px;border:1px solid #2d2050">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div style="color:var(--text);font-weight:600;font-size:0.9rem">${deck.name}</div>
                            <div style="color:#6b7280;font-size:0.78rem">${deck.cardCount || 0} carte</div>
                        </div>
                        ${deck.description ? `<div style="color:#9ca3af;font-size:0.78rem;margin-top:4px">${deck.description}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        `;
    } catch (e) {
        console.warn('[ProfilePage] Errore caricamento mazzi pubblici:', e);
    }
}

// ─── Setup prompt (primo accesso) ─────────────────────────────────────────────

function _renderSetupPrompt() {
    return `
    <div style="text-align:center;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <div style="font-size:3rem;margin-bottom:16px">🧠</div>
        <h2 style="color:var(--text);font-size:1.2rem;margin:0 0 8px">Crea il tuo profilo</h2>
        <p style="color:#9ca3af;font-size:0.88rem;margin:0 0 24px;line-height:1.5">
            Il tuo stile di studio verrà analizzato dall'AI.<br>Tu aggiungi solo i dettagli che vuoi.
        </p>
        <button id="btn-create-profile" style="${_btnStyle('#7c3aed')}">✨ Crea profilo</button>
    </div>`;
}

// ─── Utils UI ─────────────────────────────────────────────────────────────────

function _statBox(value, label) {
    return `
    <div style="background:#1a1030;border-radius:12px;padding:12px;text-align:center;border:1px solid #2d2050">
        <div style="color:var(--text);font-weight:800;font-size:1.2rem">${value}</div>
        <div style="color:#6b7280;font-size:0.72rem;margin-top:2px">${label}</div>
    </div>`;
}

function _field(label, id, value, placeholder, maxLength, isTextarea = false) {
    const base = `id="${id}" placeholder="${placeholder}" maxlength="${maxLength}"
        style="width:100%;padding:12px;border-radius:10px;border:1px solid #4b3f72;
               background:#1a1030;color:#fff;font-size:0.9rem;
               box-sizing:border-box;resize:vertical;outline:none;margin-top:6px"`;
    return `
    <div style="margin-bottom:14px">
        <label style="color:#9ca3af;font-size:0.82rem">${label}</label><br>
        ${isTextarea
            ? `<textarea ${base} rows="3">${value || ''}</textarea>`
            : `<input type="text" ${base} value="${value || ''}">`
        }
    </div>`;
}

function _btnStyle(bg, color = '#fff') {
    return `width:100%;padding:14px;background:${bg};color:${color};border:none;
            border-radius:14px;font-size:0.95rem;font-weight:600;cursor:pointer;`;
}
