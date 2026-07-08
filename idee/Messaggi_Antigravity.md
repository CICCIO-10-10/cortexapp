# 📨 Messaggi per Antigravity — Cortex v9.69
> Copia e incolla ogni blocco come messaggio separato.

---

## 🔴 BUG CRITICI

---

### MESSAGGIO 1 — Firestore Rule: userProfiles write troppo permissiva

```
BUG SICUREZZA — firestore.rules

La rule su /userProfiles/{username} permette a qualsiasi utente autenticato di scrivere
il documento di CHIUNQUE, non solo il proprio:

  allow write: if request.auth != null;  ← SBAGLIATO

Fix: aggiungere il controllo che lo userId dell'utente corrisponda al documento:

  match /userProfiles/{username} {
    allow read: if true;
    allow write: if request.auth != null
                 && request.auth.token.email != null
                 && (request.auth.uid == resource.data.uid
                     || !resource.exists
                     || isAdmin());
  }

Oppure, se il documento viene keyed per username (non per uid), aggiungere un campo
uid al documento e verificare:

  allow write: if request.auth != null
               && (request.auth.uid == request.resource.data.uid);

Questo blocca qualsiasi utente dal sovrascrivere il profilo di un altro.
```

---

### MESSAGGIO 2 — Pulsante Admin visibile in produzione

```
BUG UX — "Genera Profilo Random (Admin)" visibile in produzione

In main.js (branch hasProfile=false della community page), il pulsante
"Genera Profilo Random (Admin)" viene renderizzato se isAdminCall è true.

La variabile isAdminCall è calcolata lato client → può esporre funzionalità
admin a chiunque riesca a manipolare il token o il DOM.

Fix: spostare il controllo admin su Custom Claims Firebase verificato lato server,
oppure rimuovere il pulsante dalla build di produzione usando:

  if (import.meta.env.DEV) {
    // render admin button
  }

Così in build di produzione (vite build) il pulsante non viene mai incluso.
```

---

## 🟡 QUICK WINS (< 2 ore ciascuno)

---

### MESSAGGIO 3 — FCP 3700ms: aggiungere preconnect Firebase

```
PERFORMANCE — FCP attuale: 3700ms

Aggiungere i seguenti tag <link rel="preconnect"> nel <head> di index.html,
prima di qualsiasi script Firebase, per abbassare il FCP di ~400-600ms:

  <link rel="preconnect" href="https://firebasestorage.googleapis.com">
  <link rel="preconnect" href="https://firestore.googleapis.com">
  <link rel="preconnect" href="https://identitytoolkit.googleapis.com">
  <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com">

Posizione: subito dopo il tag <meta charset>, prima dei tag <script>.
```

---

### MESSAGGIO 4 — History API: URL reali durante la navigazione

```
UX — Deep Linking: aggiornare URL al cambio pagina

Attualmente tutti i tab vivono su "/" — nessun URL cambia durante la navigazione.
Questo impedisce: link diretti a una sezione, tasto back del browser, condivisione URL.

In main.js, nella funzione showPage(pageId), aggiungere:

  function showPage(pageId) {
    // ... codice esistente ...

    // Aggiorna URL senza ricaricare la pagina
    const urlMap = {
      home: '/',
      tecniche: '/tecniche',
      materiale: '/materiale',
      community: '/community',
      lezioni: '/lezioni',
      settings: '/settings'
    };
    const newUrl = urlMap[pageId] || '/';
    if (window.location.pathname !== newUrl) {
      history.pushState({ page: pageId }, '', newUrl);
    }
  }

E in fondo al file aggiungere il listener per il tasto back:

  window.addEventListener('popstate', (e) => {
    const page = e.state?.page || 'home';
    showPage(page);
  });

In firebase.json aggiungere il rewrite per gestire le rotte lato server:

  "rewrites": [{ "source": "**", "destination": "/index.html" }]

(Questo è già presente ma verificare che copra /tecniche, /materiale ecc.)
```

---

### MESSAGGIO 5 — Transizione animata tra pagine

```
UX POLISH — Aggiungere fade-in al cambio pagina

Attualmente le pagine si scambiano di netto senza animazione.

In styles.css aggiungere:

  .page-content {
    animation: pageFadeIn 0.2s ease-out;
  }
  @keyframes pageFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

In main.js, nella funzione showPage(), ogni volta che si mostra una nuova vista:
rimuovere e re-aggiungere la classe per forzare il re-trigger dell'animazione:

  const el = document.getElementById('view-' + pageId);
  if (el) {
    el.classList.remove('page-content');
    void el.offsetWidth; // force reflow
    el.classList.add('page-content');
  }
```

---

### MESSAGGIO 6 — Throttle lato client per il form Feedback

```
UX / SICUREZZA — Rate limit client-side sul form Feedback

Attualmente l'utente loggato può inviare feedback in loop senza limiti lato client
(la Firestore rule richiede solo auth != null).

In modules/home.js, nella funzione che gestisce il submit del feedback,
aggiungere un cooldown di 60 secondi via localStorage:

  const FEEDBACK_COOLDOWN_KEY = 'cortex_feedback_last';
  const last = parseInt(localStorage.getItem(FEEDBACK_COOLDOWN_KEY) || '0');
  const now = Date.now();
  if (now - last < 60_000) {
    showToast('Aspetta un momento prima di inviare un altro feedback.', 'info');
    return;
  }
  localStorage.setItem(FEEDBACK_COOLDOWN_KEY, String(now));
  // ... procedi con l'invio
```

---

## 🟣 UX / POLISH (Sprint 2)

---

### MESSAGGIO 7 — Level-Up: aggiungere confetti animation

```
UX POLISH — Confetti al level-up

La celebrazione di level-up (showLevelUp in modules/gamification.js) attualmente
mostra solo un overlay statico. Aggiungere confetti per impatto visivo.

1. In index.html aggiungere la libreria (CDN, già usato cdnjs in altri punti):

   <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>

2. In modules/gamification.js, dentro la funzione showLevelUp(), dopo aver
   aggiunto l'overlay al DOM:

   if (typeof confetti === 'function') {
     confetti({
       particleCount: 120,
       spread: 80,
       origin: { y: 0.5 },
       colors: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ffffff', '#fbbf24']
     });
   }
```

---

### MESSAGGIO 8 — Studio: mostrare streak combo durante la sessione

```
UX POLISH — Streak combo durante la sessione di studio

In modules/study.js, nella funzione rateCard() (dove si assegna Facile/Difficile/
Sbagliato), tracciare una variabile sessionStreak e mostrarla sopra la progress bar.

Aggiungere a showCard() il rendering del combo:

  // Aggiungi nel HTML della study overlay (index.html o renderizzato in main.js):
  <div id="study-streak" style="text-align:center; font-size:0.85rem;
       color:var(--accent); min-height:20px; margin-bottom:4px;"></div>

In rateCard(), quando la risposta è "Facile":
  sessionStreak++;
  if (sessionStreak >= 3) {
    const el = document.getElementById('study-streak');
    if (el) el.textContent = `🔥 ${sessionStreak}x Combo!`;
  }

Quando la risposta è "Sbagliato":
  sessionStreak = 0;
  const el = document.getElementById('study-streak');
  if (el) el.textContent = '';
```

---

### MESSAGGIO 9 — Pagina Piano / Upgrade visibile all'utente

```
UX — Aggiungere sezione "Il tuo piano" nelle Impostazioni

L'utente attualmente non sa su quale piano si trova (Free/Student/Pro) né
come fare upgrade. Aggiungere una sezione nella pagina Settings (showPage('settings')).

Logica da implementare in main.js (sezione settings):

  // Leggere il piano da Firestore: users/{uid}.plan
  // Valori possibili: 'free' | 'student' | 'pro'

HTML da renderizzare:

  <div class="plan-card">
    <div class="plan-badge">{piano attuale: FREE / STUDENT / PRO}</div>
    <div class="plan-calls">Chiamate AI oggi: {currentUsage} / {limit}</div>

    <!-- Se free: -->
    <button onclick="showUpgradeModal()">⚡ Passa a Student — €4.99/mese</button>
    <button onclick="showUpgradeModal('pro')">🚀 Passa a Pro — €9.99/mese</button>

    <!-- Se student o pro: -->
    <div>Piano attivo fino al: {renewalDate}</div>
    <button onclick="manageSubscription()">Gestisci abbonamento</button>
  </div>

I bottoni per ora possono aprire una modale placeholder — il backend Stripe
arriverà nel messaggio successivo.
```

---

## 💚 MONETIZZAZIONE (Sprint 3)

---

### MESSAGGIO 10 — Stripe: integrazione abbonamenti

```
FEATURE CRITICA — Stripe Checkout per abbonamenti

Stack: Stripe + Firebase Cloud Functions + Firestore

PASSO 1 — Installare Stripe nel progetto functions:
  cd functions && npm install stripe

PASSO 2 — Aggiungere la chiave Stripe alla config Firebase:
  firebase functions:config:set stripe.secret="sk_live_..." stripe.webhook="whsec_..."

PASSO 3 — In functions/index.js aggiungere due funzioni:

  // a) Crea una Stripe Checkout Session
  exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Login required');

    const stripe = require('stripe')(functions.config().stripe.secret);
    const priceIds = {
      student: 'price_STUDENT_ID',   // da Stripe Dashboard
      pro:     'price_PRO_ID'
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceIds[data.plan], quantity: 1 }],
      success_url: 'https://cortex-app.web.app/?upgrade=success',
      cancel_url:  'https://cortex-app.web.app/?upgrade=cancel',
      metadata: { uid }
    });
    return { url: session.url };
  });

  // b) Webhook Stripe → aggiorna piano su Firestore
  exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const stripe = require('stripe')(functions.config().stripe.secret);
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, functions.config().stripe.webhook);
    } catch (err) {
      return res.status(400).send('Webhook Error');
    }

    if (event.type === 'checkout.session.completed') {
      const uid = event.data.object.metadata.uid;
      const plan = event.data.object.metadata.plan || 'student';
      await admin.firestore().collection('users').doc(uid).set(
        { plan, planUpdatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      const uid = event.data.object.metadata.uid;
      await admin.firestore().collection('users').doc(uid).set(
        { plan: 'free' },
        { merge: true }
      );
    }

    res.json({ received: true });
  });

PASSO 4 — In firebase.json registrare il webhook endpoint:
  aggiungere nella sezione "functions": { "source": "functions" }
  e deployare con: firebase deploy --only functions

PASSO 5 — Lato frontend (main.js), quando l'utente clicca "Passa a Student/Pro":
  async function redirectToCheckout(plan) {
    const createCheckout = firebase.functions().httpsCallable('createCheckoutSession');
    const { data } = await createCheckout({ plan });
    window.location.href = data.url;
  }
```

---

### MESSAGGIO 11 — Neural Sparks: micro-transazioni una tantum

```
FEATURE — Neural Sparks (acquisto energia IA una-tantum)

Per utenti che non vogliono abbonamento ma hanno bisogno di più chiamate AI.

PASSO 1 — In Stripe Dashboard creare 3 Payment Links (non subscription, ma payment):
  - Spark S:  50 chiamate  → €1.99
  - Spark M: 150 chiamate  → €4.99
  - Spark L: 500 chiamate  → €12.99

PASSO 2 — In functions/index.js aggiungere gestione nel webhook:

  if (event.type === 'checkout.session.completed') {
    const uid = event.data.object.metadata.uid;
    const sparks = parseInt(event.data.object.metadata.sparks || '0');

    if (sparks > 0) {
      // Aggiungi le chiamate al contatore permanente dell'utente
      await admin.firestore().collection('users').doc(uid).update({
        sparksBalance: admin.firestore.FieldValue.increment(sparks)
      });
    }
  }

PASSO 3 — In functions/index.js, nella logica di rate limiting di callGeminiProxy,
modificare il check per usare anche il saldo sparks se il piano free è esaurito:

  if (currentUsage >= limit) {
    // Controlla saldo sparks
    const sparksBalance = userDoc.data()?.sparksBalance || 0;
    if (sparksBalance > 0) {
      // Scala uno spark
      transaction.update(userRef, {
        sparksBalance: admin.firestore.FieldValue.increment(-1)
      });
      // Permetti la chiamata
    } else {
      throw new functions.https.HttpsError('resource-exhausted', 'PAYWALL_LIMIT_REACHED');
    }
  }

PASSO 4 — Lato frontend: mostrare il saldo Sparks nell'header (piccolo badge ⚡)
e nelle impostazioni con pulsante "Ricarica".
```

---

## 🔵 FEATURE NUOVE (Sprint 4)

---

### MESSAGGIO 12 — FCM Push Notifications: reminder ripasso giornaliero

```
FEATURE — FCM: notifica push per il ripasso giornaliero

Firebase Messaging è già importato (firebase-messaging-compat.js nel bundle).
Aggiungere la richiesta permesso e l'invio del token.

PASSO 1 — Creare public/firebase-messaging-sw.js:

  importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: "...",
    projectId: "cortex-74a4e",
    messagingSenderId: "...",
    appId: "..."
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function(payload) {
    self.registration.showNotification(payload.notification.title, {
      body: payload.notification.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png'
    });
  });

PASSO 2 — In main.js, dopo il login dell'utente, richiedere il permesso:

  async function setupPushNotifications(uid) {
    try {
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: 'XXXXXXXXXXXXXXXX'  // da Firebase Console → Cloud Messaging
      });
      if (token) {
        await firebase.firestore().collection('users').doc(uid).update({
          fcmToken: token,
          fcmUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {
      console.log('[FCM] Permission denied or error:', e);
    }
  }

PASSO 3 — In functions/index.js aggiungere una Cloud Function schedulata
che ogni sera alle 19:00 invia una notifica agli utenti con carte da ripassare:

  exports.dailyStudyReminder = functions.pubsub
    .schedule('0 19 * * *')
    .timeZone('Europe/Rome')
    .onRun(async () => {
      const usersSnapshot = await admin.firestore().collection('users').get();
      const messages = [];
      usersSnapshot.forEach(doc => {
        const token = doc.data().fcmToken;
        if (token) {
          messages.push({
            token,
            notification: {
              title: '🧠 È ora di ripassare!',
              body: 'Hai flashcard da rivedere oggi. Mantieni il tuo streak!'
            }
          });
        }
      });
      if (messages.length > 0) {
        await admin.messaging().sendEach(messages);
      }
    });

NOTA: aggiungere firebase-admin messaging al progetto functions se non presente:
  npm install firebase-admin  (già presente, verificare la versione)
```

---

### MESSAGGIO 13 — Neural Podcasts: mazzo → audio TTS

```
FEATURE — Neural Podcasts: trasforma un mazzo in un podcast audio

Permette il ripasso passivo (in treno, in palestra).

TECNOLOGIA: Google Cloud Text-to-Speech API (o Gemini TTS se disponibile).

PASSO 1 — In functions/index.js aggiungere:

  exports.generateDeckPodcast = functions.https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Login required');

    const { deckId, cards } = data;
    // cards = array di { q, a }

    // Costruisci lo script del podcast
    const script = cards.map((c, i) =>
      `Domanda ${i+1}: ${c.q}. ... Risposta: ${c.a}.`
    ).join(' ');

    // Chiama Google TTS
    const tts = require('@google-cloud/text-to-speech');
    const client = new tts.TextToSpeechClient();
    const [response] = await client.synthesizeSpeech({
      input: { text: script },
      voice: { languageCode: 'it-IT', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' }
    });

    // Salva l'audio su Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(`podcasts/${uid}/${deckId}.mp3`);
    await file.save(response.audioContent, { contentType: 'audio/mpeg' });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    return { url };
  });

PASSO 2 — Frontend: aggiungere un pulsante "🎙️ Genera Podcast" nel detail di ogni mazzo.
Al click, chiamare la Cloud Function e poi aprire un <audio> player inline.

PASSO 3 — Questa feature può essere Paywall: solo piano Student o Pro.
```

---

### MESSAGGIO 14 — Neural Duels: sfide 1v1 in tempo reale

```
FEATURE — Neural Duels: sfide 1v1 tra utenti

Due utenti si sfidano su un mazzo condiviso: risponde più velocemente chi conosce la risposta.

ARCHITETTURA (Firestore real-time):

  /duels/{duelId}:
    status: 'waiting' | 'active' | 'finished'
    players: { uid1: { name, score: 0 }, uid2: { name, score: 0 } }
    deckId: string
    currentCardIndex: 0
    startedAt: timestamp

PASSO 1 — Funzione "Crea Sfida" (Frontend):
  - L'utente sceglie un mazzo e clicca "⚔️ Sfida un amico"
  - Si crea il documento /duels/{duelId} con status: 'waiting'
  - Si genera un link: cortex-app.web.app/?duel={duelId}
  - L'avversario apre il link e si unisce alla sfida

PASSO 2 — Listener real-time (main.js):
  db.collection('duels').doc(duelId).onSnapshot(snap => {
    const duel = snap.data();
    if (duel.status === 'active') renderDuelCard(duel);
    if (duel.status === 'finished') showDuelResult(duel);
  });

PASSO 3 — Logica punteggio:
  - Prima risposta corretta → +10 punti
  - Risposta in meno di 5s → bonus +5 punti
  - Fine mazzo → chi ha più punti vince, si assegnano XP e si mostra il riepilogo

PASSO 4 — Nella Community board, aggiungere una sezione "Sfide Attive" che mostra
i duel in attesa di avversario (status: 'waiting') per il proprio livello.
```

---

### MESSAGGIO 15 — Visual Knowledge Graph: mappa 3D dei concetti

```
FEATURE — Visual Knowledge Graph (3D)

Visualizzazione di tutti i mazzi dell'utente come nodi collegati dai tag/materie condivise.

LIBRERIA: force-graph (2D/3D, già compatibile con vanilla JS)
  <script src="https://cdn.jsdelivr.net/npm/3d-force-graph@1/dist/3d-force-graph.min.js"></script>

IMPLEMENTAZIONE in main.js (case 'knowledge-graph' in showPage):

  function renderKnowledgeGraph() {
    const decks = state.decks;

    // Costruisci i nodi
    const nodes = decks.map(d => ({
      id: d.id,
      name: d.name,
      val: d.cards?.length || 1,
      color: '#8b5cf6'
    }));

    // Costruisci i link tra mazzi che condividono la stessa materia
    const links = [];
    decks.forEach((d1, i) => {
      decks.forEach((d2, j) => {
        if (i < j && d1.subject === d2.subject) {
          links.push({ source: d1.id, target: d2.id });
        }
      });
    });

    const Graph = ForceGraph3D()(document.getElementById('knowledge-graph-container'))
      .graphData({ nodes, links })
      .nodeLabel('name')
      .nodeColor('color')
      .onNodeClick(node => showPage('materiale', node.id));
  }

Aggiungere un tab "🕸️ Grafo" nella nav o come sezione di Materiale.
```

---

## ⚙️ INFRASTRUTTURA / MANUTENZIONE

---

### MESSAGGIO 16 — Cleanup: rimuovere console.log di debug dal bundle

```
PULIZIA — Rimuovere console.log dal bundle di produzione

Il bundle attuale contiene diversi console.log visibili agli utenti
(es: "Showing page: home", "[SW] Registered", "[Perf] FCP: ...").

In vite.config.js aggiungere il plugin per strippare i log in produzione:

  import { defineConfig } from 'vite';
  import { readFileSync } from 'fs';
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

  export default defineConfig({
    define: {
      __CORTEX_VERSION__: JSON.stringify(pkg.version),
      CURRENT_VERSION: JSON.stringify(pkg.version)
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,   // ← rimuove tutti i console.log
          drop_debugger: true
        }
      }
    }
  });

Nota: il FCP observer (console.log('[Perf] FCP: ...')) può essere mantenuto
separatamente wrappandolo con: if (import.meta.env.DEV) { ... }
```

---

### MESSAGGIO 17 — Aggiungere screenshot reali al manifest.json

```
PWA POLISH — Screenshots nel manifest.json

Attualmente manifest.json usa LOGO_PREMIUM.png come screenshot per entrambi
i form factor (narrow e wide), il che è un placeholder.

Creare 2 screenshot reali dell'app:
  - public/screenshot-narrow.png  → 390×844px (mobile)
  - public/screenshot-wide.png    → 1280×800px (desktop)

E aggiornare il manifest:

  "screenshots": [
    {
      "src": "./screenshot-narrow.png",
      "type": "image/png",
      "sizes": "390x844",
      "form_factor": "narrow",
      "label": "Cortex — Studia con le tecniche dei campioni"
    },
    {
      "src": "./screenshot-wide.png",
      "type": "image/png",
      "sizes": "1280x800",
      "form_factor": "wide",
      "label": "Cortex — Il tuo secondo cervello"
    }
  ]

Questo migliora lo score PWABuilder e la presentazione sugli store.
```

---

*Fine messaggi — 17 totali*
*Priorità consigliata: 1→2→3→4→10→9→11→12→5→6→7→8→13→14→15→16→17*
