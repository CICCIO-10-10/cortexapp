# Rebranding landing e SEO — 26/27 settembre 2026

Il sistema visivo già usato sulle 19 pagine pilota è ora applicato a 261 pagine: 104 corsi UniMe, 110 province, 7 indirizzi scuola, 10 tipi TOLC, 10 simulazioni, 6 guide TOLC, 4 pagine territoriali e 10 pagine tra hub, catalogo, demo, confronto, quiz e documenti legali. La landing /home mantiene il suo foglio cortex-marketing.css già coerente con il prodotto.

Il registro scripts/seo-pages.json è esplicito. Il plugin Vite applica i tre fogli condivisi a sviluppo, anteprima e build; i generatori possono rigenerare gli HTML senza perdere lo stile alla build successiva. Per nuovi URL eseguire scripts/expand-seo-registry.mjs e controllare le famiglie assegnate. Le pagine tecniche admin, OAuth e verifica Google sono escluse.

## Verifica

- 61 test passati, inclusi copertura di tutti gli HTML pubblici, reversibilità e idempotenza dell'iniezione grafica.
- Validazione traduzioni e build completate.
- Controllo invarianti: PASS su 261 pagine. Nessuna modifica a contenuto, titoli, canonical, robots, dati strutturati, link, immagini o ID rispetto alla baseline di questa modifica.
- Controllo visivo nel browser: TOLC-B desktop; provincia Messina, Medicina Messina e ingresso principale a 390 px.
- Restano gli avvisi preesistenti di build su chunk grandi e import statici/dinamici misti.

Report: artifacts/seo-rollout-20260926/seo-diff.json. Baseline protetta nella stessa cartella. Per ripetere il confronto: node scripts/check-seo-invariants.mjs --report-dir=artifacts/seo-rollout-20260926.

Questa attività prepara il sito in locale; non effettua pubblicazione Firebase o nuove submission Google Play.
