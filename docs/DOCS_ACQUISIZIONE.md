# Cortex — Sistema di Acquisizione (Hub, Scuola, SEO)

> Come gira tutto ciò che porta traffico dentro Cortex. Costruito il 21/07/2026.
> Fonte di verità tecnica: se in futuro non ricordi come funziona, leggi qui.

## Architettura del funnel

```
Bio social (cortexapp.it)
      │
      ▼
cortexapp.it  →  HUB (index.html)   ← smista per tipo di studente
      │  tasti: TOLC · Maturità · Università · Scuola · "Cos'è Cortex"
      ├─ TOLC        → /app?guest=1&sim=tolc   (apre la simulazione in guest)
      ├─ Scuola      → /scuola                 (flusso scuola, vedi sotto)
      ├─ Maturità/Uni→ /app?guest=1&area=...   (entra in guest)
      └─ Cos'è Cortex→ /home  (la landing ricca di prima)
```

**Ingresso in guest senza login**: `app.html` ha un handler (`__autoGuestFromURL`) che,
se l'URL ha `?guest=1` OPPURE `?sim=...` OPPURE `?area=...`, entra automaticamente in
modalità ospite (chiama `enterAsGuestApp()`). Il gate di registrazione scatta dopo,
quando l'ospite usa una feature AI (`showGuestLoginGate`). NON toccare quella logica
senza motivo.

## File chiave (nel repo cortex/)

| File | Cos'è |
|------|-------|
| `index.html` | **L'HUB** (root del sito). Prima era la landing → ora è `home.html`. |
| `home.html` | La **landing ricca** di prima (features, prezzi, FAQ). Raggiunta da "Cos'è Cortex" → `/home`. |
| `app.html` | L'app. Contiene l'handler **auto-guest da URL** (cerca `__autoGuestFromURL`). |
| `scuola.html` | **Flusso Scuola**: Regione → Provincia → cerca scuola → indirizzo → materie. Grafica premium (Outfit, mesh, orbs, particelle). Dati indirizzi/materie embeddati; elenco scuole caricato da `/scuole/<regione>.json`. |
| `public/scuole/*.json` | Elenco scuole superiori per regione (generato dai dati MIUR). Uno per regione + `regioni.json`. |
| `public/liceo-*.html`, `public/istituto-*.html` | 7 **landing indirizzo** SEO (generate). |
| `public/scuole-superiori-*.html` | 107 **landing provincia** SEO (generate). |
| `public/tolc-*.html` | 10 landing TOLC (pre-esistenti). |
| `public/sitemap.xml`, `public/robots.txt` | SEO: sitemap con tutte le pagine (~138 URL). |

## Generatori (script Python nel repo)

| Script | Cosa fa | Quando rilanciarlo |
|--------|---------|--------------------|
| `importa_scuole_miur.py` | Legge i CSV MIUR in `scuole_csv/` → genera `public/scuole/*.json`. Raggruppa per **istituto** (no doppioni diurno/serale) e mappa gli indirizzi. | Quando riscarichi i dati scuole (1×/anno basta). |
| `genera_landing_scuola.py` | Genera le 7 landing per indirizzo (`public/liceo-*`, `istituto-*`). | Se cambi il dataset indirizzi/materie. |
| `genera_landing_province.py` | Genera le 107 landing provincia (`public/scuole-superiori-*`). Riusa CSS/FX da `genera_landing_scuola.py`. | Dopo `importa_scuole_miur.py`. |
| `genera_sitemap.py` | Genera `sitemap.xml` + aggiorna `robots.txt`. | Dopo aver aggiunto/tolto pagine. |

## Dati scuole — dove prenderli

Fonte ufficiale: **dati.istruzione.it → Open Data → Ambito Scuola → SCUOLE**.
Scaricare i CSV "Informazioni anagrafiche scuole statali" + "…paritarie" (+ opz. province autonome
Aosta/Trento/Bolzano). Metterli in `cortex/scuole_csv/` e lanciare `importa_scuole_miur.py`.
Colonne usate: `REGIONE, PROVINCIA, CODICEISTITUTORIFERIMENTO, DENOMINAZIONEISTITUTORIFERIMENTO,
DESCRIZIONECOMUNE, SITOWEBSCUOLA, DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA`.
Filtro superiori = whitelist tipologie (LICEO, ISTITUTO TECNICO, IST PROF, …).

## Articolazioni (elettronica, meccanica, informatica…)

L'anagrafe MIUR dà solo la **categoria** (es. "ISTITUTO TECNICO INDUSTRIALE"), non le
articolazioni. Quindi in `scuola.html` c'è la mappa `ARTIC` con le **articolazioni standard
nazionali** per ogni tipo (Tecnico → Informatica, Elettronica, Meccanica, Chimica, Grafica…;
Professionale → Alberghiero, Manutenzione, …). Scelta la scuola, si mostra il set standard.
Materie dettagliate presenti solo per gli indirizzi mappati (Informatica, AFM, licei) — gli altri
entrano in app; i dataset materie si aggiungono col tempo.

## COME AGGIORNARE E DEPLOYARE (la sequenza)

```powershell
cd C:\Users\User\Desktop\PROGETTI\cortex
# (solo se aggiorni le scuole)
python importa_scuole_miur.py
python genera_landing_scuola.py
python genera_landing_province.py
python genera_sitemap.py
# sempre:
npm run build
firebase deploy --only hosting
```
Dopo il deploy: aprire `cortexapp.it` in incognito (il service worker cache la versione vecchia:
Ctrl+Shift+R o incognito per vedere le novità).

## Limiti onesti / TODO

- **SEO per nome-scuola**: non c'è una pagina per ogni scuola (8.720 = thin content, rischio penalità).
  Le pagine-provincia (107) sono la scelta giusta. Per nome scuola Cortex non esce su Google (ok così).
- **Articolazioni per-scuola esatte**: non disponibili in open data → mostriamo il set standard. Servirebbe
  un dataset MIUR "corsi/indirizzi" (da verificare) per l'esatto per-scuola.
- **Materie mancanti**: solo 7 indirizzi hanno le materie; articolazioni tecniche/professionali "in arrivo".
- **Deep-link in-app**: `?sim=tolc` apre la simulazione; `area/materia` sono salvati in localStorage ma
  l'app non ci naviga ancora dritto (atterra sulla home guest). Rifinitura futura.
- **Simulatore standalone** `Desktop/simulatore_tolc.html`: ridondante (Cortex ha già il guest), ignorabile.
