# Piano Google — sbloccare l'indicizzazione e portare utenti dalla ricerca

*Cortex · cortexapp.it — settembre 2026*

---

## La situazione in 4 righe

Search Console dice: **75 indicizzate, 192 no** (di cui 180 "Rilevata ma attualmente non indicizzata" + 12 "Scansionata ma non indicizzata"). Non è un bug tecnico: la sitemap e il robots vanno, Google **le vede** ma sceglie di non indicizzarle. Il motivo è uno solo: hai **264 pagine generate a template** e Google giudica la maggior parte "troppo simili tra loro / poco valore aggiunto" e non spreca crawl budget a indicizzarle.

Le pagine in coda sono quasi tutte queste due famiglie:

- **110 pagine-provincia** (`scuole-superiori-<prov>`) — title identico "Scuole superiori a {X}: elenco, indirizzi e programmi", corpo = lista scuole MIUR + 3 FAQ sempre uguali. Cambia solo il nome della provincia.
- **~100 pagine-corso UNIME** (`<corso>-messina`) — stesso template, tutte "a Messina".

## La verità scomoda (leggi questa prima di tutto)

**Non ti servono 180 pagine indicizzate. Ti servono le pagine GIUSTE indicizzate.**

Chi cerca "scuole superiori a Cuneo" vuole un elenco di scuole, **non** un'app di studio per il TOLC: anche se quella pagina si indicizza e si posiziona, ti porta traffico che non converte. Peggio: 200 pagine sottili trascinano giù la percezione di qualità di **tutto** il dominio, e Google rallenta la scansione anche delle pagine buone.

Quindi l'obiettivo NON è "forzare l'indicizzazione di tutte e 180". È:

1. **Rendere fortissime e uniche le poche pagine che convertono davvero** (TOLC + simulatore + corsi UNIME) e farle indicizzare subito.
2. **Decidere cosa fare delle pagine-provincia**: o le rendi davvero uniche, o le togli dall'index così le pagine "buone" respirano.
3. **Costruire autorità** (link in entrata) perché senza quella un dominio nuovo resta in coda comunque.

---

## LIVELLO 1 — Le pagine che portano studenti (fai questo per primo)

Sono le pagine ad **alta intenzione**: chi le cerca è uno studente che deve fare il TOLC o è iscritto a un corso specifico. Sono ~30 pagine, non 264. Qui vale la pena spingere.

**1.1 — Rendi ogni pagina TOLC unica davvero.**
Le 14 pagine `tolc-*` sono il tuo asset migliore (il simulatore gratis è la calamita: 98s di tempo mediano sulla home). Ma se condividono title/struttura sono a rischio "duplicate" anche loro. Per ognuna assicurati che siano **diversi**:
- `<title>` con l'ateneo/città + un dato concreto ("TOLC-I a Messina 2026: date, argomenti e simulazione gratis")
- primo paragrafo con informazioni **specifiche** di quella città/ateneo (date reali della sede, numero posti, soglia) — non lo stesso testo con il nome cambiato
- una tabella o lista di dati che esiste **solo** su quella pagina

**1.2 — Richiedi l'indicizzazione manuale delle pagine di Livello 1.**
In Search Console: incolla l'URL nella barra in alto → "Controlla URL" → "Richiedi indicizzazione". Fallo per le ~30 pagine prioritarie (TOLC + simulatore + i 5-10 corsi UNIME più cercati). Non serve per tutte le 264 — Google limita le richieste — usalo sulle pagine che contano. Questo spesso le fa indicizzare in giorni invece che mesi.

**1.3 — Rafforza i link interni verso queste pagine.**
Google indicizza più volentieri le pagine ben collegate. Dalla home e da `/simulazione-tolc` metti link testuali diretti alle pagine TOLC principali e ai corsi UNIME top. Oggi il cross-linking è solo nei footer: aggiungi link **nel corpo**, con anchor text descrittivo ("Preparati al TOLC-I di Messina").

## LIVELLO 2 — Le 110 pagine-provincia: decidi (non lasciarle a metà)

Queste sono la causa principale del numero "180 non indicizzate". Hai due strade oneste. Scegline una — la peggiore è lasciarle così.

**Opzione A — Le potenzi (se credi nel canale "scuola").**
Aggiungi a ogni pagina-provincia contenuto che **esiste solo lì** e che a Google sembra valore reale:
- dati veri per provincia (n. licei vs tecnici vs professionali, magari % o classifica per numero di studenti)
- un paragrafo scritto diverso per provincia, non il template con il nome cambiato
- link verso le pagine-scuola/indirizzo specifiche di quella provincia

È lavoro (va rifatto il generatore `genera_landing_province.py`), e porta traffico che converte **poco**. La consiglio solo se vuoi davvero presidiare "scuole superiori a X".

**Opzione B — Le togli dall'index (la mia raccomandazione).**
Non le cancelli, ma dici a Google di non indicizzarle, così smettono di zavorrare il dominio e il crawl budget va sulle pagine TOLC:
- aggiungi `<meta name="robots" content="noindex,follow">` nel `<head>` del template province in `genera_landing_province.py`
- **toglile dalla sitemap** (modifica `genera_sitemap.py` per escludere gli URL `scuole-superiori-*`)
- lascia i link interni: gli utenti che ci arrivano navigano lo stesso, ma Google non le considera più "pagine da valutare"

Risultato: nel giro di qualche settimana il conteggio "non indicizzate" crolla, e le pagine che ti interessano vengono scansionate più spesso. **Questo lo posso fare io ora se mi dici di procedere.**

## LIVELLO 3 — Autorità e continuità (il vero moltiplicatore, va avanti nel tempo)

Anche con tutto perfetto, un dominio nuovo senza link in entrata resta in coda. Questa è la leva che sblocca tutto il resto.

- **Backlink**: anche 5-10 link da siti pertinenti cambiano la partita. Dove: subreddit come r/Universitaly e r/Studenti (hai già i post pronti in `REDDIT_PRONTI.md` — usali linkando le pagine TOLC, non la home), gruppi Telegram/Facebook di maturandi e matricole, forum universitari, l'eventuale profilo Instagram in bio.
- **Sitemap fresca**: `lastmod` è fermo al `2026-08-27`. Rigenera la sitemap a ogni deploy (`genera_sitemap.py` con data dinamica) — Google riscansiona prima le pagine con `lastmod` recente.
- **Una pagina "hub" indicizzabile**: una pagina indice reale (es. `/tolc`) che elenca e linka tutte le pagine TOLC con anchor descrittivi. Aiuta Google a scoprirle e distribuisce autorità.
- **Contenuto che attira link naturalmente**: una guida forte tipo "Come funziona il TOLC 2026" (ce l'hai: `come-funziona-il-tolc`) tenuta aggiornata e condivisibile è ciò che gli altri linkano spontaneamente.

---

## Cosa faccio io subito (dimmi sì)

1. **Livello 2, Opzione B** — noindex + rimozione dalla sitemap delle 110 pagine-provincia (modifiche a `genera_landing_province.py` e `genera_sitemap.py`, poi rigeneri e deployi). ~15 min.
2. **Sitemap con `lastmod` dinamico** così ogni deploy segnala freschezza. ~5 min.
3. **Link interni nel corpo** dalla home / simulatore verso le pagine TOLC principali. ~15 min.

Poi tu fai la parte che serve una persona: **richiesta di indicizzazione manuale** delle pagine di Livello 1 in Search Console e **i backlink** (Reddit/Telegram).

## Come misurare che funziona

In Search Console → *Indicizzazione delle pagine*, ogni 1-2 settimane guarda:
- "180 Rilevata ma non indicizzata" deve **scendere** (con Opzione B scende in fretta perché le togli tu)
- le pagine TOLC devono passare a "Indicizzata"
- in *Rendimento*: impression e clic sulle query TOLC devono salire

Il numero che conta non è "quante pagine indicizzate" ma **clic dalla ricerca sulle pagine TOLC**. Punta a quello.

---

### In una riga
Smetti di inseguire l'indicizzazione di 264 pagine sottili: **noindex alle 110 pagine-provincia**, rendi **uniche e richiedi a mano** le ~30 pagine TOLC/UNIME che convertono, e **costruisci qualche backlink**. Il resto è rumore.
