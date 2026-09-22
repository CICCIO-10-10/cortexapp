# Piano eventi Clarity — separare apertura / avvio / prima risposta / completamento

*Companion dell'audit `CLARITY-REPLAY-AUDIT-22-SETTEMBRE.md` · 2026-09-22 · verificato nel codice*

## Il problema in una riga
Il funnel attuale **sovrastima l'abbandono**: gente che sta già rispondendo al TOLC finisce contata come "onboarding non completato". Non è (solo) un problema di prodotto, è un problema di **come sono piazzati gli eventi**. Prima si sistema la misura, poi si decide un redesign.

## Dove nascono gli eventi oggi (verificato nel codice)

- **`core/onboarding.js`**
  - riga 205: `track('onboarding_start')` parte **subito**.
  - righe 207-213: l'overlay viene mostrato **1200 ms dopo**, dentro un `setTimeout`, e **solo se** l'`auth-overlay` è già chiuso (`onboarding.style.display='flex'`). Se l'auth resta aperto, l'onboarding **non si vede mai** ma `onboarding_start` è già partito.
  - riga 109: `onboarding_complete` è emesso da `closeOnboarding` con `goal` che vale `'skipped'` se saltato → **non certifica** il completamento.
- **`modules/tolcSim.js`**
  - riga 57: `tolc_sim_open` = apertura del **selettore**, non avvio prova.
  - riga 298: `tolc_sim_complete` = risultato finale.
  - **manca tutto in mezzo**: avvio prova (prima domanda mostrata) e prima risposta.
- **`main.js`**
  - riga 800 `handleDeepSimTolc`: `?sim=tolc` entra **dritto** nel simulatore saltando l'onboarding → questi ingressi **non vanno contati** come "onboarding abbandonato".
- **Generazione → studio:** `cards_generated` **non risulta** nel catalogo Clarity (l'audit ha visto 9 eventi incl. `study_session_start`, ma non `cards_generated`). Il browser di test è escluso come admin (`cortex_no_track`) e `www.cortexapp.it` dà errore certificato → **end-to-end non verificato**.

## La tassonomia corretta (nuovi eventi, senza toccare gli storici)

**Regola d'oro:** non rinominare né riscrivere gli eventi storici. Si aggiungono i nuovi **accanto**, così il confronto storico resta e i nuovi funnel diventano affidabili da qui in avanti.

### 1) Onboarding
| Evento | Quando | Nota |
|---|---|---|
| `onboarding_shown` | **dentro** il `setTimeout`, nel ramo che fa `display='flex'` (onboarding.js ~riga 211) | l'unico momento in cui l'utente **vede** davvero l'overlay |
| `onboarding_goal_selected` | già esiste | step compilato |
| `onboarding_completed_real` | in `closeOnboarding` **solo se** `goal !== 'skipped'` | il completamento vero |
| `onboarding_skipped` | in `closeOnboarding` se `goal === 'skipped'` | tenuto separato |
| proprietà `entry = 'deeplink_tolc' \| 'normal'` | su tutti gli eventi di sessione | esclude gli ingressi `?sim=tolc` dal funnel onboarding |

### 2) TOLC (l'imbuto che conta davvero)
| Evento | Quando |
|---|---|
| `tolc_selector_open` | apertura selettore (= l'attuale `tolc_sim_open`) |
| `tolc_test_start` | **NUOVO** — quando viene renderizzata la 1ª domanda (dopo la scelta del test) |
| `tolc_first_answer` | **NUOVO** — al primo tap di risposta |
| `tolc_test_complete` | risultato (= l'attuale `tolc_sim_complete`) |

### 3) Attivazione (core prodotto)
`material_uploaded` → `cards_generated` *(verificare che scatti davvero)* → `study_session_start` *(già c'è)* → `card_studied` *(conteggio)* → `answer_rated` → **`activated`** = ≥3 carte generate **+** ≥3 studiate **+** ≥1 valutata.

## I tre funnel da guardare (separati)
- **A — TOLC:** `tolc_selector_open` → `tolc_test_start` → `tolc_first_answer` → `tolc_test_complete`.
- **B — Onboarding:** `onboarding_shown` → `onboarding_goal_selected` → `onboarding_completed_real` (con `onboarding_skipped` **a parte**).
- **C — Attivazione:** dalla catena §3, fino a `activated`.

Non confrontare questi numeri con gli snapshot vecchi: cambiano definizione.

## Verifica end-to-end (oggi bloccata)
Per chiudere il punto "Generazione → studio" serve:
1. un **account di prova NON-admin** con tracciamento **attivo** (il browser attuale è escluso come admin);
2. sistemare il **certificato di `www.cortexapp.it`** (`ERR_CERT_COMMON_NAME_INVALID`) — oppure testare sull'apex `cortexapp.it` — così il proxy AI funziona e si vede `cards_generated` → `study_session_start` arrivare in Clarity.

## Ordine di lavoro
1. **Prima la misura** (eventi qui sopra) — è ciò che sblocca ogni decisione successiva.
2. **Poi** i dati puliti dei 3 funnel su utenti reali (non-admin).
3. **Solo dopo** decidere il redesign mobile TOLC: la griglia sezioni/numeri occupa troppo spazio (osservato nei replay), ma **l'impatto sulla conversione va misurato**, non dato per scontato.
