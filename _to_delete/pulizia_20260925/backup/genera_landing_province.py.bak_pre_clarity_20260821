#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genera_landing_province.py — Una landing SEO per ogni PROVINCIA
("Scuole superiori a Messina: elenco, indirizzi e programmi"), stesso stile
delle landing TOLC/indirizzo. Elenca le scuole reali (dati MIUR importati) e
rimanda al tool /scuola. Cross-linkate tra loro (SEO).

Prerequisito: aver già lanciato importa_scuole_miur.py (genera public/scuole/*.json).
Uso: python genera_landing_province.py
Output: public/scuole-superiori-<provincia>.html
"""
import json, re
from pathlib import Path
import genera_landing_scuola as gls  # riusa CSS e FX (stesso design delle TOLC)

BASE = Path(__file__).resolve().parent
OUT  = BASE / "public"
SC   = BASE / "public" / "scuole"

def slug(s):
    s = s.lower()
    for a,b in [("à","a"),("è","e"),("é","e"),("ì","i"),("ò","o"),("ù","u")]:
        s = s.replace(a,b)
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')

# label indirizzo -> slug della landing indirizzo (per link interni)
IND_LINK = {
  "Liceo Scientifico":"liceo-scientifico",
  "Scientifico · Scienze Applicate":"liceo-scienze-applicate",
  "Liceo Classico":"liceo-classico",
  "Liceo Linguistico":"liceo-linguistico",
  "Liceo Scienze Umane":"liceo-scienze-umane",
  "Tecnico · Informatica/Tecnologico":"istituto-tecnico-informatica",
  "Tecnico · Economico (AFM)":"istituto-tecnico-economico",
}

def esc(s): return (s or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def footer(regione, prov_correnti, prov_regione):
    altre = "".join('<a href="/scuole-superiori-%s">Scuole a %s</a>' % (slug(p), esc(p))
                    for p in prov_regione if p != prov_correnti)
    ind = ''.join('<a href="/%s">%s</a>' % (s, esc(l)) for l, s in IND_LINK.items())
    return ('<footer><div class="fgrid">'
      '<div><h4>Scuole in ' + esc(regione) + '</h4>' + (altre or '<span style="color:var(--muted2)">—</span>') + '</div>'
      '<div><h4>Indirizzi</h4>' + ind + '</div>'
      '<div><h4>Cortex</h4><a href="/scuola">Trova la tua scuola</a><a href="/simulazione-tolc?sim=tolc">Simulazione TOLC</a><a href="/app">Apri l\'app</a><a href="/privacy">Privacy</a></div>'
      '</div><p style="text-align:center;color:var(--muted2);margin-top:36px;font-size:.8rem">© 2026 Cortex — cortexapp.it · Elenco scuole da anagrafe ufficiale MIUR (open data).</p></footer>')

def build(regione, prov, schools, prov_regione):
    n = len(schools)
    title = f"Scuole superiori a {prov}: elenco, indirizzi e programmi | Cortex"
    desc  = f"Elenco delle {n} scuole superiori della provincia di {prov}: licei, istituti tecnici e professionali con i loro indirizzi. Trova la tua e ripassa il programma con Cortex, gratis."
    url   = f"https://cortexapp.it/scuole-superiori-{slug(prov)}"

    # indirizzi disponibili in provincia (chip, con link se mappato)
    labels = {}
    for s in schools:
        for it in s.get("indirizzi", []):
            labels[it["label"]] = it.get("key")
    chips = ""
    for lab in sorted(labels):
        sl = IND_LINK.get(lab)
        if sl: chips += f'<a href="/{sl}" class="chip">{esc(lab)}</a>'
        else:  chips += f'<span class="chip">{esc(lab)}</span>'

    # elenco scuole
    rows = ""
    for s in sorted(schools, key=lambda x: x["nome"]):
        sito = s.get("sito") or ""
        link = f' · <a href="{esc(sito)}" target="_blank" rel="nofollow noopener" style="color:#c084fc">sito ↗</a>' if sito else ""
        rows += f'<li><b>{esc(s["nome"])}</b> <span class="hint">— {esc(s.get("comune",""))}{link}</span></li>'

    faqs = [
        (f"Quante scuole superiori ci sono a {prov}?", f"Nella provincia di {prov} ci sono {n} istituti superiori tra licei, istituti tecnici e professionali (fonte: anagrafe MIUR)."),
        ("Come trovo il programma della mia scuola?", "Scegli la tua scuola nel tool di Cortex, poi il tuo indirizzo: vedrai le materie e gli argomenti tipici del programma, e potrai ripassarli con le flashcard AI."),
        ("È gratis?", "Sì: puoi entrare in Cortex e provare le simulazioni e le flashcard senza registrarti."),
    ]
    faq_html = "".join(f'<details><summary>{esc(q)}</summary><p style="margin-top:10px">{esc(a)}</p></details>' for q,a in faqs)
    ld = {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]}

    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DFJ42477QK"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
var _nt=false;try{{if(new URLSearchParams(location.search).get('notrack')==='1')localStorage.setItem('cortex_no_track','1');_nt=localStorage.getItem('cortex_no_track')==='1';}}catch(e){{}}
if(!_nt){{gtag('js',new Date());gtag('config','G-DFJ42477QK');}}</script>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}"><meta property="og:type" content="article">
<meta property="og:image" content="https://cortexapp.it/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
<style>{gls.CSS}
.chip{{display:inline-block;background:var(--glass);border:1px solid var(--gborder);border-radius:50px;padding:7px 15px;margin:4px;font-size:.85rem;color:#d7dce3;text-decoration:none}}
a.chip:hover{{border-color:rgba(168,85,247,.5);color:#fff}}
ul.schools{{list-style:none;columns:2;column-gap:28px}}
ul.schools li{{padding:7px 0;font-size:.92rem;break-inside:avoid}}
@media(max-width:640px){{ul.schools{{columns:1}}}}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="bg-mesh"></div><div class="orb orb1"></div><div class="orb orb2"></div>
<header><div class="hin">
<a href="/" class="hlogo"><img src="/LOGO_PREMIUM.png" alt="Cortex">Cortex</a>
<nav class="hnav"><a href="/scuola" class="hidem">Trova la tua scuola</a><a href="/simulazione-tolc?sim=tolc" class="hidem">TOLC</a><a href="/scuola" class="btn btn-p" style="padding:10px 20px">Prova gratis</a></nav>
</div></header>
<main class="container">

<p class="crumb"><a href="/">Home</a> › <a href="/scuola">Scuole</a> › {esc(regione)} › {esc(prov)}</p>
<div class="badge">🏫 {esc(regione)} · Aggiornato a luglio 2026</div>
<h1>Scuole superiori a {esc(prov)}: <span class="grad">indirizzi e programmi</span></h1>
<p class="sub">Nella provincia di {esc(prov)} ci sono <b>{n} scuole superiori</b> tra licei, istituti tecnici e professionali. Trova la tua, scopri i suoi indirizzi e ripassa il programma con le flashcard AI di Cortex — gratis, senza registrarti.</p>
<a class="btn btn-p btn-xl" href="/scuola?utm_source=seo&utm_campaign=prov-{slug(prov)}">Trova la tua scuola →</a>

<h2>Indirizzi disponibili a {esc(prov)}</h2>
<div style="margin:10px 0 6px">{chips or '<span class="hint">Dati indirizzi non disponibili.</span>'}</div>

<h2>Elenco delle scuole superiori di {esc(prov)}</h2>
<div class="card"><ul class="schools">{rows}</ul></div>
<p class="hint">Fonte: anagrafe ufficiale MIUR (open data). Un istituto può includere più indirizzi.</p>

<h2>Come ripassare il programma</h2>
<ul class="tips">
<li><strong>Scegli la tua scuola e il tuo indirizzo</strong> nel <a href="/scuola" style="color:#c084fc">tool di Cortex</a>: vedi subito materie e argomenti.</li>
<li><strong>Flashcard AI dai tuoi appunti:</strong> carica una foto e Cortex genera le flashcard con ripetizione spaziata.</li>
<li><strong>Prepari anche il TOLC?</strong> Fai la <a href="/simulazione-tolc?sim=tolc" style="color:#c084fc">simulazione gratuita</a>, cronometrata come il test vero.</li>
</ul>

<h2>Domande frequenti</h2>
{faq_html}

<div class="cta"><h2>Trova la tua scuola a {esc(prov)}</h2><p>Il tuo indirizzo, le tue materie e le flashcard AI · gratis · senza registrarti</p><br>
<a class="btn btn-p btn-xl" href="/scuola?utm_source=seo&utm_campaign=prov-{slug(prov)}">Inizia gratis →</a></div>

</main>
{footer(regione, prov, prov_regione)}
{gls.FX}
</body>
</html>"""

def main():
    reg_index = json.loads((SC / "regioni.json").read_text(encoding="utf-8"))
    tot = 0
    for reg in reg_index:
        data = json.loads((SC / f"{reg['slug']}.json").read_text(encoding="utf-8"))
        province = sorted(data.keys())
        for prov in province:
            (OUT / f"scuole-superiori-{slug(prov)}.html").write_text(
                build(reg["nome"], prov, data[prov], province), encoding="utf-8")
            tot += 1
        print(f"OK  {reg['nome']}: {len(province)} province")
    print(f"\n{tot} landing provincia generate in {OUT}")

if __name__ == "__main__":
    main()
