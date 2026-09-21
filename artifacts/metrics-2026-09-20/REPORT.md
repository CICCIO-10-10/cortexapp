# Cortex — misurazione e design, 20 settembre 2026

## Verifica pubblicazione effettuata il 21 settembre
Il precedente stato "nessun deploy" è superato: dopo la pubblicazione dell'utente ho verificato il sito reale.
- Tutte le 19 pagine selezionate, il bundle app-D4r2i4tf.js, cortex-product.css e cortex-marketing.css rispondono HTTP 200 e coincidono byte per byte con la build locale. Dettagli in live-deploy-check.json.
- /home include il nuovo CSS. /app contiene i controlli account condizionali, il messaggio di stato, la protezione Clarity e non contiene più la nota lunga delle impostazioni.
- Browser su produzione con notrack: ospite riconosciuto, Accedi con Google visibile, logout nascosto, nessun errore console catturato nel controllo. Tecniche: nessun overflow o sovrapposizione barra/titolo a 1440/1024/768/390.
- adminDashboard risponde e restituisce coverage.trackingVersion=2 con la sequenza: anche il nuovo backend è pubblicato. Campione osservato: 1483 eventi; coverage.ordered=false indica il fallback di lettura non ordinata. Non va interpretato come campione cronologico completo. Generazioni nella sequenza: ancora 0; questo controllo non prova la ricezione di una nuova generazione reale.
- Il login/logout Google reale non è stato eseguito: nessuna conferma inventata del ciclo completo o della foto dell'account personale. L'errore storico `t is not defined` non si è ripresentato nei percorsi visitati, ma non è dimostrata la sua assenza da ogni percorso.

## Aggiornamento 21 settembre: bug UI e account
- Corretto il conflitto tra barra e contenitore app a schermo fisso: desktop ora usa il flusso normale della pagina; la navigazione mobile resta in basso. Nessuna sovrapposizione titolo/barra o overflow osservato su Tecniche, Materiale, Network e Lezioni a 1440, 1024, 768 e 390 px.
- Stato account derivato dall'utente Firebase confermato. Sessione anonima = ospite, non account Google. Ripuliti i dati identificativi residui, senza cancellare mazzi o progressi.
- Avatar risolto anche dai dati del provider Google quando manca nel profilo principale; fallback alle iniziali se l'immagine non è disponibile. Il pulsante profilo è accessibile da tastiera.
- Disconnessione spostata nella sezione Account e visibile solo agli account registrati. Agli ospiti compaiono stato esplicito e accesso Google. Eliminata la nota lunga nel footer impostazioni.
- Logout attende Firebase: se fallisce mostra errore e non finge di essere riuscito; se riesce pulisce i flag e apre `/app?login=1`. Entrare volontariamente come ospite rimane possibile.
- Verifica browser locale: ospite con accesso Google visibile e logout nascosto, nessun errore console catturato nella verifica impostazioni. Login Google reale, foto reale e sign-out del proprio account non eseguiti nel browser dell'utente: restano da verificare dopo pubblicazione, senza simulare un esito positivo.
- Totale finale: 54 test passati, build riuscita, diff SEO positivo per tutte le 19 pagine. Nuovi file: core/account-state.js, tests/account-state.test.js e tests/logout.test.js. Aggiornati anche core/appBoot.js, services/firebase.js, app.html e public/cortex-product.css.
- La navigazione locale avviene da `/app.html?notrack=1&guest=1`; il server Vite non replica tutti i rewrite Firebase quando si ricarica direttamente una rotta interna. Per la verifica produzione servono i rewrite Hosting già presenti.

## Stato
Modifiche locali, nessun deploy Hosting o Functions. Dashboard locale aggiornata mantenendo i dati originali. I nuovi eventi e il nuovo riepilogo server richiedono pubblicazione prima di produrre nuovi dati reali. Nessun recupero retroattivo inventato.

## Correzioni
- Dashboard: eliminate percentuali di conversione e perdite ottenute confrontando pageview, account e abbonamenti di popolazioni diverse. Indicatori indipendenti, etichette Auth/chiamate AI esplicite, date dei file social separate dalla generazione del report. Il refresh app non dichiara aggiornati i social.
- Generazioni: registrate su output AI riuscito nei percorsi PDF/foto/testo e generatore del mazzo. Salvataggio manuale distinto dalla generazione. Contatori di attivazione aggiornati dagli stessi punti di successo.
- Invio eventi: retry limitato con ID stabile, cattura errori asincroni e diagnostica locale; rispetto di `cortex_no_track` anche nei flush e heartbeat.
- Server: conteggi indipendenti per browser e sequenza ordinata apertura → generazione → studio sullo stesso identificatore. Periodo, limite e fallback non ordinato espliciti. Errore di lettura = dato non disponibile.
- Limiti: browser ≠ persona; campione degli ultimi 4.000 eventi (3.000 nel fallback). Non è retention per coorte né attribuzione social individuale. Le metriche precedenti al deploy restano incomplete.

## Design
Sei aggiunte esplicite al registro: TOLC-SPS, PSI, E, SU, S e Ripetere il TOLC. Il pilota precedente di 13 pagine resta attivo: totale 19 selezionate, nessun rollout generale. Palette, font, bordi e spaziature allineati all'app. Le 5 UniMe protette restano invariate.

`/home` riceve un foglio di presentazione separato, con lo stesso linguaggio dell'app. Nessuna sostituzione del contenuto o dei collegamenti.

## Verifiche
- 51 test superati, inclusi sequenza/deduplicazione, retry/opt-out e protezione Clarity su localhost.
- Build Vite e validazione traduzioni superate; avvisi preesistenti su dimensione bundle/import misti.
- Prima passata browser: 7 pagine prioritarie × 4 larghezze (1440/1024/768/390), nessun overflow, immagine mancante o errore JS; CLS osservato 0 in condizioni locali.
- Diff SEO: 19 pagine senza differenze di testo, heading, title, description, canonical, robots, schema, href, immagini e ID; nessun output non selezionato modificato. Vedi `seo/seo-diff.json`.
- I servizi esterni sono bloccati nelle verifiche locali: non è una verifica end-to-end della generazione AI o della raccolta in produzione.

## Suggeritore TikTok: 12 cicli, 14–20 settembre
Tutti `SHADOW_ONLY`, tutti `LOW_CONFIDENCE`, nessun vincitore verificato. 9 confronti `UNRESOLVED`, 3 `DIFFERENT`: diverso non significa migliore. Il suggeritore non controlla le pubblicazioni.

Nel pomeriggio `listicle_tolc_ansia_2` è primo senza campioni: punteggio neutro 50 e spareggio lessicografico, non evidenza di efficacia. La sera la famiglia del primo candidato dispone di 2 campioni. Nell'ultimo ciclo soltanto 1 degli 8 candidati ha qualche evidenza diagnostica. Le raccomandazioni tematiche risultano vecchie di circa 18 giorni, anche se il blocco conversione viene aggiornato separatamente.

Priorità consigliate:
1. Collegare ID contenuto/revisione → ID post pubblicato → rilevazioni metriche, includendo quiz e curiosità dei generatori speciali. Non usare il solo nome della cartella o la somiglianza della caption come attribuzione certa.
2. Separare "senza dati / esplorazione" da "supportato da dati"; a parità di punteggio neutro non presentare un numero uno come raccomandazione.
3. Misurare post alla stessa età (per esempio 24h, 72h, 7 giorni), con data per singola rilevazione; aggiornare la classifica tematica separatamente dal blocco conversione.
4. Tenere separati reach, completamento/salvataggi e ingresso/studio in Cortex. I giorni con più ingressi non provano quale dei due post li abbia causati.
5. Testare il format paradossi come serie identificabile: domanda → scelta → spiegazione visiva → verifica. Confrontare contenuti omogenei prima di promuovere il suggeritore da osservatore a selettore.

Nessuna modifica al publisher, ai suoi pesi o alle approvazioni social è stata effettuata.

## Clarity: configurazione salvata e diagnosi
Verificati nella tabella del progetto due imbuti salvati:
- Cortex | Hub e landing → ingresso app
- Cortex | Catalogo TOLC → ingresso app

Le condizioni URL sono limitate a https://cortexapp.it: escludono localhost. Gli imbuti Clarity descrivono passaggi nella stessa sessione, non retention o persone uniche. Il funnel interno generazione → studio resta da configurare dopo la ricezione degli eventi reali: oggi il catalogo contiene soltanto eventi automatici, non questi eventi applicativi.

Negli ultimi 3 giorni osservati: 325 sessioni, 323 identificatori unici, 1,01 pagine/sessione, 2 sessioni con errore `t is not defined`. L'errore richiede ancora correlazione con registrazione e versione del bundle; non è stato attribuito arbitrariamente a una funzione. Il 100% di nuovi visitatori non prova assenza di ritorni. Il campione includeva URL locali: le misure globali non rappresentano esclusivamente utenti di produzione.

Corrette localmente le chiamate TOLC che usavano `window.track` opzionale invece dell'import reale. Aggiunto inoltro a Clarity dei soli nomi di azione, senza parametri o contenuti. La protezione del bootstrap evita localhost e opt-out sulle pagine Vite e sugli output selezionati che contengono Clarity; non costituisce copertura di tutte le 262 pagine. Diverse pagine SEO prioritarie non contengono il tracker, quindi non si può dedurre il loro abbandono da Clarity.

Fonti: [imbuti](https://learn.microsoft.com/en-us/clarity/setup-and-installation/funnels), [API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api). La documentazione Microsoft esclude l'uso su siti/app destinati a minori di 18 anni: Cortex si rivolge anche a studenti scolastici. Questo punto va risolto prima di pubblicare o ampliare la raccolta Clarity. Non ho cambiato consenso, mascheramento o dati identificativi.

## Consegna e punti aperti espliciti
- Landing navigabile: http://127.0.0.1:5180/home.html?notrack=1
- SEO prioritaria: http://127.0.0.1:5180/tolc-sps?notrack=1
- Home controllata anche a 1440/1024/768/390 senza overflow o immagini rotte. La FAQ risponde al clic; manca un attributo aria-expanded nel componente preesistente.
- Diff SEO finale positivo: 19 pagine invariate nei contenuti; per home autorizzate soltanto classe body e foglio CSS, verificate reversibili rispetto all'hash originale. Le 5 UniMe protette restano identiche.
- Il copy originale della landing contiene affermazioni non documentate qui: +40%, 3x, migliaia di studenti e contatori nelle simulazioni social. Non sono dati verificati e non vanno interpretati come prova dei risultati di Cortex. Questo passaggio ha preservato il copy; serve una revisione editoriale prima della pubblicazione.
- Nessun deploy. Per attivare le correzioni servono Hosting e funzione adminDashboard; poi verificare con un percorso reale consentito e soltanto dopo costruire l'imbuto interno. Nessun backfill inventato.
- Non è completata una diagnosi causale dell'abbandono: sono state eliminate fonti di errore nella misura. Nessuna evidenza attuale permette di attribuire un aumento di registrazioni a uno specifico ciclo TikTok.

## File interessati
- Dashboard: AUTOMAZIONI/cortex_dashboard_local.py, cortex_dashboard_local.tpl.html, cortex_dashboard_local.html; copie precedenti in AUTOMAZIONI/_backup_metrics_20260920.
- Tracciamento: core/analytics.js, core/journey.js, modules/pdfToFlashcards.js, deckCreate.js, deckForm.js, tolcSim.js; functions/index.js e journey-summary.cjs.
- Design: home.html, public/cortex-marketing.css, public/cortex-design/tokens.css e seo-adapters.css.
- Selezione/build: scripts/seo-pages.json, seo-design-plugin.mjs, tracking-guard.mjs, check-seo-invariants.mjs.
- Verifica: tests/journey-summary.test.js, journey-delivery.test.js, tracking-guard.test.js; scripts/verify-refinement.mjs e gli artefatti di questa cartella.
