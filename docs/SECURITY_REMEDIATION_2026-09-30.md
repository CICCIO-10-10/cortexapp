# Remediation sicurezza — 30 settembre 2026

## Stato

Aggiornamento 30/09 ore 23:45: il rilascio **è in produzione** (verificato dall'esterno: CSP nuova su cortexapp.it, callable Neural Duels con messaggi nuovi, regole profili nuove attive). Le correzioni della sezione "Correzioni post-rilascio" sono solo nel checkout locale e vanno pubblicate.

## Interventi

- Escaping dei contenuti non attendibili nei flussi di interrogazione orale, profilo, mazzi, quiz e prove; l’importazione di mazzi condivisi ora accetta solo carte testuali valide e limita quantità e lunghezze.
- Clarity, GA4 e telemetria facoltativa vengono caricati solo dopo il consenso esplicito. Rimossi i tag Clarity con UID ed email; filtrati metadati analytics e proprietà utente.
- Webhook Sparks idempotente per sessione Stripe, con pagamento, modalità, utente e taglie dei pacchetti verificati prima dell’accredito.
- Profili `isPublic: false` leggibili solo dal proprietario. Contatori social non più modificabili dai client e aggiornati da trigger backend. Relazioni follow/amicizia e transizioni delle richieste controllate dalle regole.
- Neural Duels: matchmaking, risposta corretta, punteggi e NeuroBot gestiti dalle callable Functions; i client partecipanti possono solo leggere lo stato della propria partita.
- Firebase Admin 14 usa le API modulari; le Cloud Functions sono state caricate localmente per verificare l’avvio a freddo.
- Header CSP completati con `default-src` e direttive per gli script, le connessioni, le immagini e gli iframe usati dall’app.
- Quote giornaliere condivise su Firestore: Student 100 chiamate Gemini e 100 richieste TTS; Pro 2.000 Gemini e 500 TTS. Si possono regolare con `GEMINI_PRO_DAILY_LIMIT`, `TTS_STUDENT_DAILY_LIMIT` e `TTS_PRO_DAILY_LIMIT`.
- Il proxy Gemini accetta solo modelli Flash e limita l’output a 8.192 token per richiesta; i limiti di piano restano applicati prima della chiamata al provider.
- Aggiornate le dipendenze backend, incluso Nodemailer 10, Firebase Admin 14 e Google APIs 182.

## Verifiche locali

- `npm test`: 15 file e 84 test superati.
- Build Vite completata; i18n completo in italiano, inglese, spagnolo, francese e tedesco.
- `npm audit --omit=dev` ha riportato zero vulnerabilità sia in `functions/` sia nel progetto principale.
- Caricamento di `functions/index.js` completato e controlli sintattici Node senza errori.
- `node scripts/verify-security-build.mjs`: 465 file di produzione controllati; tracker legacy e quattro segreti server non presenti nel bundle.
- `git diff --check` senza errori di whitespace.

## Limiti residui e rilascio

- La CSP conserva `'unsafe-inline'` in `script-src` perché l’app usa ancora script e handler inline: limita le origini esterne, ma non neutralizza ogni possibile XSS. Per eliminarlo serve migrare gli script inline a file o nonce/hash.
- App Check non è stato attivato: il progetto non include una configurazione client verificabile e abilitarlo senza registrare prima i client può bloccare l’app.
- Le regole Firestore non sono state eseguite contro l’emulatore: Firebase CLI non è installato, la porta locale dell’emulatore è chiusa e Java 8 non soddisfa il requisito Java 21. Vanno validate prima del rilascio.
- Le modifiche a regole, Functions, hosting e frontend richiedono deploy coordinato. La produzione corrente non è stata cambiata.

## Correzioni post-rilascio (30/09, sera)

Regole eseguite contro l'emulatore Firestore (Java 21, firebase-tools): suite esistente 62/62 e 24 nuovi controlli su profili, follow, amicizie e duelli. Emersi e corretti tre bug introdotti dalle nuove regole:

- `photoURL` vuota rifiutata: impediva di creare o aggiornare il profilo agli utenti senza foto (utenti email/password e profili esistenti senza foto). Ora è ammessa la stringa vuota; restano rifiutati gli URL non `https://`.
- `isFollowing()` / `isFriend()` su documenti inesistenti venivano negate (la regola leggeva `resource.data` con `resource == null`) e la pagina profilo di un altro utente restava su "Caricamento…". Ora il `get` di un documento inesistente è consentito solo se l'ID inizia con il proprio UID; lato client le due funzioni gestiscono l'errore restituendo `false`.
- `initSocialProfile()` scrive `photoURL` solo se è un URL https e tronca `displayName` a 50 caratteri.

Pagamenti nell'app Android (TWA): acquisto Sparks e paywall Student non aprono più Stripe quando Google Play Billing è disponibile; usano gli SKU Play già previsti (`cortex_sparks_50/150/500`, `cortex_student_monthly`). Dopo l'accredito lato server gli Sparks vengono consumati (`consume`) per poterli ricomprare. Da verificare in Play Console che gli SKU esistano e siano attivi.

Verifiche: `npm test` 84/84, build Vite, `verify-security-build.mjs` OK.

Pubblicazione necessaria (non eseguita): `npm run build` poi `npx firebase-tools deploy --project cortex-74a4e --only firestore:rules,hosting`. Nessuna Function modificata.
