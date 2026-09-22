# Clarity: registrazioni e limiti del funnel — 22 settembre 2026

## Risultato principale

Il mancato completamento dell'onboarding non equivale all'abbandono dell'app. Tre registrazioni selezionate da quel filtro mostrano persone che stanno già rispondendo al TOLC. Il percorso diretto alla simulazione va analizzato separatamente dalla configurazione guidata.

## Campione osservato

Campione ragionato, non casuale: cinque registrazioni, viste in più punti del replay; non una visione continua di tutte le sessioni. I codici sono gli identificatori pseudonimi visibili in Clarity, utili per ritrovare le registrazioni.

| Sessione | Dispositivo / durata | Osservazione verificata | Limite |
|---|---|---|---|
| 1nfo8mk, 22/09 13:46 | MobileSafari, 1:57 | Dal riepilogo TOLC-I alle domande: domanda 2 a 00:40, domanda 4 a 01:40; al termine la vista resta sulla domanda 4. Compare anche fra gli onboarding non completati. | Non dimostra perché la persona smetta. |
| avtcfb, 22/09 13:35 | Chrome desktop, 0:39 | A 00:33 è nella prima domanda di comprensione del testo TOLC-PSI. Non è bloccata sulla configurazione iniziale. | Due clic e sessione breve: causa dell'uscita non identificabile. |
| 1luma40, 22/09 12:12 | MobileSafari, 3:18 | Domanda 2 a 00:58, domanda 5 a 02:58, risposte selezionate e feedback visibili. La griglia numerata e le sezioni occupano una parte consistente della vista. | Lo scorrimento necessario è osservabile; non è provato che causi l'interruzione. |
| 40fl0e, 22/09 14:41 | Edge desktop, 1:22 | A 00:47 feedback di risposta errata alla prima domanda TOLC-SU; a 01:17 raggiunge la domanda 2. | Il feedback funziona; nessuna prova di errore tecnico che blocchi il passaggio. |
| 1ypo4u5, 22/09 15:02 | Edge desktop, 0:01 | Zero clic, replay termina sul selettore TOLC. | Dati insufficienti: non attribuire un motivo, né dichiarare bot o crash senza evidenza. |

## Difetti della misura confermati dal codice

- `core/onboarding.js`: `onboarding_start` viene emesso prima del timeout che tenta di mostrare l'overlay. Può quindi contare una richiesta di apertura senza dimostrare che l'utente veda o inizi la procedura.
- `main.js`, `handleDeepSimTolc`: il collegamento `?sim=tolc` apre direttamente il simulatore. Nei replay questo percorso prosegue nel TOLC senza completare la configurazione guidata.
- `modules/tolcSim.js`: `tolc_sim_open` è emesso quando si apre il selettore, prima della scelta del test e dell'avvio delle domande. L'imbuto «aperto → completato» include quindi anche chi non inizia la prova.
- `onboarding_complete` è emesso da `closeOnboarding`, anche quando l'obiettivo risulta `skipped`: non certifica che tutti i passaggi siano stati compilati.

Queste osservazioni correggono l'interpretazione dei conteggi precedenti. Non è corretto dedurre dal solo funnel che il 90% degli utenti sia bloccato nell'onboarding.

## Numeri osservati durante il controllo

Filtro «Ultimi 3 giorni», dashboard 442 sessioni: onboarding_start → onboarding_complete 57 → 5; tolc_sim_open → tolc_sim_complete 65 → 8. Sono sequenze nella stessa sessione, con i limiti semantici sopra indicati. Il risultato cambia con l'aggiornamento della finestra e non va confrontato direttamente con gli snapshot precedenti.

## Interventi prioritari proposti

1. Misura: distinguere onboarding effettivamente visibile, concluso, saltato e accesso diretto TOLC. Separare apertura del selettore, avvio della prova, prima risposta e risultato finale. Non riscrivere gli eventi storici.
2. Mobile TOLC: rendere più compatta/richiudibile la navigazione di sezioni e numeri, lasciando più spazio a domanda, risposte e pulsante successivo. La criticità di spazio è osservata; l'impatto sulla conversione resta da misurare.
3. Analisi: studiare separatamente le sessioni di un secondo senza clic e quelle con risposte effettive. Nei cinque replay non emerge una causa tecnica comune che spieghi tutte le uscite.

Nessuna modifica di prodotto o ai nomi degli eventi è stata pubblicata durante questa analisi.

## Generazione → studio: stato preciso

La generazione reale di otto carte, il salvataggio e l'apertura ripasso sono già stati verificati nell'account amministratore il 21 settembre. I test del collegamento analytics sono superati. Al nuovo controllo il catalogo Clarity contiene nove eventi, incluso study_session_start, ma non cards_generated.

Il browser controllabile mantiene l'esclusione amministratore (`cortex_no_track`); l'app richiede un accesso non anonimo per usare il proxy AI. Non è stato disabilitato l'opt-out e non sono stati immessi eventi sintetici per popolare il catalogo. Il tentativo di usare www.cortexapp.it come origine separata è stato bloccato dal browser con ERR_CERT_COMMON_NAME_INVALID; nessun bypass.

Resta necessaria una sessione autorizzata con account di prova non amministratore e tracciamento consentito per verificare l'arrivo end-to-end e salvare l'imbuto. Non è corretto presentare questo punto come completato.
