# Sistema UNIME (costruito 22/07/2026)

Obiettivo: uno studente dell'Università di Messina, anche senza appunti, entra e trova
tutti gli insegnamenti del suo corso con argomenti pronti per ripasso/studio. + SEO:
quando cerca il suo corso su Google, può spuntare Cortex.

## Fonte dati — API CINECA (nessuno scraping HTML, JSON puliti)
Base: `https://unime.coursecatalogue.cineca.it/api/v1`
Catena:
1. `/corsi?anno=2026&minimal=true` → albero aree/gruppi/corsi (154 corsi)
2. `/corso/2026/{cod}` → codicione, sede_cod, ordinamento_aa, durata
3. `/corso-offerta/{cod}?codicione=&annoOrdinamento=&sede=` → insegnamenti (per anno → periodo → `attivita`)
4. `/insegnamento?anno=&insegnamento={adCod}&ordinamento_aa=&corso_cod=&schema_id={schemaId}` → `testiTotali[0]`
   con `obiettivi_formativi_it`, `contenuti_it` (= argomenti), `prerequisiti_it`, `verifica_apprendimento_it`, `testi_it`.
   NB: il codice insegnamento è **adCod**, NON l'afId.

## Estrazione
`python importa_unime.py`              → livello 1: tutti i corsi + insegnamenti (veloce, ~2 min)
`python importa_unime.py --programma`  → livello 2: aggiunge il programma per ogni insegnamento (lento, ~3800 chiamate). RESUMABLE.
`python importa_unime.py --corso 10821`→ solo un corso (test)
Output: `public/unime/corsi.json` (indice) + `public/unime/corso/{cod}.json` (corso + insegnamenti[+programma]).
Stato 22/07: livello 1 completo (154 corsi, 3372 insegnamenti). Programma estratto solo su 2 corsi (test) → il resto va riempito col `--programma` (idealmente nella pipeline notturna, resumable).

## Pagine
- `unime.html` (Vite input) → onboarding /unime: Area → Corso → Insegnamenti per anno → argomenti. Legge i JSON. CTA → /app?guest=1&area=universita (stash `cortex_uni_corso`/`cortex_uni_insegnamento`).
- `genera_landing_unime.py` → 105 landing SEO `public/{slug}-messina.html` (una per corso con insegnamenti), stesso design delle landing scuola/TOLC (riusa `genera_landing_scuola.CSS/FX`). Indice in `public/unime/landing_index.json`.
- Hub: tile "Università" → /unime.
- `genera_sitemap.py`: include /unime + le 105 pagine corso (auto da public/*.html). Sitemap = 247 URL.

## Deploy
```
cd C:\Users\User\Desktop\PROGETTI\cortex
python importa_unime.py            # (o --programma per i programmi)
python genera_landing_unime.py
python genera_sitemap.py
npm run build
firebase deploy --only hosting
```

## Aggiornamenti fine sessione 22/07
- **Dedup insegnamenti**: i corsi bilingue elencavano lo stesso esame in IT+EN (percorsi diversi). Fix in `importa_unime.py`: si tiene solo il **percorso principale** (più insegnamenti in italiano) + filtro `DEBITO OFA`. Output marcato `_v:2` → il resume rigenera i file vecchi. Da 3372 a **2642 insegnamenti** puliti. Flag `--force` per rigenerare tutto.
- **Robustezza scraper**: fallback SSL non verificato (fix errore certificati su Windows) + più retry + `sys.exit(1)` su fallimento albero.
- **Kit di studio AI** (`generateUnimeKit` in `modules/architect.js`, esposto su `window`): banner in `app.html` quando `cortex_uni_insegnamento` è settato → genera ~18 flashcard via Gemini; il quiz gira dal mazzo. On-demand (bottone), non auto.
- **A.A. 2026/2027** mostrato su onboarding e landing + avviso "docenti/programmi cambiano ogni anno".
- **`AGGIORNA_UNIME.bat`**: pipeline completa one-click (estrai programmi → landing → sitemap → build → deploy). Resumable; step estrazione best-effort (se rete KO avvisa e prosegue coi dati puliti).
- **Security**: fix in `firestore.rules` (tetto XP, contatori follow int≥0, rimossa `publicDecksToday()`). App Check + referrer chiave API rimandati (serve SDK client / non esposto pulito).

## TODO / prossimi step
- Riempire i programmi di tutti i corsi (`--programma` o `AGGIORNA_UNIME.bat`) — quasi tutti vuoti finché i prof 2026/27 non li caricano sul catalogo.
- App: usare i programmi reali (quando ci sono) per arricchire il prompt del kit + cache dei mazzi generati.
- Kit completo: aggiungere riassunto + esame orale AI (ora solo flashcard+quiz).
- Quando cresce il traffico: integrare App Check nel client (monitoraggio → enforce) e restringere la chiave API.
