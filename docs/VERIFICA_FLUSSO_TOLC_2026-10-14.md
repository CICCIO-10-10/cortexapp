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
| Vecchia cronologia TOLC (globale) con proprietario non identificabile | ✅ | test unitari (10 casi) + browser `legacyhist`: messa da parte, non mostrata, non assegnata (aggiornamento del 14/10, sotto) |

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

### Migrazione della vecchia cronologia TOLC (aggiunta dopo la prima revisione)
Sui dispositivi già in uso la cronologia è stata scritta quando era ancora globale, quindi non si sa di chi sia. In `core/accountScope.js` (`ensureScopeInitialized`, al primo avvio dopo l'aggiornamento, prima di qualsiasi lettura o cambio account, **una sola volta per dispositivo**):
- **resta allo spazio dati attivo** solo se il proprietario è identificabile:
  - è collegato un account, nessun altro account ha usato il dispositivo e non ci sono dati ospite non ancora uniti;
  - oppure si è in modalità ospite su un dispositivo che non ha mai visto un account;
- **altrimenti viene messa da parte** in `cortex_tolc_history_unassigned`. Nessuna parte dell'app la legge, non fa parte di nessuno spazio dati, non passa a nessun account con l'accesso e non si unisce allo storico dell'ospite. Esempio: modalità ospite dopo il logout di A, oppure dispositivo usato da più account.
- Il marcatore del dispositivo `cortex_tolc_history_scoped` impedisce di ripetere la migrazione, così le prove fatte dopo l'aggiornamento non vengono più spostate. Resta anche dopo l'eliminazione di un account: per questo nel test esatto di `account-deletion` è stato aggiunto alle chiavi attese.
- Rispetto alla regola generica per i dati legacy ("all'ultimo account del dispositivo") la cronologia TOLC è più prudente: l'ultimo account non basta a dire di chi sia.
- **Prova:** 10 test unitari. Disattivando la migrazione ne falliscono 7; i 3 che passano comunque sono i casi in cui la cronologia deve restare dov'è. Scenario `legacyhist` nel browser: 4/4 con la migrazione, 0/4 senza.
- **Non deciso qui:** cosa fare della copia messa da parte (es. offrirla all'utente con una conferma esplicita, o cancellarla dopo un certo tempo). Oggi resta sul dispositivo e basta.

## Immagini mancanti (`LOGO_APP_144.png`): non corrette
`scripts/verify-security-build.mjs` fallisce su `main` e su questo branch perché nella build mancano 7 immagini (`LOGO_APP_144.png`, `LOGO_SQUARE.png`, `favicon.ico`, `favicon-32x32.png`, `pwa-192x192.png`, `pwa-512x512.png`, `og-image.png`). Manca anche lo sfondo `media/nebula/bg.png`/`.webp` (controllo successivo dello stesso script, finora mai raggiunto).
- **Causa:** `.gitignore` esclude `*.png`, `*.ico`, `*.webp` e `*.svg`. Le immagini esistono solo sul computer da cui si pubblica.
- **Ricerca degli asset corretti:** nessuna immagine in cortexapp, né oggi né in tutta la storia (85 commit, `git log --diff-filter=A`). In `progetti-` ci sono solo immagini di altri progetti (clio, piqued, chess lore). L'unico asset di Cortex trovato è il logo incorporato in `index.html` come PNG **120×120**.
- **Perché non è stato corretto:** da un logo 120×120 si potrebbero solo *ricavare* icone 144/192/512, favicon e anteprima social 1200×630, ingrandendole o componendole. Sarebbero file ricostruiti e di qualità peggiore, non gli asset corretti. Lo script di controllo non è stato modificato: il problema che segnala è reale.
- **Cosa serve:** copiare in `public/` i 7 file originali e in `media/nebula/` lo sfondo, dal computer da cui si pubblica, poi rilanciare `npm run build && node scripts/verify-security-build.mjs`. Per non dipendere più da un solo computer si può valutare di versionare solo queste immagini con eccezioni nel `.gitignore` (es. `!public/LOGO_APP_144.png`). È una decisione da prendere: il commento nel `.gitignore` indica che il repository è pubblico.

## Comandi eseguiti

| Comando | Risultato |
|---|---|
| `npm ci` | ok |
| `npm test` su `main` (prima) | 45 file, 395 superati, 1 saltato |
| nuovi test prima delle correzioni | difetto 1: 5 test falliti; difetto 2: 1 test fallito (`update plan` rifiutato) |
| `npm test` (dopo le prime due correzioni) | 46 file, 403 superati, 1 saltato |
| test della migrazione con la migrazione disattivata | 7 falliti su 10 |
| `npm test` (finale, con la migrazione) | 46 file, **413 superati, 1 saltato** |
| `npm run build` (i18n strict + vite) | ok |
| `node scripts/verify-security-build.mjs` | ❌ su `main` e sul branch: immagini mancanti (vedi sopra), non corretto |
| `browser.cjs` main / noerrors / idbfail / loginredirect / dblconsegna / scope / legacyhist (finale) | 11/11, 3/3, 4/4, 4/4, 1/1, 5/5, 4/4 |
| `browser.cjs legacyhist` con la migrazione disattivata | 0/4 |
| `emulatori.cjs` (regole del repository) | prima delle correzioni 14/15 (punteggi di A visibili a B) e mazzo non sul cloud; finale **16/16** |

## Decisioni di prodotto da valutare (non modificate)
- **Copia messa da parte della vecchia cronologia TOLC:** se e come restituirla (vedi sopra).
- **Versionare le immagini del sito** nel repository pubblico (vedi sopra).
- **`cortex_tolc_error_funnel`** (solo telemetria del funnel) e **`cortex_tolc_resume`** restano globali per scelta. Il secondo viene validato contro i mazzi dello spazio attivo (test esistente): non espone contenuti.
- **"N carte pronte"** compare prima della conferma del salvataggio su IndexedDB. Se il salvataggio fallisce segue subito l'avviso di errore con copia di riserva. Non è una falsa conferma di salvataggio, ma l'ordine dei messaggi si potrebbe rivedere.

## Limiti e verifiche manuali residue
- **Non provati con servizi reali:** login Google vero (popup su desktop, redirect su telefono), Firestore di produzione, Play/TWA. Gli emulatori usano un accesso con credenziale sintetica al posto del popup/redirect: provano la logica dell'app e le regole, **non** la sincronizzazione in produzione.
- **Su telefono vero:** redirect di Google su Android/iOS e nei browser in-app (TikTok/Instagram), TWA Android, eviction di IndexedDB su iOS Safari, app in background durante il salvataggio.
- **Rete reale instabile/offline durante la sincronizzazione:** coperta solo dal test con Firestore finto.
- **Migrazione della vecchia cronologia:** provata con localStorage preparato apposta (test e browser), non su dispositivi reali già in uso. La regola dipende dagli indizi presenti sul dispositivo (`mm_user_id`, spazi dati di altri account, dati ospite non uniti): se un browser li ha cancellati in parte, la cronologia può risultare di un solo proprietario anche quando non lo era.
- **Spiegazione AI degli errori:** non provata (servizio a pagamento). Verificato solo che resti dietro accesso (test esistenti).
- **Dopo il deploy (da fare a mano):** ospite → TOLC → mazzo errori → "Accedi con Google" con un account nuovo → controllare in Firestore che `users/{uid}` abbia `createdAt`/`email`/`plan` e che `users/{uid}/decks` contenga `tolc-err-…` senza aver toccato altro. Poi logout e accesso con un secondo account: nessun punteggio TOLC del primo in home.
