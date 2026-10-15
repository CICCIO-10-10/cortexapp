# Revisione PR #2 — consenso e tracciamento (16/10/2026)

Branch `fix/revisione-pr2-2026-10` (PR #4), sopra la testa della PR #2 (`93f076c`, ancora aperta, non unita). Niente merge, niente deploy, niente migrazioni di dati.
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
- **Limite:** questa correzione vale per i nuovi ripassi; i documenti anonimi **già** creati sono gestiti dal difetto 3.

### 3. Dashboard: ospiti anonimi (anche storici) contati come account
- **Definizioni verificate nel codice:** l'app supporta solo **Google** (popup/redirect) e l'accesso **anonimo** usato per l'AI dell'ospite; non esiste accesso email/password. In `adminDashboard` "account registrato" = utente Firebase Auth con `providerData` non vuoto, non disattivato, admin escluso: è la definizione già usata per registrazioni e utenti attivi.
- **"Email presente" non è un criterio valido:** alcuni profili Google non hanno l'email nel documento (dato mancante noto dal 12/09), quindi verrebbero esclusi pur essendo account; e l'email nel documento non dice nulla sul tipo di accesso. Il criterio usato è l'identità Auth.
- **Riproduzione (dati sintetici, sezione vera di `functions/index.js` eseguita con Auth e Firestore finti):** admin, ospite anonimo con vecchia `activation`, ospite anonimo non più in Auth, account Google attivato, account Google senza email nel profilo, account di test, abbonato `student` con Sparks, account disattivato.
  | Metrica | Prima | Dopo |
  |---|---|---|
  | `usersActivated` | 5 (anche 2 anonimi e il disattivato) | **2** |
  | `usersFirstReview` | 6 | **3** |
  | `usersPlanUnclassified` | 3 (2 anonimi + il profilo Google senza piano) | **1** (il profilo Google senza dati) |
  | `totalUsers` | 7 | **4** |
  | `usersDetail` | 7 righe, anonimi inclusi | 4 righe |
  | ospiti | — | `guestProfiles: { total: 1, activated: 1, firstReview: 1 }` |
- **Correzione (`functions/index.js`, solo lettura):** i contatori dai profili (`totalUsers`, `usersByPlan`, `usersPlanUnclassified`, `usersPlanComplete`, `usersWithFCM`, `usersWithSparks`, `usersActivated`, `usersAiActivated`, `usersFirstReview`, `usersStudyReturned`, `usersNoEmail`, `usersDetail`) si calcolano dopo l'elenco di Firebase Auth e solo sui profili degli account collegati. I nomi dei campi restano gli stessi.
  - Nuovi campi: `accountMetricsAvailable` e `guestProfiles` (profili di ospiti anonimi ancora in Auth: totale, con vecchia attivazione, con primo ripasso). I profili senza identità Auth restano solo in `firestoreProfilesWithoutAuth`.
  - Se Firebase Auth non risponde, questi contatori sono `null` (e `usersDetail` vuoto) invece di mescolare account e ospiti.
  - `usersNoEmail` ora significa "account collegati con email mancante nel profilo" (qualità del dato), non "anonimi".
  - **Nessun documento viene cancellato o modificato**; nessuna migrazione.
- **Account di test:** non esiste un marcatore lato server. Restano esclusi solo l'admin (uid fisso) e, nei percorsi, i visitatori `TEST_`/`cortex_no_track`. Un account Google usato per prove è contato come account: va escluso con un elenco di uid o un campo scritto dal server, da decidere.
- **Prova:** `tests/revisione-pr2-metriche-account-2026-10.test.js`, 5 test: sul codice precedente 4 falliti, dopo la correzione 5/5.
- **Deploy:** richiede il deploy della sola Function `adminDashboard` (`firebase deploy --only functions:adminDashboard`). Non eseguito. Le correzioni 1 e 2 sono codice del sito/app (build e hosting), non Functions. La dashboard locale (AUTOMAZIONI, non nel repository) deve accettare `null` su questi campi, come già fa per le metriche Auth.

## Metriche: cosa conta cosa (dal codice di `adminDashboard`)
| Metrica | Fonte | Esclusi |
|---|---|---|
| **Registrazioni** (`newUsersToday`, `registrationByMonth`) | Firebase Auth, solo account collegati (Google) | admin, anonimi, account disattivati durante il recupero |
| **Utenti attivi** (`usersActive7d`, `usersReturned`) | Firebase Auth: ultimo accesso o **refresh del token**, quindi **non** prova di studio | admin, anonimi |
| **Account** (`totalUsers`, `usersDetail`) | profili `users/{uid}` di account collegati in Firebase Auth | admin, anonimi (anche storici), disattivati, profili senza Auth |
| **Primo ripasso completato** (`usersFirstReview`) | `users/{uid}.activation.firstReviewCompletedAt`: sessione arrivata in fondo con ≥1 carta valutata. **Include il mazzo demo** | come "Account" |
| **Attivazione** (`usersActivated`) | `activation.activated`: primo ripasso completato **non demo** (`study.js` → `bumpActivation('cardsStudied')`). **Non** dipende da Sparks | come "Account" |
| **Paganti** (`usersByPlan.student/pro`) | campo `plan`, scritto solo dal server (Stripe/Play) | come "Account" |
| **Con Sparks** (`usersWithSparks`) | `sparksBalance > 0`, separato dai paganti | come "Account" |
| **Ospiti** (`guestProfiles`) | profili di utenti Auth anonimi: totale, vecchia attivazione, primo ripasso | metrica separata, mai sommata agli account |
| Visite e sorgenti, percorsi | tracker interno; i visitatori `TEST_` sono esclusi dai percorsi, e con la PR #2 anche dai contatori | `TEST_`, browser con `cortex_no_track` (non inviano nulla) |

**Dati di test:** i segnali espliciti sono l'admin (uid fisso), `cortex_no_track` e il prefisso `TEST_`. Nessun utente reale può avere un `cx_vid` che inizia con `TEST_` (sono UUID). I beta tester (`cortex_is_tester`) **non** sono esclusi, e non vanno esclusi: sono utilizzo reale.

## Osservazioni non corrette (fuori perimetro o decisioni)
- **Documenti anonimi già esistenti:** `users/{anonimo}` nasce anche dalla sincronizzazione della gamification (XP e streak). Ora sono esclusi dai contatori degli account (difetto 3) ma restano in Firestore: eliminarli o ripulirli è una decisione separata, non presa qui.
- **Da decidere — consenso e tappe di attivazione:** le tappe per account (`users/{uid}.activation`) rispettano `cortex_no_track` ma **non** il consenso cookie: sono scritte anche con consenso negato. Non è stato cambiato. Va deciso, rispetto all'informativa privacy, se sono dati di funzionamento del servizio (legittimo interesse, indipendenti dal banner) o misurazione (soggette al consenso). Nel secondo caso le metriche di attivazione conterebbero solo chi accetta.
- **Grafica, da integrare sul PC:** a 390 px, alla prima visita, il banner "Attiva le notifiche" (`.notif-banner`) copre la carta del ripasso e intercetta i tocchi. Per i mazzi errori TOLC viene già nascosto; per gli altri mazzi no. È un intervento sulla vista, da verificare sulla nuova grafica locale.

## Dipendenza tra PR e ordine di integrazione
- Questo lavoro è nel branch `fix/revisione-pr2-2026-10` (**PR #4**), costruito sopra `fix/verifica-tracciamento-2026-10` (**PR #2**) e con base la PR #2: contiene i commit della PR #2 e vanno integrati insieme, nell'ordine.
- **Ordine:** 1) PR #2 in `main`; 2) PR #4 (cambiare la base in `main` dopo il punto 1; il diff resta solo quello della revisione); 3) deploy hosting e `functions:adminDashboard`. La PR #3 è indipendente (non tocca questi file).
- Unire la PR #4 senza la PR #2 porterebbe dentro anche la PR #2.

## Comandi eseguiti
| Comando | Risultato |
|---|---|
| test nuovi prima delle correzioni | 4 falliti (2 revoca, 1 anonimo; 1 era un mio errore nel test, corretto) |
| test metriche account sul codice precedente | 4 falliti su 5 (il quinto verifica le metriche Auth, già corrette) |
| `npm test` (finale) | 49 file, **433 superati** |
| `npm run build` | ok |
| `node scripts/test-security-emulator.cjs` (regole Firestore) | **110 controlli superati** |
| `node scripts/verify-security-build.mjs` | si ferma sulle immagini non in git (asset sul PC, noto) |
| browser `assente` / `accettato` / `negato` / `revocato_altra_scheda` | 2/2, 4/4, 2/2, **5/7 → 7/7** |
| browser + emulatori, ospite anonimo che ripassa | **FAIL → OK** |

## Limiti
- Clarity e GA reali non sono stati contattati (sostituiti da registratori). Che `consentv2` e `consent update` fermino davvero la raccolta lato Google/Microsoft dipende da quei servizi; la ricarica resta il modo completo per scaricarli.
- Non verificati su telefoni reali, TWA, login Google vero, dashboard locale (AUTOMAZIONI) né dati di produzione.
