# Remediation sicurezza — 30 settembre 2026

## Stato

Le modifiche sono nel checkout locale. Non sono state pubblicate su Firebase né sugli store.

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
