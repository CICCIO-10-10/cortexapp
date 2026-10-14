# Verifica tracciamento: ingresso → TOLC → mazzo errori → ripasso → ritorno (14/10/2026)

Branch `fix/verifica-tracciamento-2026-10`, da `main` @ `6b5b85a` (PR #1 inclusa). Niente merge, niente deploy.
Letti prima `docs/TRACKING_PLAN.md` e `docs/VERIFICA_FLUSSO_TOLC_2026-10-14.md`: il flusso dei dati TOLC (mazzo, salvataggio, account) è già verificato lì e non è stato ripetuto.
Solo dati sintetici: Firestore finto e browser locale con un raccoglitore di eventi in pagina e la rete esterna bloccata. **La dashboard locale (AUTOMAZIONI) non è in questo repository e non è stata verificata.**

## Come funziona la catena (dal codice)
`track()` (`core/analytics.js`) → GA4/Clarity (solo in produzione e con consenso) + `__cxLogStep` (`core/journey.js`) → `__cxSendTelemetry` (`public/cortex-telemetry.js`, solo su cortexapp.it) → Cloud Function `telemetry` (`functions/telemetry.js`) → `journeys/{vid}/events` → `adminDashboard` (ultimi **7 giorni**, esclusi i `vid` che iniziano con `TEST_`) → `functions/journey-summary.cjs`.
**Unità di conteggio:** browser (`cx_vid` in localStorage), non persone, account o sessioni. Un eventId ritrasmesso non viene contato due volte (`tx.create` sull'eventId).

## Difetti riprodotti e corretti

### 1. `app_open` mancava al primo accesso se il consenso arrivava dopo l'avvio
- **Riproduzione:** browser pulito, `/app`, poi "Accetta" nel banner (`scripts/verifica-tracciamento-2026-10/consenso-app-open.cjs`). Prima: dopo il consenso arrivava solo `session_start`; `app_open` compariva solo dopo un refresh. Anche 3 test unitari.
- **Causa:** `bootApp` emetteva `app_open` una sola volta all'avvio, e `track()` lo scartava (giustamente) perché il consenso non c'era ancora. `session_start`, invece, aspetta il consenso.
- **Impatto:** un browser al primo accesso non entrava in `app_open` né nel percorso ordinato `appActivation`, che inizia da `app_open`, finché non ricaricava l'app. Il conteggio di `app_open` era quindi sottostimato proprio per i nuovi visitatori.
- **Correzione:** `trackWhenConsented()` invia `app_open` subito se il consenso c'è già. Altrimenti lo invia **una volta**, quando la persona accetta (`cortex-consent.js` emette `cortex:consent-accepted`). Non lo invia mai prima del consenso, né se si rifiuta, né con `cortex_no_track`.
- **Prova:** nel browser, con l'accettazione: `[app_open, session_start]`; con il rifiuto: nessun evento, nemmeno dopo il refresh.
- **Nota:** l'evento descrive l'apertura della sessione in cui si accetta, come `session_start`. Gli altri eventi avvenuti prima del consenso restano persi, come è giusto.

### 2. I visitatori `TEST_…` entravano nei contatori di visite e presenza
- **Riproduzione:** test con Firestore finto. Due eventi di un visitatore `TEST_e2e_1` producevano `{app:1, landing:1, src_diretto:2}` nel contatore del giorno e una presenza "online".
- **Causa:** `adminDashboard` esclude i `TEST_` dai percorsi, ma `functions/telemetry.js` li contava in `analytics/pageviews_<data>` (visite e sorgenti) e in `analytics/presence`.
- **Correzione:** per i `TEST_` l'evento resta registrato, ma non incrementa visite, sorgenti e presenza. **Vale solo dopo il deploy della funzione `telemetry`**, e i contatori storici restano come sono.

## Cosa è affidabile
- **Consenso e blocchi:** nessun evento parte senza `cortex_cookie_consent = accepted`. `cortex_no_track` (anche da `?notrack=1`, salvato in modo permanente) e il rifiuto fermano GA4, Clarity e tracker interno. GA4 e Clarity partono solo su `https://cortexapp.it`; il tracker interno solo dalle origini di produzione. Lo snippet storico `cx-journey-lite`, che scriveva senza consenso, è nei sorgenti ma viene sostituito nella build: 0 occorrenze in `dist` (verificato).
- **Primo ripasso completato** (`review_first_completed`): parte quando una sessione arriva in fondo con almeno una carta valutata. Chiudere a metà o una sessione senza voti non contano. Una volta per **dispositivo**. Porta `type` (ospite/account) e `flow` (`tolc_errors` / `deck` / `demo`).
- **Mazzo errori TOLC:** gli eventi del percorso sono emessi una volta per mazzo o per tentativo; i doppi clic sono già stati verificati nella verifica TOLC.
- **Percorsi:** ordinati per browser, i rami restano separati. I tentativi TOLC hanno come unità il tentativo (`attempt`).

## Cosa i numeri riportati permettono di concludere (e cosa no)
- **"22 browser con apertura app, nessuna generazione AI".**
  - **Cosa conta `app_open`:** solo i browser che avevano già il consenso all'avvio (difetto 1). Comprende anche chi arriva dal link diretto al simulatore TOLC, e il percorso TOLC crea il mazzo errori **senza AI**, per scelta.
  - **Quando parte `cards_generation_started`:** solo dopo aver inserito un testo o caricato un file, quindi aprire la pagina di creazione non basta. Non esiste un evento "pagina di creazione aperta".
  - **Conclusione possibile:** nessuno di quei browser ha inviato materiale alla generazione. Che sia un problema dell'interfaccia non si può dire.
- **"2 primi ripassi, nessun ritorno il giorno dopo".**
  - **Campione:** con 2 casi non si può concludere nulla.
  - **Cosa misura `study_returned_next_day`:** nonostante il nome, è la *prima carta valutata in un qualsiasi giorno successivo*, con `days_after`.
  - **Perché il giorno dopo spesso non può scattare:** dopo il primo ripasso, una carta nuova segnata "Sapevo" torna in scadenza dopo circa **2–4 giorni** (intervallo 1 × facilità 2,5, con variazione ±5%). Chi segna tutto "Sapevo" il giorno dopo non ha carte da valutare: se riapre l'app ottiene `study_start_failed` con motivo `nothing_due` e nessun ritorno.
  - **Altri limiti:** finestra di 7 giorni, stesso browser e consenso già presente al primo ripasso. Il primo ripasso è salvato sul dispositivo anche senza consenso, ma l'evento non parte; così il ritorno può arrivare senza un "primo ripasso" a monte e il percorso ordinato `review` non lo conta.
- **"Traffico interno".** In `core/journey.js`, la sorgente `interno` significa *referrer = una pagina di cortexapp.it*, per esempio la landing, quando la sorgente non era stata ancora salvata (tipicamente: niente consenso sulla landing, consenso in app). **Non indica test interni.** Anche le etichette di sorgente non sono coerenti tra i due script:

  | Caso | `cortex-telemetry.js` (landing) | `journey.js` (app) |
  |---|---|---|
  | senza referrer | `direct` | `diretto` |
  | referrer cortexapp.it | `referral` | `interno` |
  | YouTube / Reddit | `referral` | `youtube` / `reddit` |

  Vince il primo script che salva `cx_src0`. Non è stato corretto: cambiare le etichette spezzerebbe la continuità della dashboard locale, che qui non posso vedere.
- **Test interni.** Gli unici segnali espliciti sono `cortex_no_track` (gli eventi non partono proprio) e il prefisso `TEST_` (escluso dalla dashboard). L'admin, quando accede, imposta `cortex_no_track`, ma ciò che ha fatto **prima** dell'accesso su quel browser è già stato inviato. Separare altro (IP, dispositivi, sorgente `interno`) sarebbe una classificazione arbitraria: non è stata fatta.

## Cosa manca (non aggiunto: sarebbero nuove funzionalità)
- Un evento "pagina di creazione aperta", per distinguere "non è entrato" da "è entrato e non ha generato".
- Una misura del ritorno *come visita* il giorno dopo (es. `session_start` dello stesso browser in un giorno successivo): oggi si misura solo il ritorno *a studiare*.
- `adminDashboard` non passa al riepilogo `account_type` né `count`, quindi la divisione ospite/account esiste solo dove l'evento ha un suo `type` (primo ripasso, ritorno, mazzo errori).
- `guest_ai_gate_shown` e `guest_ai_gate_login` non sono nel riepilogo; c'è solo `guest_ai_gate_dismiss`.

## Decisioni da prendere
- **Tappe di studio per account** (`users/{uid}.activation`: `firstReviewDay`, `studyReturnedDay`): rispettano `cortex_no_track` ma **non** il consenso cookie. Va verificato rispetto all'informativa privacy.
- **Mazzo demo:** il primo ripasso per account lo conta e non salva da quale mazzo viene; l'attivazione invece lo esclude.
- **Stato per dispositivo:** due account sullo stesso browser condividono le tappe di studio (`cortex_first_review_day`), coerentemente con l'unità "browser".

## Controlli da fare in locale sulla dashboard (AUTOMAZIONI)
Campi che deve leggere da `adminDashboard` → `journeyFunnel` (finestra `coverage.windowDays` = 7, unità `coverage.unit` = `browser_id`):
1. **Apertura → generazione:** `v3.paths.appActivation` (`app_open` → `cards_generation_started` → …) e `v3.steps.cards_generation_failed` con `v3.breakdown.gen_fail_reason`. Dopo il deploy di questa PR `app_open` include anche i primi accessi: **non confrontare prima e dopo senza una data di cesura**.
2. **TOLC:** `v3.paths.tolcAttempt`, `v3.attempts` (unità = tentativo) e `v3.paths.tolcLocalDeck`.
3. **Ripasso e ritorno:** `v3.paths.review`, `v3.breakdown.review_first_flow` (separare `demo`), `review_first_type`, `returned_days_after` (`1` = davvero il giorno dopo), `returned_type`, `v3.steps.study_start_failed` + `breakdown.study_start_failed_reason.nothing_due`.
4. **Account (più dispositivi):** `usersFirstReview` e `usersStudyReturned` vengono da `users/{uid}.activation`, non dagli eventi. Non sommarli ai browser.
5. **Sorgenti:** `src_interno`, `src_diretto` e `src_direct` vanno letti con le definizioni sopra. `interno` ≠ test interni.
6. **Test:** verificare che i `vid` `TEST_` non compaiano. I contatori di visite li escludono solo dopo il deploy di `telemetry`.
7. **GA4 vs tracker interno:** non confrontarli senza dati: sono sistemi diversi (GA4 può essere bloccato dagli ad-blocker; il tracker interno passa da `/api/telemetry`) e non è stato verificato nulla in proposito.

## Verifiche eseguite
| Comando | Risultato |
|---|---|
| nuovi test (`tests/tracciamento-verifica-2026-10.test.js`) prima delle correzioni | 4 falliti (1 `TEST_`, 3 `app_open`) |
| `npm test` (dopo) | 47 file, **422 superati, 1 saltato** |
| `npm run build` | ok; `cortex:consent-accepted` presente in `dist/cortex-consent.js` |
| browser `consenso-app-open.cjs accetta` / `rifiuta` | prima: `app_open` assente dopo il consenso; dopo: presente una volta; con il rifiuto nessun evento |

**Non verificati:** dati reali, dashboard locale, GA4, Clarity, telefoni reali, TWA.
