# Cortex — migrazione SEO pilota

## Esito e perimetro

Implementate **13 pagine su 262**, con trasformazione esclusivamente visuale in dev, preview e build. Nessun deploy e nessun rollout completo. Gli HTML sorgenti sono intatti. Le cinque landing UniMe storiche sono esplicitamente escluse dal registro e copiate nella build senza variazioni di byte.

L'identità deriva dalla homepage prototipo in `C:/Users/User/Desktop/cortex-landing`: nero `#090910`, accento lilla `#bfa1ff`, DM Sans / Space Grotesk, bordi sottili, CTA chiare, superfici sobrie e colonna editoriale. Il prototipo homepage è ancora separato dal progetto originale: questa migrazione non sostituisce né pubblica la homepage.

## Le 13 pagine

| Pagina | Famiglia / motivo |
|---|---|
| `/scuole-superiori-messina` | Province: elenco scuole, chip indirizzi, link territoriali |
| `/archeologia-e-storia-dell-arte-messina` | UniMe: titolo lungo, programmi espandibili |
| `/medicina-e-chirurgia-messina` | UniMe: ciclo unico, catalogo esteso e 145 link |
| `/liceo-scientifico` | Indirizzi: materie/argomenti, base CSS legacy condivisa con quattro UniMe protette |
| `/tolc-i` | Tipi TOLC: tabella, punteggi e stati semantici |
| `/punteggio-tolc` | Guide: testo editoriale e avvertenze |
| `/tolc-messina` | TOLC locali: tabella corsi e destinazioni locali |
| `/simulazione-tolc-i` | Landing simulazione: hero centrato, CTA secondaria, FAQ e correlati |
| `/cortex-vs-anki-vs-quizlet` | Confronto: tabella a quattro colonne e verdetto |
| `/scuola` | Hub scuole: ricerca, selezioni, risultati vuoti, programmi |
| `/unime` | Hub universitario: catalogo dinamico, ricerca, programmi |
| `/simulazione-tolc` | Indice: dieci schede TOLC con tabelle |
| `/demo` | Demo: scelta materia, rotazione flashcard, risposta e avanzamento |

Sono coperte le **10 famiglie funzionali**, con adattatori distinti per i due hub e per demo/indice. La seconda UniMe è stata scelta nell'indice attuale per rispettare la protezione delle cinque pagine storiche. La specifica combinazione «vecchio HTML UniMe + vecchio CSS» non è stata migrata: il suo CSS di base è coperto dal liceo, ma ciò non equivale a validare quelle quattro pagine. Restano escluse anche in un eventuale primo rollout.

## File centrali

1. `public/cortex-design/tokens.css` — colori, typography, font locali, spacing, motion e focus.
2. `public/cortex-design/components.css` — hero, button, card, breadcrumb, FAQ, tabelle, sezioni, correlati, CTA e footer.
3. `public/cortex-design/seo-adapters.css` — differenze dei template e degli strumenti; contrasto delle etichette; tabella comparativa con scorrimento locale; disattivazione degli effetti decorativi.
4. `scripts/seo-pages.json` — allowlist delle 13 pagine, motivazioni e cinque esclusioni.
5. `scripts/seo-design-plugin.mjs` — stessa iniezione in dev/preview/build; validazione preventiva, trasformazione idempotente, nessuna serializzazione DOM né generazione dei contenuti.
6. `vite.config.js` — import e attivazione del plugin; resto della configurazione conservato.

File di supporto: `scripts/check-seo-invariants.mjs`, `scripts/audit-pilot-links.mjs`, due WOFF2 e relative licenze/provenienza. Le prove, i report e gli screenshot sono in questa cartella `artifacts/seo-pilot/`, fuori da `public` e dagli ingressi di build.

Gli unici cambiamenti agli HTML compilati selezionati sono tre link stylesheet in coda alla head e `data-cortex-seo` sul body. Nessun nuovo contenuto, breadcrumb o footer viene inventato per le pagine che non li avevano. L'ordine esistente dei contenuti resta invariato: uniformare i blocchi mancanti è una futura scelta editoriale, non una modifica CSS.

## Diff SEO prima/dopo

Riferimenti: `baseline.json`, `seo-diff.json`, `rendered-text-before.json`, `browser-final.json`.

- **13/13 PASS**: testo del documento, H1/H2/H3, title, description, canonical, JSON-LD esatto, robots, URL, href interni/esterni, numero e ordine dei link.
- Anche Open Graph/Twitter, immagini/alt e ID sono invariati.
- **282 file protetti** verificati con SHA-256: nessuna modifica dei sorgenti monitorati, inclusi sitemap, robots, Firebase, generatori e indice UniMe.
- Gli HTML statici pilota in `public` tornano identici byte per byte rimuovendo la sola iniezione. Verificata anche l'idempotenza della trasformazione.
- Nessun marker del design su pagine fuori pilota; tutti gli HTML statici non pilota compilati rimangono identici ai sorgenti.
- **5/5 UniMe protette** identiche anche nell'output.
- **13/13 testi renderizzati desktop** uguali prima/dopo, normalizzando esclusivamente gli spazi prodotti dal layout. Gli stati dinamici aggiuntivi sono verificati separatamente, non confusi con il testo HTML statico.

Baseline acquisita prima della prima build con design. I file HTML originali non sono mai stati modificati durante l'implementazione.

## Responsive, interazioni e performance

Verificati **1440, 1024, 768 e 390 px**, 52 combinazioni pagina/larghezza. In `browser-final.json` sono registrati larghezze reali, overflow, testo, immagini, CSS caricati, contrasto calcolato e console.

- Nessun overflow orizzontale della pagina. La tabella comparativa scorre localmente a 768/390 px, con testo mantenuto leggibile e tutte le celle presenti.
- Nessuna immagine mancante, nessun errore console rilevato, tre CSS e due WOFF2 rispondono HTTP 200.
- Nessuna criticità nel controllo automatico del contrasto testuale dopo le correzioni; controllo aggiuntivo sui programmi aperti di Scuola/UniMe e sulla flashcard girata. È un controllo dei colori CSS effettivi, non una certificazione completa WCAG.
- FAQ TOLC aperta con tastiera; percorso scuola Regione → Provincia → ricerca → indirizzo → materia; ricerca UniMe con zero risultati e risultati validi → programma; demo scelta → flip → valutazione → nuova card verificati.
- Nella seconda passata sono stati corretti contatori CFU/argomenti e label della demo poco contrastati; il logo del confronto ora usa un colore pieno leggibile.
- Particelle, bagliori e reveal decorativi neutralizzati. La rotazione funzionale delle flashcard resta. `prefers-reduced-motion` limita animazioni e transizioni.
- CSS aggiuntivo circa **12,8 KB non compresso**, font circa **59,2 KB complessivi**, nessuna dipendenza JS runtime aggiunta al design. I vecchi stylesheet Google Fonts restano nel documento per una trasformazione minima: un'eventuale pulizia va valutata separatamente.
- Misura CLS locale opt-in con PerformanceObserver prima del parsing del body: **0 sulle pagine statiche; massimo osservato circa 0,0056 sull'hub UniMe** al caricamento dei dati. È una misura breve sul browser locale, senza throttling o dati real-user; non dimostra i Core Web Vitals in produzione. Lo script diagnostico non viene scritto negli HTML di build.

Build di produzione e validazione i18n passate. Restano gli avvisi del progetto sui moduli importati sia staticamente sia dinamicamente e sul bundle dell'app oltre 500 KB; il design SEO non aggiunge quel bundle alle landing.

## Anomalie dei link preservate

`links.json` contiene il controllo di tutte le destinazioni locali del campione, degli asset aggiunti e delle risposte HEAD esterne.

- Nessuna destinazione interna locale mancante.
- Due href già malformati nella pagina provinciale: `https://Non Disponibile`, per I.S. Bisazza Me e Pietro Cuppari. Non corretti perché il vincolo vieta di cambiare i link.
- Quattro siti scolastici non risolti dal DNS nel controllo esterno: `istitutoprofessionaleferrari.it`, `istitutosuperioreminutoli.gov.it`, `isaconti.it`, `iiscaminititrimarchi.gov.it`. È un esito di questa verifica, non prova definitiva di indisponibilità globale. Nessun URL riscritto.
- I 404 sulle radici `fonts.googleapis.com/` e `fonts.gstatic.com/` sono URL di preconnect, non navigazioni utente né font mancanti. I fogli font effettivi rispondono 200.

## Le cinque UniMe storiche

«Fuori indice» qui significa **fuori da `public/unime/landing_index.json`**. Non sono disponibili dati Search Console che dimostrino l'esclusione dall'indice Google. Tutte e cinque figurano nella sitemap locale, hanno canonical autoreferenziale e nessun meta robots noindex nell'HTML. Sitemap/robots/configurazione restano invariati.

| Landing protetta | Evidenza nel catalogo attuale | Contenuto HTML conservato |
|---|---|---|
| `chimica-triennale-messina` | Codice 10797: Triennale; indice attuale `chimica-messina`, 38 insegnamenti | 38 insegnamenti + 3 FAQ; il testo non è identico alla landing corrente |
| `ingegneria-civile-triennale-messina` | Codice 10824: Triennale; indice attuale `ingegneria-civile-messina`, 20 insegnamenti | 20 insegnamenti + 3 FAQ; testo normalizzato uguale alla corrente, ma URL distinti |
| `ingegneria-gestionale-triennale-messina` | Codice 10827: Triennale; indice attuale `ingegneria-gestionale-messina`, 21 insegnamenti | 21 insegnamenti + 3 FAQ; il testo non è identico alla corrente |
| `matematica-triennale-messina` | Codice 10771: Triennale; indice attuale `matematica-messina`, 26 insegnamenti | 26 insegnamenti + 3 FAQ; il testo non è identico alla corrente |
| `scienze-politiche-e-delle-relazioni-internazionali-messina` | Codice 10801 presente nel catalogo ma JSON con **0 insegnamenti**; generatore lo salta | **125 insegnamenti + 3 FAQ** ancora presenti nell'HTML salvato |

Meccanismo verificato in `genera_landing_unime.py`: gli slug derivano dal nome; in caso di collisione viene aggiunto il gruppo, in base all'ordine dei corsi. I corsi senza insegnamenti vengono saltati. Il generatore riscrive `landing_index.json`, ma **non elimina gli HTML preesistenti**. `genera_sitemap.py` può includere questi HTML indipendentemente dall'indice.

Questo rende plausibili i quattro slug storici `-triennale` e spiega perché Scienze politiche può sopravvivere fuori dall'indice corrente. La cronologia Git disponibile li contiene già nel singolo commit `a862811` del 23 luglio 2026: non consente di ricostruire con certezza quale vecchio ordine/importazione abbia creato ciascun file. Non si può dedurre un redirect corretto dal solo nome.

Preservazione attuale: cinque esclusioni esplicite, nessuna rigenerazione/cancellazione, URL/canonical/link/testi/schema conservati, hash dei sorgenti e confronto di byte dell'output. Prima di qualunque consolidamento servono controllo degli insegnamenti effettivi, dati del catalogo e valutazione delle URL in Search Console/backlink. Sono attività separate dal restyling.

## Raccomandazione

**No al rollout immediato su tutte le 262. Sì a un'estensione controllata per famiglie dopo revisione del pilota**, mantenendo escluse le cinque UniMe e senza rilanciare i generatori.

Precauzioni: ampliare intenzionalmente il registro e le guardie, mantenere il confronto SEO bloccante su ogni build, provare casi estremi della famiglia prima di estenderla, verificare asset/clean URL in staging e misurare performance reali. Correzione dei link scolastici e recupero dei dati UniMe vanno trattati separatamente, con diff espliciti.

Nessun problema architetturale richiede di riscrivere le pagine per questo pilota. Il problema di conservazione dei dati del generatore UniMe è reale ed è confinato dalle esclusioni: **non propagare la migrazione a quelle cinque pagine e non rigenerarle**.

## Avvio e verifica

Nella cartella `C:/Users/User/Desktop/PROGETTI/cortex`:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort
npm.cmd run build
node scripts/check-seo-invariants.mjs
node scripts/audit-pilot-links.mjs
npm.cmd run preview -- --host 127.0.0.1 --port 5176 --strictPort
```

Galleria locale: `http://127.0.0.1:5175/artifacts/seo-pilot/preview.html`. In dev/preview il parametro `cortex-baseline=1` mostra il sorgente originale per confronto; `cortex-audit=1` abilita soltanto la misura locale CLS. Questi parametri non introducono logica negli HTML pubblicabili.

La baseline non viene sovrascritta dal comando di controllo. Il rollout è bloccato nel plugin a 13 pagine; la sua estensione deve essere una modifica deliberata successiva.
