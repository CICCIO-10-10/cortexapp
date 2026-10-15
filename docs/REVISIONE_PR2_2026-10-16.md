# Revisione PR #2 — consenso e tracciamento (16/10/2026)

Branch `fix/revisione-pr2-2026-10`, sopra la testa della PR #2 (`93f076c`, ancora aperta, non unita). Niente merge, niente deploy.
Non sono stati toccati grafica, CSS, viste, `app.html` né file della PR #3.
Dati sintetici; servizi simulati o emulatori; nessuna scrittura in produzione, nessuna email, nessun acquisto.

## Come è stato verificato
| Tipo | Cosa |
|---|---|
| **Browser, "sito finto"** | build locale (`dist/`) servita come `https://cortexapp.it` dentro Chromium: **ogni** richiesta è intercettata. Clarity, GA e `/api/telemetry` sono registratori finti. Firebase e le CDN sono bloccati. Script: `scripts/revisione-pr2-2026-10/consenso-browser.cjs` |
| **Browser + emulatori** | Auth e Firestore emulati, regole del repository, account anonimo sintetico. Script: `scripts/revisione-pr2-2026-10/attivazione-anonimo-emulatori.cjs` |
| **Test unitari** | `tests/revisione-pr2-consenso-2026-10.test.js` |

## Risultati: consenso
| Caso | Esito | Prova |
|---|---|---|
| Consenso assente: apertura, navigazione, ricarica | ✅ nessun evento; Clarity e GA non scaricati | browser `assente` 2/2 |
| Accettato | ✅ Clarity e GA caricati **una** volta; `app_open` e `session_start` una volta | browser `accettato` |
| Navigazione dopo l'accettazione | ✅ nessun `app_open` o `session_start` in più | browser |
| Ricarica | ✅ un `app_open` per caricamento, `session_resume` (non una nuova sessione) | browser |
| Negato: apertura, navigazione, ricarica | ✅ nessun evento, nessun tracker | browser `negato` 2/2 |
| Revocato nella stessa scheda (banner/app) | ✅ (codice già esistente: rifiuto a Clarity e GA, poi ricarica) | lettura del codice |
| **Revocato in un'altra scheda** (pagina privacy) | ❌ → ✅ **difetto 1** | browser `revocato_altra_scheda` 5/7 → 7/7; 3 test |

## Difetti confermati e corretti
### 1. Revoca da un'altra scheda: Clarity e GA continuavano nella scheda già aperta
- **Riproduzione:**
  1. app aperta con il consenso accettato;
  2. in un'altra scheda, sulla pagina privacy, "Solo essenziali";
  3. si torna all'app. Il tracker interno si fermava (rilegge `localStorage` a ogni evento), ma Clarity continuava a registrare e GA non riceveva il rifiuto fino alla ricarica della scheda.
- **Causa:** `public/cortex-consent.js` applicava il rifiuto solo quando la scelta veniva fatta *nella stessa pagina*. La pagina privacy scrive la scelta direttamente e non carica `cortex-consent.js`.
- **Correzione (`public/cortex-consent.js`):** il rifiuto è estratto in `applyDecline()` e applicato anche all'evento `storage`, quando un'altra scheda imposta un valore diverso da `accepted` o svuota `localStorage`.
  - La scheda in background **non** viene ricaricata, per non perdere testo non salvato: il rifiuto vale subito, e gli SDK spariscono alla prossima apertura.
  - Un'accettazione in un'altra scheda non avvia nulla qui.
- **Prova:** senza correzione 2 test falliti su 3; con correzione 3/3. Browser 7/7.

### 2. Ospite con accesso anonimo contato tra gli utenti attivati
- **Riproduzione (emulatori, regole del repository):** l'ospite usa l'AI con un accesso **anonimo** (comportamento della PR #3 e di `main`); poi completa un ripasso.
  - **Prima:** nasce `users/{anonimo}.activation` con `activated`, `firstReviewCompletedAt`, `cardsStudied`, ecc.
  - **Dopo:** nessuna tappa di attivazione.
- **Impatto:** `adminDashboard` conta `usersActivated` e `usersFirstReview` da quel documento, quindi gli ospiti venivano contati tra gli "utenti" attivati. Le metriche da Firebase Auth invece li escludono, e il piano di tracciamento dice "per un ospite `bumpActivation` resta no-op". Dopo l'accesso Google (nuovo uid) la stessa persona poteva essere contata **due volte**.
- **Causa:** `_uid()` in `services/activation.js` restituiva anche l'uid anonimo.
- **Correzione:** per un utente anonimo `_uid()` restituisce `null`. Le tappe dell'ospite restano sul dispositivo (`core/studyMilestones.js`, eventi `review_first_completed`), come previsto.
- **Prova:** 2 test (l'anonimo faceva 3 scritture → 0; account invariato); browser + emulatori prima `FAIL`, dopo `OK`.
- **Limite:** i documenti anonimi **già** creati in produzione restano contati finché non si filtrano lato server (vedi sotto).

## Metriche: cosa conta cosa (dal codice di `adminDashboard`)
| Metrica | Fonte | Esclusi |
|---|---|---|
| **Registrazioni** (`newUsersToday`, `registrationByMonth`) | Firebase Auth, solo account collegati (Google) | admin, anonimi, account disattivati durante il recupero |
| **Utenti attivi** (`usersActive7d`, `usersReturned`) | Firebase Auth: ultimo accesso o **refresh del token**, quindi **non** prova di studio | admin, anonimi |
| **Primo ripasso completato** (`usersFirstReview`) | `users/{uid}.activation.firstReviewCompletedAt`: sessione arrivata in fondo con ≥1 carta valutata. **Include il mazzo demo** | admin; anonimi solo da ora in poi |
| **Attivazione** (`usersActivated`) | `activation.activated`: primo ripasso completato **non demo** (`study.js` → `bumpActivation('cardsStudied')`). **Non** dipende da registrazione né da Sparks | come sopra |
| **Paganti** (`usersByPlan.student/pro`) | campo `plan`, scritto solo dal server (Stripe/Play) | admin |
| **Con Sparks** (`usersWithSparks`) | `sparksBalance > 0`, separato dai paganti | admin |
| Visite e sorgenti, percorsi | tracker interno; i visitatori `TEST_` sono esclusi dai percorsi, e con la PR #2 anche dai contatori | `TEST_`, browser con `cortex_no_track` (non inviano nulla) |

**Dati di test:** i segnali espliciti sono l'admin (uid fisso), `cortex_no_track` e il prefisso `TEST_`. Nessun utente reale può avere un `cx_vid` che inizia con `TEST_` (sono UUID). I beta tester (`cortex_is_tester`) **non** sono esclusi, e non vanno esclusi: sono utilizzo reale.

## Osservazioni non corrette (fuori perimetro o decisioni)
- **Documenti anonimi già esistenti:** `users/{anonimo}` nasce anche dalla sincronizzazione della gamification (XP e streak), con o senza questa correzione. La dashboard li separa già (`firestoreProfilesOtherAuth`) ma li conta in `usersPlanUnclassified` e `usersNoEmail`, e — per quelli creati prima di questa correzione — in `usersActivated` e `usersFirstReview`.
  - **Proposta:** in `adminDashboard`, contare le metriche `activation` solo per gli uid di account collegati (`authLinkedUids`, già calcolato).
- **Consenso cookie:** le tappe per account (`users/{uid}.activation`) rispettano `cortex_no_track` ma non il consenso cookie (già segnalato nel rapporto della PR #2). Va verificato rispetto all'informativa privacy.
- **Grafica, da integrare sul PC:** a 390 px, alla prima visita, il banner "Attiva le notifiche" (`.notif-banner`) copre la carta del ripasso e intercetta i tocchi. Per i mazzi errori TOLC viene già nascosto; per gli altri mazzi no. È un intervento sulla vista, da verificare sulla nuova grafica locale.

## Comandi eseguiti
| Comando | Risultato |
|---|---|
| test nuovi prima delle correzioni | 4 falliti (2 revoca, 1 anonimo; 1 era un mio errore nel test, corretto) |
| `npm test` (finale) | 48 file, **428 superati** |
| `npm run build` | ok |
| `node scripts/test-security-emulator.cjs` (regole Firestore) | **110 controlli superati** |
| `node scripts/verify-security-build.mjs` | si ferma sulle immagini non in git (asset sul PC, noto) |
| browser `assente` / `accettato` / `negato` / `revocato_altra_scheda` | 2/2, 4/4, 2/2, **5/7 → 7/7** |
| browser + emulatori, ospite anonimo che ripassa | **FAIL → OK** |

## Limiti
- Clarity e GA reali non sono stati contattati (sostituiti da registratori). Che `consentv2` e `consent update` fermino davvero la raccolta lato Google/Microsoft dipende da quei servizi; la ricarica resta il modo completo per scaricarli.
- Non verificati su telefoni reali, TWA, login Google vero, dashboard locale (AUTOMAZIONI) né dati di produzione.
