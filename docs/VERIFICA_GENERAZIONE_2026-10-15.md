# Verifica: testo/foto/PDF → flashcard → salvataggio → primo ripasso (15/10/2026)

Branch `fix/verifica-generazione-2026-10`, da `main` @ `6b5b85a`. Niente merge, niente deploy.
**Nessun file grafico modificato** (CSS, `app.html`, viste e layout): le correzioni riguardano solo la logica (`modules/pdfToFlashcards.js`, `modules/deckCreate.js`, `services/firebase.js`, `services/ai.js`, `services/fileHandler.js`). Le funzioni e i parametri usati dall'interfaccia sono invariati; `callGeminiProxy` accetta un secondo argomento facoltativo.
PR #2 (tracciamento) è ancora aperta e non è stata toccata: questa PR non modifica nessuno dei suoi file.

## Come è stato verificato
| Tipo | Cosa | Dove |
|---|---|---|
| **Browser** | app reale (Vite) in Chromium; Firebase **emulato** (Auth + Firestore, progetto `demo-cortex-security`, regole del repository); account sintetici; rete esterna bloccata | `scripts/verifica-generazione-2026-10/browser.cjs` |
| **AI simulata** | `/api/gemini` intercettato con risposte preparate: buona, malformata, errore di rete, nessuna risposta | stesso script e test unitari |
| **OCR simulato** | lo script Tesseract della CDN è sostituito; lo scenario "ocr" lo blocca apposta | stesso script |
| **Test unitari** | moduli veri con dipendenze simulate | `tests/generazione-verifica-2026-10.test.js` |

**L'AI simulata verifica come l'app tratta le risposte, non la qualità delle carte dell'AI reale. Anche il riconoscimento OCR vero (Tesseract) non è stato provato: è stato provato solo il suo caricamento.**

## Difetti riprodotti e corretti (prima → dopo)
| # | Difetto | Prima | Dopo | Prova |
|---|---|---|---|---|
| 1 | **Materiale importato perso.** La materia salvata dall'anteprima AI aveva nome e carte ma `text` vuoto; il modulo poi si svuota, quindi gli appunti (incollati, PDF o OCR) andavano persi. Anche dopo il passaggio ad account. | `text: ""` | testo salvato con la materia; se la materia esiste già, il suo materiale non viene sovrascritto | browser `testo`, `account`; 4 test |
| 2 | **AI che non risponde → attesa infinita.** `callGeminiProxy` (usata da "Genera Flashcard con IA") non aveva limite: rotella per sempre e, con `_generating` sempre vero, nessuna riprova possibile. | dopo 75 s ancora in attesa, 0 nuove chiamate | errore dopo 58 s (come `callGemini`, sotto i 60 s di Hosting), poi la riprova parte | browser `blocco`; 3 test |
| 3 | **Errore di generazione poco chiaro e pulsante "Salva" visibile** (cliccarlo non faceva nulla). | `Unexpected token 'E'…`, `Failed to fetch` | "La risposta dell'AI non era valida…", "Connessione assente o instabile…", "L'AI non ha risposto in tempo…"; "Salva" nascosto (come già nel percorso da file) | browser `malformato`, `rete`; 3 test |
| 4 | **OCR bloccato.** Il limite di 90 s copriva solo il riconoscimento: se lo script Tesseract dalla CDN non arrivava, "Caricamento motore OCR…" restava per sempre. Inoltre la riprova restava in coda alla richiesta bloccata (stesso indirizzo). | attesa infinita; riprova anch'essa bloccata | errore dopo 30 s ("il motore di lettura non si è caricato: controlla la connessione e riprova"); lo script bloccato viene tolto e la riprova usa un indirizzo diverso (`?r=n`) | browser `ocr`; 1 test |
| 5 | **PDF: pdf.js che non arriva → import fermo per sempre.** | attesa infinita | errore dopo 30 s ("PDF.js non caricato… connessione… riprova") | 1 test |
| 6 | **Nome della materia perso dopo l'accesso.** "Genera con IA" dentro una materia: l'ospite passa dal riquadro di accesso; dopo il login la generazione riprende con il testo, ma il nome non veniva salvato. | nome vuoto dopo l'accesso | nome salvato nella richiesta in sospeso e rimesso nel campo, solo se vuoto | 2 test (solo unitari) |

Trovato rileggendo le correzioni: salvare tutto il testo poteva portare un mazzo oltre `MAX_DECK_BYTES` (900 KB), e quel mazzo non sarebbe più arrivato sul cloud, carte comprese. Per questo il materiale si salva solo fino a **300.000 caratteri**; oltre, si torna al comportamento di prima (solo carte). Coperto da 1 test.

## Verificato senza difetti
- **Doppio clic** su "Genera": una sola chiamata AI. Doppio clic su "Salva": una sola materia (browser).
- **Nome scelto dallo studente:** resta nell'anteprima; il titolo proposto dall'AI non lo sostituisce (browser).
- **Errori:** dopo una risposta malformata o un errore di rete non viene creata nessuna materia, il testo resta nel campo e la riprova crea **una** materia (browser).
- **Persistenza:** dopo la ricarica materia, carte e materiale ci sono; i progressi del primo ripasso restano dopo la ricarica (browser).
- **Ospite → account:**
  - l'ospite usa l'AI tramite un account **anonimo**, quindi con la quota ospite lato server;
  - dopo l'accesso la materia c'è una volta sola, con carte e materiale, ed è sul Firestore dell'emulatore;
  - l'account B non vede nulla di A, né sul dispositivo né sul cloud (browser + emulatori).
- **Quote:** il server classifica dal token (anonimo 5/giorno, gratuito 25/giorno) con tetti giornalieri complessivi; i test esistenti `ai-quota.test.js` lo coprono. L'account non eredita né azzera la quota dell'utente anonimo: ha la sua, per scelta. Dal client nessuna strada per aggirarla.

## Da integrare localmente (file grafico, non modificato)
- **`app.html`, `window.__cxLib`** (caricatore di pdf.js, confetti, chart): non ha un limite di attesa e conserva la promessa anche se resta bloccata. `fileHandler.js` ora limita l'attesa a 30 s, ma una **riprova** del PDF aspetta ancora la stessa promessa finché lo script non arriva.
- **Proposta:** in `__cxLib`, dopo ~30 s rifiutare la promessa, togliere lo script e cancellare `P[n]` (come già avviene in `onerror`), così la riprova ricarica lo script.

## Limiti e verifiche residue
- **AI reale** (Gemini) e **OCR reale** (Tesseract) non provati; nemmeno la qualità delle carte.
- **Login Google vero** (popup/redirect), telefoni reali, TWA, produzione: non provati. Gli emulatori usano credenziali sintetiche.
- **Ripresa "Genera con IA" dopo l'accesso** (difetto 6): verificata solo con test unitari, non nel browser.
- **Messaggio di conferma:** "Mazzo creato" compare prima della conferma del salvataggio su IndexedDB. Se il salvataggio fallisce segue l'avviso con la copia di riserva (comportamento verificato nella verifica TOLC).
- **Generazione da file con anteprima** (`openPdfAIFromFile`): non usata dalle viste attuali e non verificata nel browser.
- `scripts/verify-security-build.mjs` si ferma sulle immagini che non sono in git (sono sul PC di chi pubblica). I controlli che vengono prima (tracker storico, segreti nella build) passano.

## Comandi eseguiti
| Comando | Risultato |
|---|---|
| nuovi test prima delle correzioni | falliti: 7 (materiale, errori, attesa AI), 1 OCR, 1 PDF, 1 nome dopo l'accesso, 1 materiale enorme |
| `npm test` (finale) | 47 file, **429 superati** |
| `npm run build` | ok |
| `node scripts/test-security-emulator.cjs` (regole Firestore sull'emulatore) | **110 controlli superati** |
| `node scripts/verify-security-build.mjs` | si ferma sulle immagini mancanti (noto, asset sul PC) |
| browser prima: `testo` / `malformato` / `rete` / `blocco` / `ocr` / `account` | 6/8, 3/4, 3/4, 0/2, 2/3 (riprova), 5/6 |
| browser dopo: stessi scenari | **8/8, 4/4, 4/4, 2/2, 3/3, 6/6** |
