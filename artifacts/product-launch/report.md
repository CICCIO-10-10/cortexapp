# Cortex è cresciuto — consegna del 14 settembre 2026

## Esito
Rebranding condiviso implementato nell’app esistente. Sei screenshot editoriali JPEG 1080 × 1920 esportati, con UI reale e indicazione dei contenuti di esempio. Nessun deploy e nessun rollout SEO aggiuntivo.

La direzione visiva è pronta per essere mostrata ai tester. **Non considero ancora validata una release pubblica Android**: restano da provare autenticazione, sincronizzazione, generazione AI, permessi e comportamento del pacchetto Android su dispositivo. Le prove qui sono nel browser, in modalità ospite. Non equivalgono a una certificazione completa di assenza di regressioni.

## Audit per area
| Area | Cosa mantenere | Debolezza osservata | Intervento / limite |
|---|---|---|---|
| Onboarding | Introduzione pratica e mazzo di esempio | Modali sovrapposti, superfici trasparenti, promessa “3×” non supportata | Overlay opaco, card leggibile, titolo “Dagli appunti al ripasso”. Rimane da semplificare la doppia introduzione |
| Dashboard | Accesso rapido alle attività e riepilogo quotidiano | Tutte le azioni avevano forte enfasi, gradienti e bagliori concorrenti | Azione Nuova materia evidente; card secondarie neutre; materie prima dei widget promozionali |
| Upload/editor | Più ingressi reali: file, foto, testo, audio | Densità e stili eterogenei | Input, pannelli e griglia mobile uniformati. Editor con testo esistente navigato; OCR e generazione cloud non completati |
| Flashcard | Domanda, risposta e autovalutazione | Pulsanti invisibili per opacity inline; altezza della carta copriva i controlli | Stato visible corretto e altezza del contenitore automatica; confermato passaggio carta 1 → 2 |
| Quiz | Opzioni chiare e feedback esplicito | Eccesso di enfasi decorativa | Opzioni coerenti con il tema; risposta corretta realmente verificata nel quiz quotidiano |
| Streak/obiettivo | Obiettivo modificabile e conteggio personale | Linguaggio punitivo “in pericolo”, singolare “1 Giorni” | Aspetto dei badge più sobrio. Microcopy legacy da correggere separatamente con le traduzioni |
| Cosa studiare oggi | Materie e conteggio delle carte da ripassare | Priorità poco evidente nella dashboard | Sezione portata subito dopo il blocco iniziale; nessun nuovo algoritmo di raccomandazione inventato |
| Ripasso dilazionato | Logica SRS e valutazione del ricordo | Comandi coperti dalla carta su mobile | Layout corretto, logica preservata, test SRS passati |
| Boss Mode / AI | Modalità esistente e accesso per materia | Da ospite appare una richiesta Google con copy generico sulle flashcard | Access gate navigato e chiuso. Combattimento/risposte AI non verificati; non usati come prova nella gallery |
| Materiale | Organizzazione per mazzi e menu contestuale | Demo usa title mentre viste leggono name; percentuale 100% anche con carte da ripassare | Fallback titolo e name nel nuovo mazzo demo. Percentuale legacy non cambiata: non va interpretata come padronanza |
| Navigazione / secondarie | Destinazioni e funzioni esistenti | Icone numerose, stili sovrapposti, avatar ospite vuoto | Etichette e stati resi più coerenti, avatar nascosto quando il suo stato richiede display:none. Focus, audio, network non certificati end-to-end |

## Design system applicato
- Fondo #090910; superfici #121219, #191820; testo #f1f0fa; secondario #b2adbf.
- Lilla #bfa1ff per azioni e accenti, bordo #302c3b; verde/rosso/ambra per feedback semantico.
- Famiglie locali DM Sans / Space Grotesk con fallback. Il codice legacy contiene ancora font inline: questo strato centralizza la direzione senza riscrivere tutti i componenti.
- Scala spazi 4 / 8 / 12 / 16 / 24 / 32; radius di base 14px; ombre leggere.
- Pulsanti primari lilla con testo scuro; secondari su superficie scura; focus visibile; controlli principali almeno 44px.
- Input leggibili, testo mobile 16px; griglia azioni a due colonne; overlay opachi; rispetto di prefers-reduced-motion.
- Effetti di rumore, nebulose e reveal decorativi neutralizzati. Flip delle carte mantenuto perché funzionale.

## File del rebranding
1. public/cortex-product.css — token e componenti condivisi, responsive, riduzione movimento, correzioni flashcard.
2. app.html — attivazione body.cortex-product, stylesheet e headline onboarding.
3. modules/home.js — gerarchia, copy delle azioni e sezione del prossimo ripasso; fallback nome materia.
4. modules/decks.js — fallback name/title nella visualizzazione dei mazzi.
5. core/onboarding.js — campo name per i nuovi mazzi dimostrativi, senza migrazione dei dati salvati.
6. ui/views/CreateDeckView.js — classe cortex-editor per il layout condiviso.

Le altre modifiche già presenti nel progetto relative al pilota SEO non fanno parte di questo rebranding. Nessun generatore SEO è stato eseguito per questa consegna. Autenticazione, API, salvataggio, analytics e algoritmo SRS non sono stati riscritti. Il controllo riguarda le modifiche effettuate, non un audit di sicurezza dell’intero progetto.

## Validazione
- Build produzione: PASS, 92 moduli; validazione i18n delle quattro lingue aggiuntive passata.
- Test: PASS, 46/46 (26 unitari e 20 SRS).
- Dashboard ed editor: misurati a 390, 768, 1024, 1440px; scrollWidth uguale a clientWidth in tutte le otto combinazioni. Dati in qa.json.
- Asset: il contatore grezzo rileva loci-img, elemento nascosto e senza src; non è un download fallito né un’immagine visibile rotta.
- Flashcard: domanda → risposta → valutazione positiva → carta 2 verificato. Pulsanti non più coperti.
- Quiz del giorno: risposta 6 alla somma CAB → “ESATTO!” con spiegazione 3+1+2, poi riepilogo “fatto”.
- Editor: aperto il materiale dimostrativo salvato; testo presente e campi conservati. Nessuna generazione fittizia.
- Console: nessun error JavaScript raccolto nel percorso finale; presenti avviso deprecazione Firestore e “Unknown page ID: app.html” all’ingresso diretto. Vedi console.json.
- Contrasto: palette principale leggibile; controllo visivo delle catture. Non è stata eseguita una certificazione WCAG completa delle molte superfici legacy.
- CLS: nessuna misura strumentale disponibile; non viene dichiarato un punteggio. Le modali e i contenuti caricati dinamicamente richiedono ancora una misura su dispositivo.
- Build segnala chunk app circa 634KB e import statici/dinamici misti. Da ottimizzare con una fase dedicata, senza introdurre frettolosamente cicli fra moduli.

## Storyboard e copy finale
| Ordine | Headline | Sottotitolo | UI reale | Obiettivo |
|---|---|---|---|---|
| 1 | Meno caos. Più connessioni. | Apri Cortex. Sai cosa fare. | Dashboard | Presentare il sistema e il prossimo ripasso |
| 2 | I tuoi appunti. Il tuo punto di partenza. | Foto, file e testo nello stesso spazio. | Editor | Rendere concreti gli ingressi del materiale |
| 3 | Una domanda. Un concetto. | Mettiti alla prova con le flashcard. | Domanda di una carta | Spiegare il richiamo attivo |
| 4 | Ogni giorno, una nuova sfida. | Prova il quiz del giorno. | Domanda e opzioni | Comunicare una piccola attività quotidiana |
| 5 | Trova il tuo ritmo. | Scegli il tuo obiettivo quotidiano. | Selettore obiettivo | Comunicare autonomia e costanza |
| 6 | Ripassa. Al momento giusto. | Valuta il ricordo. Continua con Cortex. | Risposta e pulsanti SRS | Chiudere sul ciclo di studio, con CTA leggera |

Composizione: marchio tipografico, headline dominante, un’unica schermata in cornice semplice, accento lilla limitato. UI non ricostruita né risultati generati: le catture provengono dalla sessione ospite con mazzo dimostrativo. Numeri personali visibili sono stati prodotti dalla sessione di prova e non sono statistiche sul prodotto. Sei immagini anziché otto evitano ripetizioni: “cosa studiare oggi” è già la prova centrale della prima.

## Consegna e avvio
Aprire index.html tramite il server locale per la gallery. File finali: play-store-01.jpg … play-store-06.jpg, tutti 1080 × 1920. Le slide HTML sono le composizioni modificabili. Prima/dopo: before-live-home.png e screen-home.png; onboarding: before-live-onboarding.png e after-onboarding.png (catture raccolte durante il lavoro; non stesso stato/dimensione per ogni confronto).

Dalla cartella del progetto: npm run dev -- --host 127.0.0.1 --port 5175. App: http://127.0.0.1:5175/app.html?notrack=1&guest=1. Gallery: http://127.0.0.1:5175/artifacts/product-launch/index.html.

## Raccomandazione di lancio
**Sì a una beta presentata con la nuova identità; no a dichiarare già validato il lancio pubblico.** Prima della pubblicazione: verificare un ciclo completo Google → upload PDF/foto → generazione → salvataggio → riapertura su secondo dispositivo; provare Boss e audio con servizi attivi; verificare tastiera, back Android, permessi, safe area e offline su dispositivo; chiarire il significato della percentuale nei mazzi e il doppio onboarding. Sono verifiche funzionali precise, non ulteriori redesign.
