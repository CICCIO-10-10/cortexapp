/**
 * socialProfile.js — Cortex Social Profile System
 *
 * Profilo 100% manuale — scritto interamente dall'utente.
 *
 * STRUTTURA PROFILO:
 *   → foto, nome display, bio (max 150 char), università, corso,
 *     anno di corso, materia preferita, stile di studio (testo libero)
 *
 * SOCIAL GRAPH:
 *   Follow    → per sconosciuti (Instagram-style, unidirezionale)
 *   Amicizia  → per chi conosci (bidirezionale, richiesta + accettazione)
 *
 * DISCOVERY:
 *   Trova persone della stessa università o corso
 *   Sfida amici su mazzi in comune
 */

// ─── Struttura dati profilo ───────────────────────────────────────────────────

const EMPTY_PROFILE = {
    // 100% scritto dall'utente
    displayName: '',
    photoURL: '',
    bio: '',                // max 150 caratteri
    university: '',
    corso: '',
    annoCorso: '',          // es. "1°", "2°", "Magistrale"
    materiaPreferita: '',   // es. "Biologia", "Diritto privato"
    studyStyle: '',         // testo libero: come studi, quando, con che metodo
    isPublic: true,

    // Stats pubbliche (aggiornate automaticamente)
    totalCards: 0,
    streak: 0,
    badgeCount: 0,
    publicDecks: 0,

    // Social
    followersCount: 0,
    followingCount: 0,
    friendsCount: 0,

    // Meta
    uid: '',
    createdAt: null,
    updatedAt: null,
};

// ─── Lettura / Scrittura profilo ──────────────────────────────────────────────

export async function getProfile(uid = null) {
    const targetUid = uid || localStorage.getItem('cortex_uid');
    if (!targetUid || typeof firebase === 'undefined') return null;

    try {
        const doc = await firebase.firestore()
            .collection('profiles')
            .doc(targetUid)
            .get();

        return doc.exists ? doc.data() : null;
    } catch (e) {
        console.error('[SocialProfile] Errore lettura profilo:', e);
        return null;
    }
}

export async function saveProfile(fields) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return false;

    // Sanitize
    const clean = {
        displayName:      (fields.displayName || '').substring(0, 50).trim(),
        bio:              (fields.bio || '').substring(0, 150).trim(),
        university:       (fields.university || '').substring(0, 80).trim(),
        corso:            (fields.corso || '').substring(0, 80).trim(),
        annoCorso:        (fields.annoCorso || '').substring(0, 20).trim(),
        materiaPreferita: (fields.materiaPreferita || '').substring(0, 60).trim(),
        studyStyle:       (fields.studyStyle || '').substring(0, 200).trim(),
        isPublic:         fields.isPublic !== false,
        updatedAt:        firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (fields.photoURL) clean.photoURL = fields.photoURL;

    try {
        await firebase.firestore()
            .collection('profiles')
            .doc(uid)
            .set(clean, { merge: true });

        // Cache locale
        const cached = JSON.parse(localStorage.getItem('cortex_profile') || '{}');
        localStorage.setItem('cortex_profile', JSON.stringify({ ...cached, ...clean }));

        return true;
    } catch (e) {
        console.error('[SocialProfile] Errore salvataggio profilo:', e);
        return false;
    }
}



// ─── Social Graph: Follow ─────────────────────────────────────────────────────

export async function followUser(targetUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || uid === targetUid || typeof firebase === 'undefined') return false;

    const db = firebase.firestore();
    const batch = db.batch();

    batch.set(db.collection('follows').doc(`${uid}_${targetUid}`), {
        followerUid: uid,
        followingUid: targetUid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(db.collection('profiles').doc(uid), {
        followingCount: firebase.firestore.FieldValue.increment(1),
    });
    batch.update(db.collection('profiles').doc(targetUid), {
        followersCount: firebase.firestore.FieldValue.increment(1),
    });

    await batch.commit();
    return true;
}

export async function unfollowUser(targetUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return false;

    const db = firebase.firestore();
    const batch = db.batch();

    batch.delete(db.collection('follows').doc(`${uid}_${targetUid}`));
    batch.update(db.collection('profiles').doc(uid), {
        followingCount: firebase.firestore.FieldValue.increment(-1),
    });
    batch.update(db.collection('profiles').doc(targetUid), {
        followersCount: firebase.firestore.FieldValue.increment(-1),
    });

    await batch.commit();
    return true;
}

export async function isFollowing(targetUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return false;
    const doc = await firebase.firestore()
        .collection('follows').doc(`${uid}_${targetUid}`).get();
    return doc.exists;
}

// ─── Social Graph: Amicizia ───────────────────────────────────────────────────

export async function sendFriendRequest(targetUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || uid === targetUid || typeof firebase === 'undefined') return false;

    await firebase.firestore().collection('friendRequests').add({
        fromUid: uid,
        toUid: targetUid,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    if (window.showToast) window.showToast('Richiesta di amicizia inviata!', 'success');
    return true;
}

export async function acceptFriendRequest(requestId, fromUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return false;

    const db = firebase.firestore();
    const batch = db.batch();

    // Aggiorna richiesta
    batch.update(db.collection('friendRequests').doc(requestId), { status: 'accepted' });

    // Crea friendship bidirezionale
    batch.set(db.collection('friends').doc(`${uid}_${fromUid}`), {
        uid1: uid, uid2: fromUid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('friends').doc(`${fromUid}_${uid}`), {
        uid1: fromUid, uid2: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(db.collection('profiles').doc(uid),     { friendsCount: firebase.firestore.FieldValue.increment(1) });
    batch.update(db.collection('profiles').doc(fromUid), { friendsCount: firebase.firestore.FieldValue.increment(1) });

    await batch.commit();
    if (window.showToast) window.showToast('Amicizia confermata! 🎉', 'success');
    return true;
}

export async function getPendingFriendRequests() {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return [];

    const snap = await firebase.firestore()
        .collection('friendRequests')
        .where('toUid', '==', uid)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function isFriend(targetUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return false;
    const doc = await firebase.firestore()
        .collection('friends').doc(`${uid}_${targetUid}`).get();
    return doc.exists;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Trova profili pubblici della stessa università o corso.
 */
export async function discoverByUniversity(university, limit = 20) {
    if (!university || typeof firebase === 'undefined') return [];

    const snap = await firebase.firestore()
        .collection('profiles')
        .where('university', '==', university)
        .where('isPublic', '==', true)
        .limit(limit)
        .get();

    const uid = localStorage.getItem('cortex_uid');
    return snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(p => p.uid !== uid);
}

export async function discoverByCorso(corso, limit = 20) {
    if (!corso || typeof firebase === 'undefined') return [];

    const snap = await firebase.firestore()
        .collection('profiles')
        .where('corso', '==', corso)
        .where('isPublic', '==', true)
        .limit(limit)
        .get();

    const uid = localStorage.getItem('cortex_uid');
    return snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(p => p.uid !== uid);
}

// ─── Sfida su mazzi in comune ─────────────────────────────────────────────────

/**
 * Trova mazzi in comune tra l'utente e un amico (stesso nome o stesso argomento).
 * Usato per proporre sfide Neural Duels su materie condivise.
 */
export async function getSharedDecks(friendUid) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return [];

    const myDecks = JSON.parse(localStorage.getItem('cortex_decks') || '[]')
        .map(d => d.name?.toLowerCase().trim())
        .filter(Boolean);

    const friendSnap = await firebase.firestore()
        .collection('publicDecks')
        .where('ownerUid', '==', friendUid)
        .get();

    const friendDeckNames = friendSnap.docs
        .map(d => d.data().name?.toLowerCase().trim())
        .filter(Boolean);

    const shared = myDecks.filter(name => friendDeckNames.includes(name));

    return shared;
}

/**
 * Invia una sfida Duels su una materia specifica a un amico.
 */
export async function challengeFriendOnDeck(friendUid, deckName) {
    if (typeof window.startNeuralDuel === 'function') {
        window.startNeuralDuel({ opponentUid: friendUid, deckFilter: deckName });
    } else if (window.showToast) {
        window.showToast('Neural Duels non disponibile al momento', 'error');
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Da chiamare in main.js dopo il login.
 * Crea il profilo se non esiste, aggiorna le stats pubbliche.
 */
export async function initSocialProfile() {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return;

    const existing = await getProfile();

    if (!existing) {
        // Primo accesso: crea profilo base
        const displayName = localStorage.getItem('cortex_username') || 'Studente';
        const photoURL = localStorage.getItem('cortex_photo') || '';
        await firebase.firestore().collection('profiles').doc(uid).set({
            ...EMPTY_PROFILE,
            uid,
            displayName,
            photoURL,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Nessuna generazione AI — il profilo è completamente manuale
    } else {
        // Aggiorna stats pubbliche
        const decks = JSON.parse(localStorage.getItem('cortex_decks') || '[]');
        const publicDecks = decks.filter(d => d.isPublic).length;
        const streak = parseInt(localStorage.getItem('cortex_streak') || '0');
        const sessions = JSON.parse(localStorage.getItem('cortex_study_sessions') || '[]');
        const totalCards = sessions.reduce((s, x) => s + (x.cardsStudied || 0), 0);

        await firebase.firestore().collection('profiles').doc(uid).update({
            streak, totalCards, publicDecks,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});

    }
}
