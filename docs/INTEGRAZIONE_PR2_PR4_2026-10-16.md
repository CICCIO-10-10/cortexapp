# Integrazione locale PR #2 + PR #4 (16/10/2026)

Cartella: `Desktop\PROGETTI\cortex`. Niente push manuale, merge remoto, deploy o migrazioni. Nessun dato di produzione letto o scritto.
Fonte della consegna: `docs/REVISIONE_PR2_2026-10-16.md` (PR #4) e `docs/VERIFICA_TRACCIAMENTO_2026-10-14.md` (PR #2).

## 1. Stato di partenza verificato (15/10, 23:45)
- `HEAD` = `6b5b85a` (merge PR #1). La PR #3 **non** era un commit: Codex l'aveva applicata come modifiche non committate, insieme alla nuova grafica e ai timeout.
  - 17 file modificati e 11 non tracciati, tra cui `app.html`, `services/firebase.js`, `services/ai.js`, i CSS `cortex-final/hub/rebrand` e `ui/components/*`.
- Commit delle PR verificati con `git fetch` dei riferimenti `refs/pull/*`:
  - PR #2: `93f076c`.
  - PR #4: `139b9c6` e `0539fd9`. La PR #4 contiene la PR #2 (`git merge-base --is-ancestor`).
- File toccati da #2 + #4 e modifiche locali: **nessun file in comune**. Controllo semantico sui punti di contatto:
  - `services/activation.js`: l'anonimo non scrive attivazione.
  - PR #3 in `services/firebase.js`: l'AI dell'ospite resta su accesso anonimo.
  - I due comportamenti convivono, come mostrano le prove 4 e 7 della sezione 5.

## 2. Backup (recuperabile, nulla cancellato)
- Branch locale `backup/pre-pr2-pr4-2026-10-15` (`b29019d`).
  - Contiene lo stato completo prima dell'integrazione, file non tracciati inclusi. È stato creato con un indice temporaneo, quindi l'albero di lavoro e l'indice reale non sono stati toccati.
- Copia esatta dei byte in `.git/claude-backups/2026-10-15_2345/`:
  - `worktree-changes.tgz`, con i 28 file modificati o non tracciati;
  - `tracked.patch`;
  - `index.orig`.
- Dashboard: `*.bak_20261015_contratto` accanto a ogni file modificato in `AUTOMAZIONI`, più `dashboard_storico.json.bak_20261015_contratto`.

## 3. Integrazione
- Un solo merge locale: `84b18c8` = `git merge --no-ff origin/pr/4` (porta dentro anche la #2). Nessun conflitto. Le modifiche locali sono rimaste intatte.
- **Evento successivo, non eseguito da me:** alle 00:05 il backup notturno (`AUTOMAZIONI\local_automations\run_git_sync_progetti.bat`: `git add -A`, commit, `git push` sempre) ha fatto due cose:
  - ha creato `08aab0b auto: backup 2026-10-16`, che include tutte le modifiche locali (PR #3 di Codex, grafica, timeout);
  - **ha pubblicato `84b18c8` + `08aab0b` su `origin/main`**.
  - Conseguenze:
    - GitHub vede #2 dentro `main`;
    - la #4 resta aperta, perché la sua base è il branch della #2;
    - il CI (`.github/workflows/ci.yml`) esegue solo `npm test`;
    - **nessun deploy**.
  - Se `main` remoto deve tornare indietro, serve un revert: è una decisione del proprietario.

## 4. Dashboard `AUTOMAZIONI` adattata al nuovo contratto di `adminDashboard`
Il contratto nuovo si riconosce dalla presenza di `firestore.accountMetricsAvailable`. Le risposte del contratto precedente (Function non ancora pubblicata) si leggono come prima.

| Regola | Dove |
|---|---|
| `null` = non disponibile (n/d), mai 0; 0 vero resta 0 | template (`countValue`), fallback notturno (`account_count`), storico (`new7` solo se `usersDetailAvailable === true`), report social (`utenti_totali` assente o null = n/d, non 0) |
| `usersByPlan: null` senza errori | template ("n/d: Firebase Auth non disponibile"), snapshot notturno |
| `usersDetailAvailable: false` ≠ "nessun utente" | messaggio "… Non significa che non ci siano utenti"; "Nessun account collegato" solo con dettaglio completo e vuoto |
| `guestProfiles` separato dagli account | riquadro "Ospiti anonimi con profilo" (totale, vecchia attivazione, primo ripasso), mai sommato |
| `usersNoEmail` = account collegati con email mancante nel documento | riquadro "Account con email mancante nel profilo"; l'email non è più usata come criterio di account |
| riconciliazione profili/Auth | nuovo contratto: `totalUsers` = profili collegati; il totale dei documenti = collegati + altra identità + senza Auth |
| freccia "rispetto a 7 giorni fa" | non confronta "Nuovi account" tra definizioni diverse (mostra "≠ def.") |

File: `cortex_dashboard_local.tpl.html`, `cortex_dashboard_local.py`, `local_automations/cortex_dashboard_refresh.py` (snapshot `cortex_live.json` e nota Obsidian: nuove chiavi `account_metrics_disponibili`, `guest_profiles`, `metriche_account_disponibili`, `ospiti_anonimi_profili`; `profili_firestore` torna a essere il totale dei documenti), `report_social_unico.py`.

## 5. Verifiche
**Legenda:** REALE = codice vero eseguito davvero. SIMULATO = dati sintetici, servizi finti o emulatori. Nessuna prova ha toccato produzione, telefoni reali, login Google reale, Clarity/GA reali o AI reale.

Le prove dei punti 3–11 sono state eseguite su una **copia identica** della cartella locale aggiornata: 764 file, con la stessa impronta SHA-256 dell'elenco. Sono rimasti esclusi `node_modules` (Windows), `media/videos`, `play_store_package` e `.env`. Il motivo: i `node_modules` di Windows non girano su Linux e i segreti non vanno copiati altrove.

| # | Prova | Tipo | Esito |
|---|---|---|---|
| 1 | Dashboard: 4 risposte sintetiche (normale, zeri, Auth non disponibile, contratto precedente) × 2 percorsi (live e snapshot notturno), Chromium headless | SIMULATO | 8/8 pagine senza errori JS. Codice precedente sulle stesse risposte: riconciliazione "n/d" con dati validi, "Nuovi account 0" con Auth non disponibile (zero falso), `profili_firestore` errato. Codice nuovo: tutto corretto, contratto precedente invariato |
| 2 | Anteprima della dashboard (sintetica) | SIMULATO | `AUTOMAZIONI\_DEBUG\prova_contratto_dashboard_2026-10-16\anteprima_SIMULATA_*.html` + screenshot; la dashboard vera si rigenera con MENU → 1 → 6 |
| 3 | `npx vitest run` | REALE (unitari) | **54 file, 460 test superati** |
| 4 | `npm run build` | REALE | ok |
| 5 | `node scripts/verify-security-build.mjs` | REALE, **senza `functions/.env`** | 481 file ok, tracker legacy assente. **Il controllo dei segreti non ha avuto chiavi da cercare**: va rifatto sul PC, ed è già nella procedura di pubblicazione (sezione 7) |
| 6 | `test-security-emulator.cjs` (regole Firestore) | SIMULATO (emulatore) | **110 controlli superati** |
| 7 | Consenso, build locale servita come cortexapp.it: assente / accettato / negato / **revocato in un'altra scheda** | SIMULATO (Clarity, GA e telemetria finti) | 2/2, 4/4, 2/2, **7/7** |
| 8 | `app_open` dopo il consenso (PR #2): accetta / rifiuta | SIMULATO | ok / ok |
| 9 | Ospite anonimo che completa un ripasso (Auth + Firestore emulati) | SIMULATO | nessun `users/{anonimo}.activation` |
| 10 | Creazione → salvataggio appunti e carte → ripasso → riapertura (`verifica-generazione`: testo, malformato, rete, blocco, ocr\*, account) | SIMULATO (AI finta, emulatori) | 8/8, 4/4, 4/4, 2/2 (attesa AI 58 s), 3/3\*, 6/6 |
| 11 | TOLC → mazzo errori → ripasso → riapertura (`verifica-flusso-tolc`: 7 scenari) | SIMULATO | 11/11, 3/3, 4/4, 4/4, 1/1, 5/5, 4/4 |
| 12 | Esclusione degli anonimi dai conteggi (`tests/revisione-pr2-metriche-account-2026-10.test.js`, sezione vera di `functions/index.js` con Auth e Firestore finti) | SIMULATO | compreso nei 460 |

\* Scenario "ocr": nell'ambiente di prova la rete esterna era aperta, e senza blocco dei service worker lo script caricava il Tesseract vero (2/3). Con i service worker bloccati: 3/3. La stessa correzione dello script è nella patch separata `Desktop\cortex-patch-verifica-finale-20261015` (non applicata). Per non renderla inapplicabile, nel repository lo script è rimasto quello originale: `git apply --check` = ok.

## 6. Banner notifiche sopra il ripasso a 390 px: confermato e corretto
- **Riproduzione:** `scripts/banner-notifiche-2026-10/repro-390.cjs`. Ospite alla prima visita, mazzo normale (non TOLC), emulatori, tocchi reali.
  - 390×844: il banner (fisso, `z-index` 9000, 628–756 px) non copre i pulsanti, ma resta sopra lo studio.
  - **390×740 e 390×664** (altezze utili reali di un telefono): i tre pulsanti di valutazione sono sotto il banner. Il tocco su "La sapevo" **non valuta la carta**; a 664 px finisce su un pulsante del banner e lo chiude.
- **Causa:** il banner veniva nascosto solo per il mazzo errori TOLC (`modules/tolcErrorDeck.js`).
- **Correzione (`modules/study.js`):** il banner si nasconde all'avvio di ogni ripasso e torna alla chiusura, così la scelta sulle notifiche non va persa. Un banner già nascosto dal TOLC non viene toccato.
- **Prova:**
  - prima: 4/7 (740 px) e 3/7 (664 px); dopo: **7/7 a 844, 740 e 664 px**;
  - test unitario `tests/banner-notifiche-ripasso-2026-10.test.js` (4);
  - TOLC 7 scenari e generazione "testo" ripetuti dopo la correzione: tutti ok.
- **Stato:** non committata. Il prossimo backup notturno la committerà e la pubblicherà su `main`, come è successo stanotte.

## 7. Pubblicazione mirata (preparata, NON eseguita)
**Cosa serve pubblicare:** hosting (consenso tra schede, ospite anonimo fuori dall'attivazione, `app_open` al consenso, banner), `functions:telemetry` (visitatori `TEST_` fuori dai contatori) e `functions:adminDashboard` (contatori solo sugli account collegati, `guestProfiles`). Regole Firestore: invariate.

**Il menu effettivo:** `Desktop\MENU.bat` → `AUTOMAZIONI\menu.py` → **1 CORTEX**. `CORTEX.bat` del repository rimanda a `MENU.bat`.
- **2 "PUBBLICA SOLO SITO"** = `genera_sitemap.py` + test + build + `verify-security-build` + `deploy --only hosting` + IndexNow. **Non pubblica le Functions.**
- **1 "PUBBLICA TUTTO"** = `genera_sitemap.py` + `npm run deploy:security`. Comprende test, build, verify, regole sull'emulatore, `deploy firestore:rules`, **33 Functions** (tra cui `adminDashboard` e `telemetry`), hosting e IndexNow. Funziona, ma va oltre il necessario: regole e tutte le Functions.
- Nel menu non esiste una voce per pubblicare solo le due Functions.

**Procedura mirata** (cmd, dalla cartella del codice, `functions\.env` presente):
```bat
cd /d C:\Users\User\Desktop\PROGETTI\cortex
call npm test && call npm run build && node scripts/verify-security-build.mjs
npx firebase-tools deploy --project cortex-74a4e --only functions:adminDashboard,functions:telemetry
npx firebase-tools deploy --project cortex-74a4e --only hosting
```
- Le Functions vanno prima dell'hosting. La dashboard locale accetta già entrambi i contratti.
- Sitemap e IndexNow (voce 2) non servono per queste correzioni.
- Dopo la pubblicazione: MENU → 1 → 6 DASHBOARD. Si controlla che compaiano "Profili di account collegati" e "Ospiti anonimi con profilo".
- **Da qui `app_open` include i primi accessi, e i `TEST_` escono dai contatori: niente confronti prima/dopo senza una data di cesura.**

## 8. Decisioni aperte (non modificate)
- Consenso e tappe di attivazione per account (`users/{uid}.activation` scritte anche con consenso negato): da decidere rispetto all'informativa.
- Identificazione degli account di test lato server: oggi è escluso solo l'admin.
- Documenti `users/{anonimo}` già esistenti: restano in Firestore, esclusi dai conteggi.
- Revert di `main` remoto dopo il push notturno: decisione del proprietario.
- Patch `Desktop\cortex-patch-verifica-finale-20261015` (OCR, materiale aggiunto, limite di 300.000 caratteri): separata, non applicata. Si applica sullo stato attuale (`git apply --check` ok). Le sue prove vanno rifatte dopo #2 + #4, come dice il suo LEGGIMI.
