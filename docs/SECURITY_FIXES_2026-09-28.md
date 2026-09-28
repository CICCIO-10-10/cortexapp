# Correzioni sicurezza — 28 settembre 2026

Stato: implementate e verificate localmente. Nessuna modifica pubblicata da questa attività.

## Correzioni

- **Mazzi pubblici:** `cardsCount` reso come numero anche per documenti vecchi malevoli; regole impongono intero 0–200. L'aggiornamento non può cambiare proprietario.
- **Google Play:** SKU ammessi definiti dal server, stato e scadenza verificati, accredito e ricevuta registrati nella stessa transazione. Una ricevuta Sparks viene accreditata una volta sola, anche con richieste simultanee o account diversi. Controllo delle ricevute legacy e conservazione dei riferimenti antifrode alla cancellazione dell'account. Il client non può modificare lo storico acquisti né cancellare direttamente il documento account.
- **Feedback:** creazione limitata ai campi utente previsti, identità autenticata e timestamp server. Risposte ufficiali e pin restano riservati agli amministratori.
- **Statistiche:** rimosse le scritture dirette dei browser. Endpoint ospiti con schema limitato, rimozione query URL, deduplicazione eventi e limiti persistenti per IP; limite di istanze. Aggiornati app e pagine statiche, mantenendo il formato usato dalla dashboard. Le statistiche anonime restano segnali non certificati: un bot può ancora inviare eventi plausibili entro i limiti.
- **Admin TikTok:** chiave rimossa dagli storage del browser e dai parametri URL. Sessione firmata di 30 minuti in cookie HttpOnly/Secure, verifiche Origin sulle modifiche, stato OAuth monouso legato alla sessione e valido 10 minuti. Il Bearer resta disponibile agli script autorizzati. Gli script esterni devono ottenere `url` da `/api/tiktok/auth` con Bearer e inviare anche `state` allo scambio.
- **AI:** se la verifica delle quote fallisce, il server risponde 503 e non chiama il servizio a pagamento.
- **Hosting:** intestazioni di sicurezza estese anche agli URL senza estensione. CSP di base contro embedding/plugin; non è ancora una CSP restrittiva per tutti gli script inline.

## Verifiche

- `npm test`: 81 test superati, inclusi regressione HTML malevolo, cookie falsificati/scaduti, richieste da origini esterne e quota indisponibile.
- `node scripts/test-security-emulator.cjs`: 62 controlli con Firestore Emulator e Admin SDK reali, esclusivamente sul progetto locale `demo-cortex-security`. Comprendono accessi vietati/consentiti, transazioni concorrenti, ricevute legacy e riuso OAuth.
- Build di produzione e scansione `node scripts/verify-security-build.mjs`: presenza del nuovo invio statistiche, assenza del vecchio tracker e ricerca dei segreti server configurati nei file generati. La scansione non è una certificazione di assenza di qualunque segreto.

Per ripetere i controlli integrati avviare Firestore Emulator sulla porta `8189` con progetto `demo-cortex-security` e `firestore.rules`, poi `npm run test:security:emulator`. Il comando forza host locale e progetto demo. È necessario Java 21 per la versione dell'emulatore usata. Su Windows impostare la lingua Java inglese se l'emulatore produce `MissingResourceException` per `it_IT`.

## Pubblicazione

Da PowerShell:

```powershell
Set-Location 'C:\Users\User\Desktop\PROGETTI\cortex'
npm run deploy:security
```

Il comando esegue test, build e scansione, poi pubblica **funzioni → hosting → regole Firestore**, fermandosi al primo errore. Richiede accesso Firebase al progetto `cortex-74a4e`; `npx` può richiedere di installare la CLI. Non usare il precedente `deploy:prod` per questa correzione: aggiorna solo hosting.

Verificare che `DASHBOARD_SECRET` sia configurata nelle funzioni: serve anche per firmare le sessioni e pseudonimizzare i limiti IP. Nessun valore segreto è incluso in questo documento. È consigliabile ruotare la vecchia chiave dopo il deploy, perché versioni precedenti la conservavano nel browser; aggiornare anche eventuali script privati che la usano. La rotazione non è stata eseguita.

Dopo la pubblicazione: riaprire l'app, inviare un feedback normale, aprire la dashboard e verificare nuove visite; il pannello TikTok richiederà di reinserire la chiave. I browser con una vecchia versione aperta potrebbero perdere eventi statistici fino al ricaricamento.

I documenti `_telemetryLimits` sono riutilizzati per ciascun IP pseudonimizzato; `expiresAt` consente di configurare successivamente una policy TTL. Le ricevute antifrode non devono avere TTL. La pulizia automatica non è stata configurata.

Restano da verificare dopo il deploy gli header effettivi del sito e le integrazioni reali Google Play/TikTok: i test locali non eseguono acquisti, pubblicazioni o collegamenti su account reali. I dati storici già alterati non sono stati modificati.
