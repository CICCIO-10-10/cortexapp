#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genera_landing_unime.py — Landing SEO, una per corso di laurea UNIME.

Obiettivo (acquisizione, richiesto 22/07/2026): quando uno cerca su Google il
suo corso a Messina (es. "ingegneria civile messina esami programma"), c'è la
possibilità che spunti Cortex. Ogni pagina elenca gli insegnamenti reali del
corso (dal catalogo UNIME) con CFU e argomenti, + CTA verso /unime.

Riusa CSS e FX di genera_landing_scuola (stesso design delle landing TOLC/scuola).
Legge: public/unime/corsi.json + public/unime/corso/{cod}.json
Output: public/{slug}-messina.html  (cleanUrls -> /{slug}-messina)

Uso: python genera_landing_unime.py
"""
import json, re, html as _html
from pathlib import Path
import genera_landing_scuola as gls  # riusa CSS e FX

BASE = Path(__file__).resolve().parent
OUT = BASE / "public"
UNIME = OUT / "unime"
HUB_SLUG = "corsi-unime-messina"  # pagina-elenco statica di tutti i corsi (25/09/2026)

def slug(s):
    s = s.lower()
    for a, b in [("à","a"),("è","e"),("é","e"),("ì","i"),("ò","o"),("ù","u"),("'"," ")]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-+", "-", s)

def esc(s):
    return _html.escape(str(s or ""), quote=True)

def splita_arg(t):
    if not t:
        return []
    parts = re.split(r"\r?\n|•|·|;|–\s|(?:\d+[\).]\s)", t)
    parts = [p.strip() for p in parts if len(p.strip()) > 3]
    if len(parts) < 2:
        parts = [p.strip() for p in re.split(r"\.\s+(?=[A-ZÀ-Ù])", t) if len(p.strip()) > 3]
    return parts[:14]

# 08/10/2026: quale test d'ingresso serve per ogni corso (scheda CISIA dell'Università di Messina,
# https://www.cisiaonline.it/atenei/universita-degli-studi-di-messina , letta l'8/10/2026).
# Solo i corsi della sede di Messina che compaiono nella scheda: per gli altri non si mostra nulla.
TOLC_VERIFICA = "8 ottobre 2026"
TOLC_UNIME = {
    # nome normalizzato: (test, accesso, altri test riconosciuti)
    "ingegneria elettronica e informatica": ("TOLC-I", "libero", []),
    "ingegneria biomedica": ("TOLC-I", "libero", []),
    "ingegneria civile": ("TOLC-I", "libero", []),
    "ingegneria industriale": ("TOLC-I", "libero", []),
    "ingegneria gestionale": ("TOLC-I", "libero", []),
    "economia aziendale": ("TOLC-E", "libero", []),
    "economia banca e finanza": ("TOLC-E", "libero", []),
    "management d impresa": ("TOLC-E", "libero", []),
    "big data per le scienze economiche": ("TOLC-E", "libero", []),
    "scienze ambientali marine e terrestri": ("TOLC-S", "libero", ["TOLC-B"]),
    "informatica": ("TOLC-S", "libero", ["TOLC-I"]),
    "matematica": ("TOLC-S", "libero", ["TOLC-I"]),
    "fisica": ("TOLC-S", "libero", ["TOLC-I"]),
    "chimica": ("TOLC-S", "libero", []),
    "scienze e tecnologie della navigazione": ("TOLC-S", "libero", ["TOLC-I"]),
    "scienze biologiche": ("TOLC-B", "libero", ["TOLC-S"]),
    "scienze nutraceutiche e alimenti funzionali": ("TOLC-F", "libero", ["TOLC-B", "TOLC-S"]),
    "chimica e tecnologia farmaceutiche": ("TOLC-F", "libero", ["TOLC-B"]),
    "scienze gastronomiche": ("TOLC-F", "libero", []),
    "farmacia": ("TOLC-F", "libero", ["TOLC-B"]),
    "scienze motorie sport e salute": ("TOLC-F", "programmato", []),
    "archeologia e storia dell arte": ("TOLC-SU", "libero", []),
    "scienze della formazione e della comunicazione": ("TOLC-SU", "libero", []),
    "consulente del lavoro e scienze dei servizi giuridici": ("TOLC-SU", "libero", []),
    "filosofia": ("TOLC-SU", "libero", []),
    "discipline delle arti della musica e dello spettacolo": ("TOLC-SU", "libero", []),
    "lettere": ("TOLC-SU", "libero", []),
    "scienze dell informazione tecniche giornalistiche e social media": ("TOLC-SU", "libero", []),
    "scienze del turismo della cultura e dell impresa": ("TOLC-SU", "libero", []),
    "lingue letterature straniere e tecniche della mediazione linguistica": ("TOLC-SU", "libero", []),
    "giurisprudenza": ("TOLC-SU", "libero", []),
    "scienze e tecniche psicologiche": ("TOLC-PSI", "programmato", []),
    "scienze e tecniche psicologiche cliniche e preventive": ("TOLC-PSI", "programmato", []),
    "scienze e tecnologie agrarie per la transizione ecologica": ("TOLC-AV", "libero", ["TOLC-F"]),
    "scienze tecnologie e sicurezza delle produzioni animali": ("TOLC-AV", "libero", ["TOLC-F"]),
    "heritage innovation engineering": ("CEnT-S", "libero", []),
    "marine biology and blue biotechnologies": ("CEnT-S", "libero", []),
}

def _norm(n):
    import unicodedata
    n = unicodedata.normalize("NFKD", n.replace("’", " ")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", n).split())

def tolc_info(corso):
    """(test, accesso, altri) per i corsi della sede di Messina presenti nella scheda CISIA, altrimenti None."""
    if (corso.get("sede") or "MESSINA").strip() != "MESSINA":
        return None
    if (corso.get("gruppo") or "").lower() not in ("triennale", "magistrale a ciclo unico"):
        return None
    return TOLC_UNIME.get(_norm(corso["nome"]))

def tolc_box(corso, nome_h, sl):
    t = tolc_info(corso)
    if not t:
        return ""
    test, acc, altri = t
    acc_h = "accesso libero" if acc == "libero" else "accesso programmato (numero chiuso)"
    if test == "CEnT-S":
        test_h = "il <strong>CEnT-S</strong> (il test CISIA in inglese)"
        cta = ""
    else:
        k = test.lower()
        test_h = f'il <a href="/{k}" style="color:#c084fc"><strong>{test}</strong></a>'
        cta = (f'<a class="mcta" href="/app?guest=1&sim={k}&veloce=1&utm_source=seo&utm_campaign={sl}&utm_content=corso_tolc">'
               f'Prova il {test}: 10 domande veloci, gratis →</a>')
    alt = (" Vale anche il " + " o il ".join(altri) + ".") if altri else ""
    nota = (" Nei corsi ad accesso libero il test non esclude nessuno: serve a verificare la preparazione iniziale e, sotto la soglia, il bando può prevedere obblighi formativi aggiuntivi (OFA)."
            if acc == "libero" else " Il punteggio serve per la graduatoria: posti e soglie sono nel bando del corso.")
    return (f'\n<div class="card tolcbox" style="margin:22px 0 6px;padding:18px 20px">'
            f'<p style="font-size:.78rem;color:#a78bfa;font-weight:700;margin:0 0 6px">🎯 TEST D\'INGRESSO</p>'
            f'<p style="margin:0">Per entrare a <strong>{esc(nome_h)}</strong> a Messina serve {test_h} · {acc_h}.{alt}{nota}</p>'
            f'{cta}'
            f'<p class="hint" style="margin:8px 0 0">Fonte: scheda CISIA dell\'Università di Messina, verificata l\'{TOLC_VERIFICA}. Fa sempre fede il bando UniMe del corso.</p></div>')

def tolc_faq(corso, nome_h):
    t = tolc_info(corso)
    if not t:
        return None
    test, acc, altri = t
    alt = (" Vale anche il " + " o il ".join(altri) + ".") if altri else ""
    acc_h = "Il corso è ad accesso libero: il test serve a verificare la preparazione iniziale e, sotto la soglia, il bando può prevedere obblighi formativi aggiuntivi (OFA)." if acc == "libero" else "Il corso è ad accesso programmato: il punteggio serve per la graduatoria."
    q = f"Che TOLC serve per {nome_h} a Messina?" if test != "CEnT-S" else f"Che test serve per {nome_h} a Messina?"
    return (q, f"Serve il {test}.{alt} {acc_h} Fonte: scheda CISIA dell'Università di Messina; fa fede il bando UniMe.")

def build_page(corso, ins_list, correlati=None, canon_slug=None):
    nome = corso["nome"]
    nome_h = nome.title() if nome.isupper() else nome
    gruppo = corso.get("gruppo", "")
    area = corso.get("area", "")
    sl = corso["_slug"]
    url = f"https://cortexapp.it/{sl}"
    # 25/09/2026: stesso corso in piu' sedi (Siracusa/Noto) = contenuto quasi identico.
    # La copia di sede punta (canonical) alla versione di Messina -> niente duplicati.
    canon = f"https://cortexapp.it/{canon_slug or sl}"
    sede = (corso.get("sede") or "MESSINA").strip()
    sede_h = sede.title()
    # 25/09/2026: il tipo di laurea nel titolo -> triennale e magistrale con lo
    # stesso nome non risultano piu' "pagine duplicate" per Google.
    _lv = f" ({gruppo})" if gruppo else ""
    if sede != "MESSINA":
        _lv = f" ({gruppo + ', ' if gruppo else ''}sede di {sede_h})"
    title = f"{nome_h}{_lv} a Messina (UNIME): esami, programma e ripasso | Cortex"
    if sede != "MESSINA":
        title = f"{nome_h} ({gruppo + ', ' if gruppo else ''}sede di {sede_h}) — Università di Messina (UNIME): esami e programma | Cortex"
    desc = (f"Tutti gli insegnamenti del corso di {nome_h} all'Università di Messina (UNIME), "
            f"con CFU e programma. Ripassa con le flashcard AI di Cortex, gratis e senza registrarti.")

    # insegnamenti per anno
    per_anno = {}
    for i in ins_list:
        per_anno.setdefault(i.get("annoCorso") or 0, []).append(i)
    blocks = ""
    n_ins = len(ins_list)
    for y in sorted(per_anno):
        blocks += f'<h3>{y}° anno</h3>' if y else '<h3>Altri insegnamenti</h3>'
        for i in per_anno[y]:
            args = splita_arg(i.get("contenuti"))
            meta = []
            if i.get("cfu"): meta.append(f'{i["cfu"]} CFU')
            if i.get("ssd"): meta.append(esc(i["ssd"]))
            if i.get("docenti"): meta.append("👤 " + esc(", ".join(i["docenti"][:2])))
            metah = " · ".join(meta)

            def _sec(label, txt, mx):
                t = (txt or "").strip()
                if len(t) < 15: return ""
                return f'<h4 style="margin:12px 0 4px;font-size:.95rem;color:#c084fc">{label}</h4><p style="margin:0 0 6px;color:var(--muted);font-size:.92rem">{esc(t[:mx])}{"…" if len(t) > mx else ""}</p>'

            has_prog = any((i.get(k) or "").strip() and len((i.get(k) or "").strip()) > 15 for k in ("obiettivi", "contenuti", "testi", "verifica"))
            body = ""
            if has_prog:
                body += '<p style="font-size:.78rem;color:#a78bfa;margin:2px 0 8px;font-weight:600">📅 Programma ufficiale UNIME · A.A. 2026/2027</p>'
            body += _sec("Obiettivi", i.get("obiettivi"), 700)
            if args:
                body += '<h4 style="margin:12px 0 4px;font-size:.95rem;color:#c084fc">Argomenti del programma</h4><ul>' + "".join(f"<li>{esc(a)}</li>" for a in args) + "</ul>"
            else:
                body += _sec("Contenuti", i.get("contenuti"), 700)
            body += _sec("Prerequisiti", i.get("prerequisiti"), 350)
            body += _sec("Modalità d'esame", i.get("verifica"), 350)
            body += _sec("Testi / bibliografia", i.get("testi"), 450)
            if not has_prog:
                body += '<p class="hint" style="margin:8px 0">Il programma 2026/2027 non è ancora disponibile. Carica appunti, dispense o syllabus per creare un ripasso personalizzato.</p>'
            cta = f'/unime?utm_source=seo&utm_campaign={sl}'
            body += f'<a class="mcta" href="{cta}">Studia {esc(i["nome"])} con Cortex →</a>'
            summ = esc(i["nome"]) + (f' <span class="hint">· {metah}</span>' if metah else "")
            blocks += f'<details><summary>📘 {summ}</summary>{body}</details>'

    faqs = [
        (f"Quali esami si danno al corso di {nome_h} a Messina?",
         "Gli insegnamenti principali sono: " + ", ".join(esc(i["nome"].title() if i["nome"].isupper() else i["nome"]) for i in ins_list[:10]) +
         (" e altri." if n_ins > 10 else ".") + " I dati provengono dal catalogo ufficiale dell'Università di Messina."),
        (f"Quanti insegnamenti ha {nome_h}?",
         f"Il corso conta {n_ins} insegnamenti distribuiti sugli anni. Per ognuno trovi CFU, docenti e argomenti del programma."),
        ("Come posso ripassare per gli esami?",
         "Con Cortex apri un insegnamento e l'AI genera flashcard con ripetizione spaziata dal programma reale e dai tuoi appunti. Gratis, senza registrarti."),
    ]
    _tf = tolc_faq(corso, nome_h)
    if _tf:
        faqs.insert(0, _tf)
    faq_html = "".join(f'<details><summary>{q}</summary><p style="margin-top:10px">{a}</p></details>' for q, a in faqs)
    ld = {"@context": "https://schema.org", "@type": "FAQPage",
          "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}

    tag = gruppo or "Corso di laurea"
    # 25/09/2026 SEO: link interni verso i corsi dello stesso dipartimento.
    # Prima le landing erano "orfane" (0 link in ingresso, solo sitemap) e
    # Google le lasciava in "rilevata/scansionata ma non indicizzata".
    altri_html = ""
    if correlati:
        _li = "".join(
            f'<li><a href="/{x["slug"]}">{esc(x["nome_h"])}</a> <span class="hint">· {esc(x["gruppo"] or "Corso")}{(" · " + esc(x["sede"])) if x["sede"] != "Messina" else ""}</span></li>'
            for x in correlati)
        altri_html = (f'<h2>Altri corsi di {esc(area) if area else "UNIME"} a Messina</h2>'
                      f'<ul class="tips">{_li}</ul>'
                      f'<p><a href="/{HUB_SLUG}">Vedi tutti i corsi di laurea UNIME →</a></p>')
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<script src="/cortex-consent.js" defer></script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canon}"><meta property="og:type" content="article">
<meta property="og:image" content="https://cortexapp.it/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
<style>{gls.CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="bg-mesh"></div><div class="orb orb1"></div><div class="orb orb2"></div>
<header><div class="hin">
<a href="/" class="hlogo"><img src="/LOGO_PREMIUM.png" alt="Cortex">Cortex</a>
<nav class="hnav"><a href="/unime" class="hidem">Università</a><a href="/scuola" class="hidem">Scuola</a><a href="/unime" class="btn btn-p" style="padding:10px 20px">Prova gratis</a></nav>
</div></header>
<main class="container">

<p class="crumb"><a href="/">Home</a> › <a href="/{HUB_SLUG}">Corsi UNIME</a> › {esc(nome_h)}</p>
<div class="badge">🎓 {esc(tag)} · UNIME{(' · sede di ' + esc(sede_h)) if sede != "MESSINA" else ''} · A.A. 2026/2027</div>
{(f'<p class="hint">Questo corso si tiene anche a Messina: <a href="/{canon_slug}">vedi {esc(nome_h)} (sede di Messina)</a>.</p>') if canon_slug else ''}
<h1>{esc(nome_h)}: <span class="grad">esami e programma</span></h1>
<p class="sub">Tutti gli insegnamenti del corso di <strong>{esc(nome_h)}</strong> all'Università di Messina, con CFU e argomenti del programma. Ripassa ogni esame con le flashcard AI di Cortex — gratis, senza registrarti.</p>
<a class="btn btn-p btn-xl" href="/unime?utm_source=seo&utm_campaign={sl}">Apri il tuo corso su Cortex →</a>
{tolc_box(corso, nome_h, sl)}
<h2>Gli insegnamenti del corso ({n_ins})</h2>
<p>Apri un insegnamento per vedere CFU, docenti e argomenti — e generare le flashcard su quelli dove hai più difficoltà.</p>
<p class="hint">📅 Dati dal catalogo ufficiale UNIME, Anno Accademico 2026/2027. Docenti e programmi possono cambiare di anno in anno.</p>
{blocks}

<h2>Come preparare gli esami</h2>
<ul class="tips">
<li><strong>Ripassa con le flashcard AI:</strong> carica appunti o una foto e Cortex crea flashcard con ripetizione spaziata dagli argomenti del programma.</li>
<li><strong>Un esame alla volta:</strong> scegli l'insegnamento, studia gli argomenti e monitora i progressi.</li>
<li><strong>Zero appunti? Nessun problema:</strong> Cortex parte dal programma ufficiale del corso e costruisce il ripasso per te.</li>
</ul>

{altri_html}
<h2>Domande frequenti</h2>
{faq_html}

<div class="cta"><h2>Inizia a studiare {esc(nome_h)}</h2><p>I tuoi esami, il programma e le flashcard AI · gratis · senza registrarti</p><br>
<a class="btn btn-p btn-xl" href="/unime?utm_source=seo&utm_campaign={sl}">Entra in Cortex gratis →</a></div>

</main>
<footer><div class="fgrid">
<div><h4>Università di Messina</h4><a href="/{HUB_SLUG}">Tutti i corsi UNIME</a><a href="/unime">Trova il tuo corso</a><a href="/app">Apri l'app</a></div>
<div><h4>Scuola & TOLC</h4><a href="/scuola">Trova il tuo indirizzo</a><a href="/simulazione-tolc?sim=tolc">Simulazione TOLC gratis</a></div>
<div><h4>Cortex</h4><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Termini</a></div>
</div><p style="text-align:center;color:var(--muted2);margin-top:36px;font-size:.8rem">© 2026 Cortex — cortexapp.it · Dati dal catalogo dell'Università di Messina; possibili variazioni per anno accademico.</p></footer>
{gls.FX}
<script src="/cortex-android.js" defer></script>
</body>
</html>"""

def _nome_h(n):
    return n.title() if n.isupper() else n

def build_hub(voci):
    """Pagina statica /corsi-unime-messina: TUTTI i corsi raggruppati per dipartimento,
    con link HTML veri (la pagina /unime li costruisce via JS e Google non li segue bene)."""
    per_area = {}
    for v in voci:
        per_area.setdefault(v["area"] or "Altri corsi", []).append(v)
    url = f"https://cortexapp.it/{HUB_SLUG}"
    title = "Corsi di laurea Università di Messina (UNIME) 2026/2027: elenco completo | Cortex"
    desc = (f"L'elenco completo dei {len(voci)} corsi di laurea dell'Università di Messina, divisi per dipartimento: "
            "triennali, magistrali e a ciclo unico, con esami e programmi. Ripassa con le flashcard AI di Cortex.")
    sez = ""
    for a in sorted(per_area):
        items = sorted(per_area[a], key=lambda v: (v["gruppo"] != "Triennale", v["nome_h"]))
        sez += (f'<h2>{esc(a)}</h2><ul class="tips">' +
                "".join(f'<li><a href="/{v["slug"]}">{esc(v["nome_h"])}</a> <span class="hint">· {esc(v["gruppo"] or "Corso")}{(" · sede di " + esc(v["sede"])) if v["sede"] != "Messina" else ""}</span></li>' for v in items) +
                "</ul>")
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<script src="/cortex-consent.js" defer></script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}"><meta property="og:type" content="website">
<meta property="og:image" content="https://cortexapp.it/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
<style>{gls.CSS}</style>
</head>
<body>
<div class="bg-mesh"></div><div class="orb orb1"></div><div class="orb orb2"></div>
<header><div class="hin">
<a href="/" class="hlogo"><img src="/LOGO_PREMIUM.png" alt="Cortex">Cortex</a>
<nav class="hnav"><a href="/unime" class="hidem">Università</a><a href="/scuola" class="hidem">Scuola</a><a href="/unime" class="btn btn-p" style="padding:10px 20px">Prova gratis</a></nav>
</div></header>
<main class="container">
<p class="crumb"><a href="/">Home</a> › <a href="/unime">Università di Messina</a> › Tutti i corsi</p>
<div class="badge">🎓 UNIME · A.A. 2026/2027</div>
<h1>Corsi di laurea <span class="grad">Università di Messina</span></h1>
<p class="sub">Tutti i {len(voci)} corsi dell'Università di Messina divisi per dipartimento. Apri il tuo corso per vedere esami, CFU e programma — e ripassa con le flashcard AI di Cortex, gratis.</p>
<a class="btn btn-p btn-xl" href="/unime?utm_source=seo&utm_campaign={HUB_SLUG}">Trova il tuo corso su Cortex →</a>
{sez}
<p class="hint">📅 Dati dal catalogo ufficiale UNIME, Anno Accademico 2026/2027. Corsi e programmi possono cambiare di anno in anno.</p>
</main>
<footer><div class="fgrid">
<div><h4>Università di Messina</h4><a href="/unime">Trova il tuo corso</a><a href="/app">Apri l'app</a></div>
<div><h4>Scuola & TOLC</h4><a href="/scuola">Trova il tuo indirizzo</a><a href="/simulazione-tolc?sim=tolc">Simulazione TOLC gratis</a></div>
<div><h4>Cortex</h4><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Termini</a></div>
</div><p style="text-align:center;color:var(--muted2);margin-top:36px;font-size:.8rem">© 2026 Cortex — cortexapp.it · Dati dal catalogo dell'Università di Messina.</p></footer>
{gls.FX}
<script src="/cortex-android.js" defer></script>
</body>
</html>"""

def main():
    idx = json.loads((UNIME / "corsi.json").read_text(encoding="utf-8"))["corsi"]
    used = set()
    voci = []   # pass 1: slug + dati (serve per i link "altri corsi")
    # Messina per prima: lo slug "{nome}-messina" spetta alla sede di Messina
    idx = sorted(idx, key=lambda c: (c.get("sede", "MESSINA") or "MESSINA") != "MESSINA")
    primario = {}  # (nome, gruppo) -> slug della sede di Messina
    for c in idx:
        cod = c["cod"]
        fp = UNIME / "corso" / f"{cod}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        ins = d.get("insegnamenti", [])
        if not ins:  # dottorati/master senza insegnamenti: niente landing
            continue
        sede = (c.get("sede") or "MESSINA").strip()
        twin = primario.get((c["nome"], c.get("gruppo", ""))) if sede != "MESSINA" else None
        sl = (slug(c["nome"]) + "-" + slug(sede)) if twin else (slug(c["nome"]) + "-messina")
        if sl in used:  # collisione nome (es. triennale+magistrale): distingui col gruppo
            g = slug(c.get("gruppo", "") or "corso")
            sl = slug(c["nome"]) + "-" + g + "-messina"
        used.add(sl)
        c["_slug"] = sl
        if sede == "MESSINA":
            primario.setdefault((c["nome"], c.get("gruppo", "")), sl)
        voci.append({"c": c, "ins": ins, "slug": sl, "cod": cod, "nome": c["nome"], "twin": twin,
                     "sede": sede.title(), "nome_h": _nome_h(c["nome"]), "gruppo": c.get("gruppo", ""), "area": c.get("area", "")})
    voci.sort(key=lambda v: v["nome"])
    generati = []
    for v in voci:   # pass 2: pagine con i correlati dello stesso dipartimento
        stessi = [x for x in voci if x["area"] == v["area"] and x["slug"] != v["slug"]]
        stessi.sort(key=lambda x: (x["gruppo"] != v["gruppo"], x["nome_h"]))
        (OUT / f"{v['slug']}.html").write_text(build_page(v["c"], v["ins"], stessi[:12], v["twin"]), encoding="utf-8")
        generati.append({"cod": v["cod"], "slug": v["slug"], "nome": v["nome"], "gruppo": v["gruppo"], "canonical": v["twin"] or v["slug"]})
    (OUT / f"{HUB_SLUG}.html").write_text(build_hub(voci), encoding="utf-8")
    # salva l'elenco slug (serve alla sitemap)
    (UNIME / "landing_index.json").write_text(json.dumps(generati, ensure_ascii=False), encoding="utf-8")
    print(f"{len(generati)} landing corso + pagina elenco /{HUB_SLUG} generate in {OUT}")

if __name__ == "__main__":
    main()
