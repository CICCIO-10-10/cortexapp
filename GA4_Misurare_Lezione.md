# GA4 · Misurare la feature "Lezione → Studio"

> Cruscotto da impostare in Google Analytics 4 (property con Measurement ID `G-DFJ42477QK`)
> per leggere l'esito della v1 a colpo d'occhio. Da configurare **prima del deploy**, così
> quando i dati arrivano è già tutto pronto.
>
> Eventi emessi dalla feature (già nel codice):
> `lezione_aperta` → `lezione_strutturata` → `lezione_genera` → `lezione_mazzo_salvato`
> Parametri su ogni evento: `device` (desktop/mobile/tablet), + `source`, `mode`, `has_photos`, `cards`, ecc.
> I mazzi creati da lezione hanno anche il tag `createdVia: "lezione"`.

---

## 0. Prerequisiti (una volta sola)

**a) Verifica che gli eventi arrivino.** Subito dopo il deploy: GA4 → **Amministrazione → DebugView** (oppure **Report → Tempo reale**). Usa la feature una volta e controlla che compaiano i 4 eventi `lezione_*`. Se non li vedi, gli eventi non stanno arrivando (controlla ad-blocker / consenso cookie).

**b) Registra i parametri custom come dimensioni.** GA4 mostra `device` da solo (dimensione nativa **Categoria dispositivo**), ma per spaccare i dati per `source`, `mode`, `has_photos` devi registrarli:
GA4 → **Amministrazione → Definizioni personalizzate → Crea dimensione personalizzata** → Ambito **Evento**, per ciascuno: `source`, `mode`, `has_photos`.
(Le dimensioni personalizzate valgono **solo dai dati futuri**, quindi vanno create ora, prima del deploy o subito dopo.)

---

## Vista 1 · Funnel di drop-off (dove mollano)

GA4 → **Esplora → Esplorazione a imbuto (Funnel exploration)**.

- **Passi (Steps)**, in sequenza:
  1. `lezione_aperta`
  2. `lezione_strutturata`
  3. `lezione_genera`
  4. `lezione_mazzo_salvato`
- Imposta **Imbuto chiuso (Closed funnel)** = ON → conta solo chi fa i passi *in ordine*.
- Metrica di lettura: la **% di completamento** e la **% di abbandono** riga per riga.

Come leggerlo: se cadono tra `aperta → strutturata` è un problema di UI/comprensione (aprono e non capiscono cosa fare); se cadono tra `genera → mazzo_salvato` è l'**output dell'AI** che non convince (generano ma non salvano).

## Vista 2 · Stessa cosa, spaccata Desktop vs Mobile

Nello stesso imbuto, campo **Suddivisione (Breakdown)** = **Categoria dispositivo**.

Perché è obbligatorio: nell'e-learning il mobile pesa molto più del desktop, e su mobile "incolla trascrizione + carica foto" ha un attrito strutturalmente diverso dal desktop. Una media unica nasconde tutto. Guarda **sempre** i due funnel separati.

## Vista 3 · Time to Value (TTV: quanto ci mette a ottenere il risultato)

Sempre nell'Esplorazione a imbuto: attiva l'opzione **"Mostra tempo trascorso" (Show elapsed time)**. GA4 mostra il tempo medio tra un passo e l'altro.

Da guardare: il tempo tra `lezione_aperta` e `lezione_mazzo_salvato`. Obiettivo di riferimento: **sotto i 5 minuti**. Se è più alto, la "scorciatoia" che abbiamo progettato non sta funzionando come dovrebbe e c'è attrito da togliere.

## Vista 4 · Ritenzione: coorte Lezione vs coorte Standard

GA4 → **Esplora → Esplorazione coorte (Cohort exploration)**.

- **Inclusione coorte (Cohort inclusion)**: evento `lezione_mazzo_salvato` → questa è la "coorte Lezione".
- **Criterio di ritorno (Return criterion)**: `session_start` (qualsiasi ritorno).
- **Granularità**: Giornaliera → leggi **Giorno 1** e **Giorno 7**.

Poi confronta con la **coorte Standard** (chi crea mazzi col flusso classico, senza lezione). Due modi:
- crea un **Segmento** "Utenti Lezione" = utenti con evento `lezione_mazzo_salvato`, e un segmento "Utenti Standard" = utenti con `generated_cards_saved` **senza** `lezione_mazzo_salvato`, e confrontali; oppure
- usa il tag sul mazzo `createdVia = "lezione"` lato Firestore per la stessa distinzione.

Questa è la vista che conta di più: dice se la feature non solo converte al primo colpo, ma se **crea l'abitudine** (ritorno a 7 giorni più alto della coorte standard).

---

## Nota sulla pulizia dei dati (importante)

Non mescolare questa coorte con chi **rimbalza in 1 secondo dalle landing SEO TOLC**: è un'altra popolazione, con un altro problema (già affrontato coi deep-link `?sim=tolc-*`). La feature Lezione si misura **solo** su chi entra nell'app e arriva a Materiale. Mescolare le due porta a conclusioni sbagliate.

## Cosa decidere con questi numeri

- Se il funnel converte bene e la ritenzione D7 della coorte Lezione batte quella standard → la scommessa è vinta: il prossimo passo sarà **collegare le note alla simulazione d'esame** (approfondire il valore).
- Se aprono ma non completano (drop su `genera`/`salvato`), specie su mobile → il prossimo passo è la **v2-vision** e/o ridurre l'attrito mobile (foto invece di incolla).
- Se pochi *aprono* proprio → è un problema di visibilità dell'ingresso, non della feature.
