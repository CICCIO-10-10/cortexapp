# Verifica flusso TOLC → mazzo errori → ripasso → salvataggio e riapertura (14/10/2026)

Branch `fix/verifica-flusso-tolc-2026-10`, partito da `main` @ `14c0483`. Niente merge, niente deploy.
Tutto è stato provato in locale: nessun account reale, nessuna credenziale di produzione, nessuna AI e nessun dato di utenti.

## Come è stato verificato

| Livello | Cosa | Dove |
|---|---|---|
| Test unitari (mock) | suite completa `npm test` + nuovi test | `tests/tolc-flusso-verifica-2026-10.test.js` |
| Browser, solo ospite | app reale (Vite) in Chromium headless, rete esterna **tutta bloccata** | `scripts/verifica-flusso-tolc-2026-10/browser.cjs` |
| Browser + emulatori Firebase | build di produzione (`vite preview`), Auth e Firestore **emulati** (progetto `demo-cortex-security`), **regole Firestore del repository**, utenti sintetici | `scripts/verifica-flusso-tolc-2026-10/emulatori.cjs` + `avvia-emulatori.sh` |

## Matrice dei casi

| Caso | Esito | Prova |
|---|---|---|
| Simulazione con errori → carte coerenti | ✅ | browser `main`: carte = risposte sbagliate (in bianco escluse), ognuna con domanda, risposta corretta e risposta scelta; test esistenti `tolc-error-deck` |
| Simulazione senza errori | ✅ | browser `noerrors`: nessun pulsante, messaggio "Nessun errore da ripassare", nessun mazzo creato |
| Doppio clic su consegna | ✅ | browser `dblconsegna`: una sola prova nello storico |
| Doppio clic su "Ripassa i tuoi errori" | ✅ | browser `main`: un solo mazzo su IndexedDB |
| Doppio clic su "Salva il risultato" / "Accedi con Google" | ✅ | browser `loginredirect`, emulatori: un solo mazzo, nessun doppione dopo l'accesso |
| Avvio e completamento del ripasso | ✅ | browser `main`: ogni voto salvato subito su IndexedDB; a fine sessione tutte le carte riprogrammate dopo oggi |
| Refresh a metà ripasso | ✅ | browser `main`: mazzo e carta valutata presenti, mazzo in lista |
| Chiusura e riapertura | ✅ | browser `main`: progressi conservati, il ripasso non riparte da capo |
| Login che ricarica subito la pagina (caso peggiore del redirect) | ✅ | browser `loginredirect`: mazzo salvato, proposta "Ripassa i tuoi errori" una sola volta |
| Ospite → accesso → lavoro conservato (dispositivo) | ✅ | emulatori: un mazzo, progressi del ripasso, spazio ospite svuotato, storico TOLC passato all'account |
| Ospite → accesso → lavoro conservato (cloud) | ❌ → ✅ | **difetto 2** (corretto) |
| Errore di salvataggio sul dispositivo (IndexedDB) | ✅ | browser `idbfail`: stato "error" (non "saved"), avviso visibile, copia di riserva, recupero al riavvio |
| Errore di rete durante la sincronizzazione | ✅ (solo mock) | test esistente `data-integrity` "offline: niente perso"; non provato su rete reale |
| Cambio account: mazzi | ✅ | emulatori: B non vede né riceve sul cloud il mazzo di A; A lo ritrova |
| Cambio account: punteggi TOLC | ❌ → ✅ | **difetto 1** (corretto) |
| Dati di A sul dispositivo, avvio da ospite | ✅ | browser `scope`: nessun mazzo, punteggio o proposta di ripresa di A |

## Difetti riprodotti e corretti

### 1. Lo storico dei punteggi TOLC era condiviso fra gli account del dispositivo
- **Riproduzione:** l'account A fa un TOLC, poi esce; entra B (o si resta ospite). La home ("Cosa studiare oggi") e il risultato del TOLC ("rispetto alla volta scorsa") mostrano i punteggi di A. Riprodotto con test unitari, nel browser (`scope`) e con gli emulatori (account B vede il punteggio di A).
- **Atteso:** ogni account vede solo i propri punteggi. L'ospite che accede porta i suoi nell'account.
- **Causa:** `cortex_tolc_history` (scritto da `modules/tolcSim.js`, letto da `modules/home.js`) mancava da `SCOPED_KEYS` in `core/accountScope.js`, quindi restava globale.
- **Impatto:** esposizione dei punteggi di un account a un altro sullo stesso dispositivo, e attribuzione allo storico sbagliato.
- **Correzione:** chiave aggiunta a `SCOPED_KEYS`. Nel passaggio ospite → account lo storico dell'ospite si **unisce** a quello dell'account, senza doppioni, in ordine di tempo, al massimo 60 prove come in `tolcSim.js`; per le altre chiavi in conflitto resta il valore dell'account. Con l'eliminazione dell'account lo storico viene rimosso.

### 2. Primo accesso di un account nuovo: i mazzi creati da ospite non arrivavano sul cloud
- **Riproduzione:** come ospite si fa il TOLC e si crea il mazzo errori, poi "Accedi con Google" con un account nuovo. Sugli emulatori con le regole del repository: `Primo login: creazione doc utente fallita: PERMISSION_DENIED`. Il documento utente contiene solo `activation`, e il mazzo errori non è sul cloud (2 esecuzioni su 2, più una prova manuale). Con le regole aperte il difetto non si vede.
- **Atteso:** al primo accesso il documento utente viene completato e i mazzi dell'ospite vengono caricati subito.
- **Causa:** `loadFromCloud()` legge `users/{uid}` (non esiste). Nel frattempo `touchSeen()`/`bumpActivation()` creano il documento. Poi `loadFromCloud()` scrive `plan: 'free'` basandosi sulla lettura vecchia. Per le regole è l'*update* di un campo protetto, quindi tutta la scrittura viene rifiutata e il `syncToCloud()` che segue non parte.
- **Impatto:** il lavoro dell'ospite (mazzo errori e progressi) resta solo sul dispositivo finché non cambia qualcosa in locale. Su un altro dispositivo non si vede. Il documento utente resta senza `createdAt`/`email` fino al riavvio successivo.
- **Correzione:** in `services/firebase.js` lettura e scrittura del documento utente avvengono nella stessa transazione. `plan` si scrive solo se il documento davvero non esiste, e i campi già presenti non si sovrascrivono. Le regole non sono state modificate.

## Comandi eseguiti

| Comando | Risultato |
|---|---|
| `npm ci` | ok |
| `npm test` su `main` (prima) | 45 file, 395 superati, 1 saltato |
| nuovi test prima delle correzioni | difetto 1: 5 test falliti; difetto 2: 1 test fallito (`update plan` rifiutato) |
| `npm test` (dopo) | 46 file, 403 superati, 1 saltato |
| `npm run build` (i18n strict + vite) | ok |
| `node scripts/verify-security-build.mjs` | ❌ **anche su `main`**: manca `public/LOGO_APP_144.png` (problema preesistente, non toccato) |
| `browser.cjs` main / noerrors / idbfail / loginredirect / dblconsegna / scope | 11/11, 3/3, 4/4, 4/4, 1/1, 5/5 |
| `emulatori.cjs` (regole del repository) | prima 14/15 (punteggi di A visibili a B) e mazzo non sul cloud; dopo **16/16** |

## Decisioni di prodotto da valutare (non modificate)
- **Storico TOLC già presente sui dispositivi:** al primo avvio dopo l'aggiornamento resta allo spazio dati attivo in quel momento, perché non si può sapere di chi fosse. Se il dispositivo è in modalità ospite dopo il logout di A, i punteggi vecchi di A restano all'ospite e passano al prossimo account che accede. Si potrebbero assegnare all'ultimo account del dispositivo (`mm_user_id`), ma potrebbero essere anche dell'ospite.
- **`cortex_tolc_error_funnel`** (solo telemetria del funnel) e **`cortex_tolc_resume`** restano globali per scelta. Il secondo viene validato contro i mazzi dello spazio attivo (test esistente): non espone contenuti.
- **"N carte pronte"** compare prima della conferma del salvataggio su IndexedDB. Se il salvataggio fallisce segue subito l'avviso di errore con copia di riserva. Non è una falsa conferma di salvataggio, ma l'ordine dei messaggi si potrebbe rivedere.

## Limiti e verifiche manuali residue
- **Non provati con servizi reali:** login Google vero (popup su desktop, redirect su telefono), Firestore di produzione, Play/TWA. Gli emulatori usano un accesso con credenziale sintetica al posto del popup/redirect: provano la logica dell'app e le regole, **non** la sincronizzazione in produzione.
- **Su telefono vero:** redirect di Google su Android/iOS e nei browser in-app (TikTok/Instagram), TWA Android, eviction di IndexedDB su iOS Safari, app in background durante il salvataggio.
- **Rete reale instabile/offline durante la sincronizzazione:** coperta solo dal test con Firestore finto.
- **Spiegazione AI degli errori:** non provata (servizio a pagamento). Verificato solo che resti dietro accesso (test esistenti).
- **Dopo il deploy (da fare a mano):** ospite → TOLC → mazzo errori → "Accedi con Google" con un account nuovo → controllare in Firestore che `users/{uid}` abbia `createdAt`/`email`/`plan` e che `users/{uid}/decks` contenga `tolc-err-…` senza aver toccato altro. Poi logout e accesso con un secondo account: nessun punteggio TOLC del primo in home.
