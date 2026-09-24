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

def build_page(corso, ins_list):
    nome = corso["nome"]
    nome_h = nome.title() if nome.isupper() else nome
    gruppo = corso.get("gruppo", "")
    area = corso.get("area", "")
    sl = corso["_slug"]
    url = f"https://cortexapp.it/{sl}"
    title = f"{nome_h} a Messina (UNIME): esami, programma e ripasso | Cortex"
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
                body += '<p class="hint" style="margin:8px 0">Programma non ancora pubblicato dal docente per il 2026/2027 — Cortex genera comunque flashcard e ripasso dal titolo dell\'insegnamento.</p>'
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
    faq_html = "".join(f'<details><summary>{q}</summary><p style="margin-top:10px">{a}</p></details>' for q, a in faqs)
    ld = {"@context": "https://schema.org", "@type": "FAQPage",
          "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}

    tag = gruppo or "Corso di laurea"
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DFJ42477QK"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
var _nt=false;try{{if(new URLSearchParams(location.search).get('notrack')==='1')localStorage.setItem('cortex_no_track','1');_nt=localStorage.getItem('cortex_no_track')==='1';}}catch(e){{}}
if(!_nt){{gtag('js',new Date());gtag('config','G-DFJ42477QK');}}</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}"><meta property="og:type" content="article">
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

<p class="crumb"><a href="/">Home</a> › <a href="/unime">Università di Messina</a> › {esc(nome_h)}</p>
<div class="badge">🎓 {esc(tag)} · UNIME · A.A. 2026/2027</div>
<h1>{esc(nome_h)}: <span class="grad">esami e programma</span></h1>
<p class="sub">Tutti gli insegnamenti del corso di <strong>{esc(nome_h)}</strong> all'Università di Messina, con CFU e argomenti del programma. Ripassa ogni esame con le flashcard AI di Cortex — gratis, senza registrarti.</p>
<a class="btn btn-p btn-xl" href="/unime?utm_source=seo&utm_campaign={sl}">Apri il tuo corso su Cortex →</a>

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

<h2>Domande frequenti</h2>
{faq_html}

<div class="cta"><h2>Inizia a studiare {esc(nome_h)}</h2><p>I tuoi esami, il programma e le flashcard AI · gratis · senza registrarti</p><br>
<a class="btn btn-p btn-xl" href="/unime?utm_source=seo&utm_campaign={sl}">Entra in Cortex gratis →</a></div>

</main>
<footer><div class="fgrid">
<div><h4>Università di Messina</h4><a href="/unime">Tutti i corsi UNIME</a><a href="/unime">Trova il tuo corso</a><a href="/app">Apri l'app</a></div>
<div><h4>Scuola & TOLC</h4><a href="/scuola">Trova il tuo indirizzo</a><a href="/simulazione-tolc?sim=tolc">Simulazione TOLC gratis</a></div>
<div><h4>Cortex</h4><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Termini</a></div>
</div><p style="text-align:center;color:var(--muted2);margin-top:36px;font-size:.8rem">© 2026 Cortex — cortexapp.it · Dati dal catalogo dell'Università di Messina; possibili variazioni per anno accademico.</p></footer>
{gls.FX}
</body>
</html>"""

def main():
    idx = json.loads((UNIME / "corsi.json").read_text(encoding="utf-8"))["corsi"]
    by_cod = {c["cod"]: c for c in idx}
    used = set()
    n = 0
    generati = []
    for c in idx:
        cod = c["cod"]
        fp = UNIME / "corso" / f"{cod}.json"
        if not fp.exists():
            continue
        d = json.loads(fp.read_text(encoding="utf-8"))
        ins = d.get("insegnamenti", [])
        if not ins:  # dottorati/master senza insegnamenti: niente landing
            continue
        sl = slug(c["nome"]) + "-messina"
        if sl in used:  # collisione nome (es. triennale+magistrale): distingui col gruppo
            g = slug(c.get("gruppo", "") or "corso")
            sl = slug(c["nome"]) + "-" + g + "-messina"
        used.add(sl)
        c["_slug"] = sl
        (OUT / f"{sl}.html").write_text(build_page(c, ins), encoding="utf-8")
        generati.append({"cod": cod, "slug": sl, "nome": c["nome"], "gruppo": c.get("gruppo", "")})
        n += 1
    # salva l'elenco slug (serve alla sitemap)
    (UNIME / "landing_index.json").write_text(json.dumps(generati, ensure_ascii=False), encoding="utf-8")
    print(f"{n} landing corso generate in {OUT}")

if __name__ == "__main__":
    main()
