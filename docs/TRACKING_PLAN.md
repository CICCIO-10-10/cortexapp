# Cortex · Tracking Plan (v3 — 25/09/2026)

> Metodo: eventi **oggetto_azione** (snake_case), pochi e stabili; un funnel per percorso; gli eventi vecchi NON si toccano (storico intatto).
> Dove finiscono: `track()` in `core/analytics.js` → GA4 (gtag) + Clarity (solo nomi in `CLARITY_STEPS`) + Firestore `journeys/{vid}/events` (via `core/journey.js`).
> Mai contenuti utente negli eventi: solo nomi, codici TOLC, conteggi, motivi.
> Dashboard: `AUTOMAZIONI/cortex_dashboard_local` → sezione "Funnel v3" (dati da Cloud Function `adminDashboard` → `functions/journey-summary.cjs`).

## Funnel 1 — TOLC
| Evento | Quando scatta | Meta | File |
|---|---|---|---|
| `tolc_sim_open` *(vecchio)* | apertura simulatore (selettore o diretta) | direct | modules/tolcSim.js |
| `tolc_selector_viewed` **v3** | selettore dei TOLC mostrato | — | tolcSim.js `openTolcSim` |
| `tolc_type_picked` **v3** | click su un TOLC nel selettore | test | tolcSim.js click `.tolc-pick` |
| `tolc_intro_viewed` **v3** | schermata intro (sezioni/tempi) mostrata | test | tolcSim.js `_intro` |
| `tolc_test_start` | prima domanda mostrata | test | tolcSim.js `_start` |
| `tolc_first_answer` | prima risposta data | test | tolcSim.js |
| `tolc_sim_complete` | consegna | test, correct, pct | tolcSim.js `_finish` |
| `tolc_errors_generate_click` | "Trasforma i tuoi errori in flashcard" | n | tolcSim.js |
| `tolc_selector_closed` **v3** | chiuso PRIMA di iniziare | stage: selector / intro | tolcSim.js `tolc-close` |
| `tolc_test_quit` **v3** | abbandono A METÀ prova: durante la prova non c'è un tasto di uscita, quindi scatta quando la scheda viene chiusa/nascosta (una volta per prova) | test, answered, at, of, how:'leave' | tolcSim.js `visibilitychange` |

## Funnel 2 — Onboarding
| Evento | Quando | Meta |
|---|---|---|
| `onboarding_shown` | overlay davvero visibile (non `onboarding_start`, che sovrastima) | is_instagram |
| `onboarding_step_viewed` **v3** | cambio slide | step |
| `onboarding_finished` **v3** | chiuso con obiettivo scelto | goal, last_step |
| `onboarding_skipped` **v3** | chiuso senza obiettivo | last_step |

## Funnel 3 — Generazione → studio (attivazione)
| Evento | Quando | Meta |
|---|---|---|
| `cards_generation_started` **v3** | avvio generazione da file/foto o testo | flow, kind |
| `cards_generated` | carte generate (anteprima) | count, flow |
| `cards_generation_failed` **v3** | errore | flow, reason: guest_gate / paywall / offline / ai_down / empty_input / other |
| `generated_cards_saved` | mazzo salvato | count, flow |
| `generated_cards_discarded` **v3** | anteprima chiusa senza salvare | count |
| `study_session_start` / `study_session_completed` | studio | — |
| `activated` | ≥3 carte generate + ≥3 studiate + 1 voto | — |
| `cloud_sync_failed` **v3** | salvataggio sul cloud fallito (solo Clarity) | — |

## Definizione di "attivato" (da validare in Fase 2)
Ipotesi A: ha studiato ≥5 carte generate dal proprio materiale.
Ipotesi B: ha completato un TOLC e poi generato/studiato le carte dei propri errori.
→ si sceglie quella che, sui dati, si associa di più al ritorno nei giorni successivi.

## Verifica 25/09/2026 (sera)
Test automatico su produzione (visitatore `TEST_…`, escluso dalla dashboard): arrivano a Clarity e a Firestore `tolc_selector_viewed → tolc_type_picked → tolc_intro_viewed → tolc_test_start → tolc_first_answer`. Nota emersa: con `?sim=tolc` scatta anche `onboarding_shown` (l'onboarding si apre sotto il simulatore) → da valutare in Fase 3.
