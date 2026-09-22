# Cortex — verifica del 21 settembre 2026

Questo aggiornamento sostituisce gli stati precedenti di deploy, indice e login. Non dichiara completata la raccolta degli eventi di generazione in Clarity.

## 1. Dashboard: completato

Creata dalla console Firebase l'indicizzazione del campo `events.ts`, ambito gruppo di raccolte, ordine decrescente. Nessuna modifica alle regole di sicurezza o ai permessi.

La risposta live di adminDashboard conferma `coverage.status=ok`, `ordered=true`, `limited=false`, `trackingVersion=2`, con 2007 eventi nel campione. Diagnostica aggregata in `journey-live-check.json`.

Lo zero nel passaggio sequenziale generazione → studio resta uno zero osservato, non una prova di abbandono o di mancato utilizzo. L'indice ripara il recupero ordinato; non ricostruisce eventi storici mancanti.

## 2. Generazione, studio e Clarity: verifica funzionale completata, imbuto completo in attesa

Test reale sull'app pubblicata: testo di fotosintesi → 8 flashcard → salvataggio del mazzo → apertura ripasso. Nessun errore di console osservato. Non sono state inviate valutazioni delle carte.

Il mazzo di prova rimane nell'account con nome `TEST QA Cortex — fotosintesi — 21 settembre`. Il salvataggio ha assegnato automaticamente 30 XP. Il test usa l'account amministratore escluso dal tracciamento: non dimostra la ricezione degli eventi in Clarity e non è stato contato artificialmente come conversione.

Tre imbuti salvati e verificati nella tabella Clarity:
- Cortex | Hub e landing → ingresso app
- Cortex | Catalogo TOLC → ingresso app
- Cortex | Ingresso app → avvio studio (`app_open` → `study_session_start`)

Clarity riceve eventi API reali: app_open, onboarding_start, onboarding_complete, tolc_sim_open, tolc_sim_complete, study_session_start. Al controllo, study_session_start risultava in una sessione. Il catalogo non offre ancora `cards_generated`, quindi non è possibile salvare da questa UI il percorso completo con quel passaggio. Non sono stati usati clic sul pulsante Genera come sostituto della generazione riuscita, né inviati eventi fittizi.

Punto ancora aperto: dopo la prima generazione realmente tracciata e processata da Clarity, aggiungere un imbuto separato `app_open` → `cards_generated` → `study_session_start`. Il terzo imbuto attuale misura l'avvio dello studio anche su mazzi esistenti: non misura la conversione della generazione.

## 3. Google account: completato

Verificato sul sito live con account reale: login Google, foto profilo caricata, logout, ritorno alla richiesta di accesso, nuovo login con foto ripristinata. Distinzione ospite/account e rimozione dell'identità obsoleta verificate anche dai test automatici.

## 4. Errore t is not defined: corretto e pubblicato

Riprodotto in `core/ui.js` durante il passaggio offline: mancava l'import della funzione di traduzione `t`. Aggiunto l'import. Il test di regressione `tests/ui-network.test.js` falliva prima della modifica e passa dopo, coprendo offline e riconnessione. Questo identifica una causa riproducibile, senza attribuire arbitrariamente tutte le registrazioni storiche allo stesso stack.

Suite completa: 55 test superati in 8 file. Build e validazione traduzioni riuscite. Rimangono gli avvisi preesistenti sulle dimensioni dei bundle e import misti.

Chiusura serale: aggiunti tre test del collegamento analytics, per inoltro generazione/studio senza payload a Clarity, rispetto dell'opt-out e isolamento degli errori Clarity. Suite finale: **58 test superati in 9 file**. Si tratta di test locali con destinatari simulati, non di eventi inviati al servizio. Nessuna modifica aggiuntiva al codice di produzione dopo il deploy.

Ultimo controllo serale del catalogo Clarity: nove eventi disponibili, incluso study_session_start, ma ancora nessun cards_generated. La configurazione dell'imbuto completo resta quindi bloccata dalla disponibilità di quell'evento nella UI. Nessun monitor o intervento automatico programmato; lavoro fermato per oggi come richiesto.

Pubblicato Firebase Hosting, progetto cortex-74a4e, sito cortex-app. Verificato su cortexapp.it il bundle `/assets/app-Dail6kqi.js`: HTTP 200 e SHA-256 identico alla build locale. Evidenza in `ui-fix-live-check.json`. Nessun ulteriore deploy richiesto all'utente per questa correzione.

## Ambito preservato

## Aggiornamento Clarity: otto imbuti salvati

Alla richiesta successiva di completare la configurazione sono stati aggiunti e verificati:
- Cortex | Ingresso → onboarding completato: app_open → onboarding_start → onboarding_complete.
- Cortex | Ingresso → TOLC completato: app_open → tolc_sim_open → tolc_sim_complete.
- Cortex | Dopo onboarding → avvio studio: onboarding_complete → study_session_start.
- Cortex | TOLC aperto → completato: tolc_sim_open → tolc_sim_complete.
- Cortex | Onboarding iniziato → completato: onboarding_start → onboarding_complete.

Con i tre precedenti, tutti gli otto sono visibili nel selettore della dashboard. I due percorsi diretti isolano chi avvia effettivamente l'attività, senza obbligare il passaggio app_open nella stessa sequenza.

Nel filtro visualizzato «Ultimi 3 giorni», i percorsi diretti riportano: onboarding 38 sessioni iniziali → 2 completate (5,26%); TOLC 40 aperture → 4 completamenti (10%). Sono risultati della sequenza nella stessa sessione, su un campione piccolo e con tracking appena modificato. Non provano che il resto degli utenti abbia definitivamente abbandonato: eventi mancanti, sessioni successive e ordine di emissione devono essere esclusi prima di attribuire una causa. Le registrazioni dei mancati completamenti sono accessibili dai pulsanti del relativo passaggio.

Priorità diagnostica: onboarding, poi TOLC. Il funnel cards_generated resta non configurabile perché l'evento non compare ancora nel catalogo ricevuto. Nessun evento sintetico immesso per sbloccarlo. Nessun nuovo deploy necessario per gli otto imbuti.

Nessun rollout generale delle pagine SEO, nessun cambio intenzionale a testi, metadata, canonical, noindex o alle cinque landing UniMe. Rimane attiva la selezione precedente di 19 pagine. Nessuna modifica a fatturazione, pubblicazione Google Play, publisher social o regole Firebase.
