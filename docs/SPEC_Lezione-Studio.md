# Cortex · Spec "Lezione → Studio"

> Feature che trasforma una lezione grezza (audio + foto) in materiale di studio pronto,
> dentro Cortex. Obiettivo doppio: **più iscritti** (attivazione a TTV≈0) e **upgrade verso la Maturità**.
>
> Stato: proposta / da approvare · Autore: brainstorm con Claude · Data: 23/09/2026

---

## 1. Tesi in una riga

Il difetto di ogni app di flashcard/ripasso (Anki, Quizlet, Cortex incluso) è che l'utente deve **creare** il contenuto a mano: apre l'app, trova il mazzo vuoto, molla. Se Cortex parte dalla lezione grezza e ne genera **da solo** note + flashcard, il mazzo si riempie senza sforzo. Questa non è "una feature in più": è **l'imbuto d'ingresso che mancava a tutto il resto di Cortex**, ed è la leva di attivazione definitiva (abbattere il tempo tra arrivo dell'utente e primo risultato utile).

## 2. Il fossato (perché non annega nell'oceano rosso)

"Carico la lezione → AI mi fa le note" da solo è commodity: lo fanno gratis ChatGPT, Gemini, NotebookLM. Il valore difendibile **non è** la trascrizione, è il **ciclo chiuso**:

    lezione → note con le TUE foto al punto giusto → flashcard auto → ripasso SM-2 → simulazione esame

il tutto **tarato sull'esame italiano specifico** (TOLC, Maturità, quell'università). Quello i tool generici non lo costruiscono perché è verticale. Il pitch e il marketing vanno sul loop + specificità d'esame, **mai** sulla trascrizione.

## 3. Paletti fissi (non negoziabili)

- **No diagrammi AI tecnici.** In STEM (elettrotecnica, fisica…) uno schema/circuito allucinato è peggio di nessuno: lo studi come giusto. Si usano le **foto reali** dell'utente, ancorate al punto giusto del testo. Al massimo l'AI *segnala* dove servirebbe uno schema, non lo disegna.
- **L'output vive DENTRO Cortex** (nota digitale + carte), non come "copione per il quaderno di carta": se l'utente esce dall'app, il loop si spezza e perdi la ritenzione.
- **Costo dietro paywall.** Vision + structuring LLM sono la parte cara → gancio dello **Student Plan** (è il vero painkiller a pagamento).
- **Non rompere l'attivazione TOLC** appena blindata (guest + deep-link `?sim=tolc-<code>`): la feature Lezione è un binario separato per l'utente loggato.

## 4. Pipeline tecnica (4 stadi)

1. **Cattura** — audio (registrazione o file) + foto della lavagna/appunti.
2. **Trascrizione** — Whisper **locale** riusando il `trascrittore_robot` già esistente in `AUTOMAZIONI` → costo ≈ 0 sulla parte audio. Output: testo grezzo.
3. **Strutturazione** (LLM, gated premium) — spezza il testo in blocchi:
   `concetto → definizione (verbatim del prof) → ancora immagine N`.
4. **Auto-flashcard** — dai blocchi genera coppie Q/A → entrano nel **motore SM-2 e nei mazzi già esistenti** (nessun motore nuovo).

## 5. Fasi

### v1 — MVP (sblocca l'attivazione, costo basso)
Scopo: dimostrare il loop con TTV vicino a zero. **Niente vision AI ancora.**

- Input: l'utente incolla/carica la trascrizione del prof + carica le foto.
- Se c'è audio: Whisper locale → testo.
- LLM struttura in note con **placeholder** ("↳ inserisci qui foto 1 / foto 2").
- Abbinamento foto **manuale** dall'utente (per ordine o drag-and-drop).
- Le definizioni diventano **flashcard** → finiscono in un mazzo (nuovo o esistente).
- Deliverable visibile: schermata "Importa lezione" → nota strutturata → mazzo generato.

### v2 — Intelligenza immagini (premium)
- **Vision** sulle foto: capisce il contenuto e posiziona in automatico la foto giusta accanto al concetto giusto.
- Segnala i **buchi** ("qui servirebbe uno schema del circuito") — senza disegnarlo.
- Segmentazione migliore per argomenti/sezioni.
- Gating **Student Plan** (qui sta il costo vero).

### v3 — Avanzato (cauto)
- Collegamento diretto **note → simulazione esame** specifica su quegli argomenti.
- Costruzione del **"programma"** cross-lezione (il quadro dell'anno).
- **Maturità:** collegamenti interdisciplinari tra lezioni/materie (utile per l'orale), mappa argomenti → possibili domande.
- Immagini AI **solo** per schemi non critici, con disclaimer e verifica — **mai** circuiti/formule.

## 6. Dove innestarla nell'architettura attuale

Stack: Vite + Vanilla JS + Firebase (Auth/Firestore/Functions/Hosting). Azioni registrate in `main.js` via `register('nome', fn)`; moduli in `modules/` (`home.js`, `decks.js`=Materiale, `tolcSim.js`, `techniques.js`).

- **Nuovo ingresso separato "Importa lezione"** accanto ai mazzi in Materiale (`modules/decks.js`) o come card in Home — **non tocca** il flusso guest/deep-link TOLC.
- Nuovo modulo `modules/lezione.js` + azione `register('importaLezione', …)` in `main.js`.
- **Back-end = motore SM-2 + mazzi esistenti** (Firestore): le note generano carte nei mazzi normali, così il ripasso è già pronto senza scrivere nulla di nuovo. *(Verificare nome/percorso del modulo SM-2 attuale.)*
- **Trascrizione**: riusa `trascrittore_robot` (Whisper locale). Per il web serve decidere: upload file → job locale/desktop, oppure endpoint Cloud Function per l'audio. *(v1 può accettare solo testo incollato per evitare del tutto il costo audio lato server.)*
- **Structuring LLM**: passa dal proxy Gemini già esistente in `functions/` (stesso pattern delle altre chiamate AI di Cortex), con gating piano dietro il controllo abbonamento già presente.
- **Utente**: la feature è per l'utente **loggato** → spinge login e attivazione profonda; il guest TOLC resta sul suo binario.

## 7. Monetizzazione

- v1: gratis o limitata (es. N lezioni/mese) per far provare il loop → attivazione.
- v2/v3 (vision + auto-immagini + collegamento esame): dietro **Student Plan**.
- È il "painkiller" per cui uno studente paga davvero: risparmio di ore nel mettere in ordine gli appunti.

## 8. Perché serve alla Maturità (upgrade di posizionamento)

- La pipeline è **agnostica alla materia**: qualsiasi lezione, qualsiasi indirizzo → Cortex esce dalla nicchia TOLC e copre tutto il quinto anno.
- Alimenta l'orale: note strutturate + collegamenti interdisciplinari + mappa argomenti→domande.
- Estende il brand "secondo cervello / tecniche dei campioni di memoria" al gesto quotidiano (la lezione di oggi), non solo alla vigilia del test.

## 9. Checklist di build v1 (passaggi concreti)

1. [ ] UI: card/ingresso "Importa lezione" (in Home o Materiale) — dietro login.
2. [ ] Schermata import: campo testo (incolla trascrizione) + uploader foto (multiplo).
3. [ ] `modules/lezione.js`: stato locale (testo, lista foto, blocchi).
4. [ ] Chiamata structuring LLM (proxy Gemini in `functions/`): testo → JSON blocchi `[{concetto, definizione, imgSlot}]`.
5. [ ] Render nota strutturata: definizioni + slot immagine con placeholder.
6. [ ] Abbinamento foto manuale (drag o selezione per slot).
7. [ ] "Genera flashcard": da ogni blocco → carta Q/A nel mazzo (usa il motore/mazzi Firestore esistenti).
8. [ ] Salvataggio nota + mazzo su Firestore per l'utente.
9. [ ] Limite piano free (es. N lezioni/mese) + gancio upgrade.
10. [ ] Verifica che il flusso guest/TOLC resti intatto (nessuna regressione sul deep-link).

## 10. Metriche di successo

- **Attivazione**: % di nuovi utenti che, importata una lezione, generano ≥1 mazzo (TTV misurato in secondi).
- **Ritenzione**: ritorno a 7 giorni di chi ha importato ≥1 lezione vs chi no.
- **Conversione**: upgrade a Student Plan tra chi tocca il limite vision/lezioni.

---

### Rischi da tenere d'occhio
- **Costo per utente attivo** (vision + LLM per lezione): gating e limiti servono da subito.
- **Scope creep**: è un **ri-centraggio** del prodotto (la cattura diventa la porta d'ingresso, il ripasso il back-end), non un bolt-on. Farlo con questa consapevolezza.
- **Qualità structuring** su lezioni caotiche: prevedere sempre l'editing manuale dell'utente sull'output.
