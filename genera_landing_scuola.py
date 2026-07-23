#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genera_landing_scuola.py — Genera una landing SEO per ogni indirizzo di scuola
superiore, con lo STESSO stile/colori delle landing TOLC (public/tolc-*.html).

Output: public/<slug>.html  (Vite li copia in dist automaticamente; cleanUrls →
/liceo-scientifico ecc.). Cross-linkate tra loro nel footer per la SEO.

Uso: python genera_landing_scuola.py
"""
import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "public"

ARG = {
  "Matematica":["Insiemi, logica e numeri","Equazioni e disequazioni","Geometria analitica (retta, parabola, circonferenza, ellisse, iperbole)","Funzioni e loro proprietà","Goniometria e trigonometria","Esponenziali e logaritmi","Limiti e continuità","Derivate e studio di funzione","Integrali","Probabilità e statistica"],
  "Fisica":["Grandezze fisiche e misure","Cinematica","Dinamica e leggi di Newton","Lavoro, energia e quantità di moto","Termodinamica","Onde, suono e ottica","Elettrostatica e campo elettrico","Corrente elettrica","Campo magnetico ed elettromagnetismo","Fisica moderna (relatività e quanti)"],
  "Italiano":["Le origini e il Duecento","Dante, Petrarca, Boccaccio","Umanesimo e Rinascimento","Barocco e Illuminismo","Foscolo, Leopardi, Manzoni","Verismo e Verga","Decadentismo: Pascoli e D'Annunzio","Svevo e Pirandello","Ungaretti, Montale, Quasimodo","Neorealismo e secondo Novecento"],
  "Latino":["Fonetica e morfologia (declinazioni, verbi)","Sintassi dei casi","Sintassi del periodo","Cesare e Cicerone","Catullo e la poesia lirica","Virgilio e l'epica","Orazio","Seneca e Tacito"],
  "Greco":["Alfabeto, fonetica e accenti","Morfologia (nome e verbo)","Sintassi del periodo","Omero e l'epica","Erodoto e Tucidide","Tragedia: Sofocle ed Euripide","Platone e la filosofia"],
  "Filosofia":["I presocratici","Socrate, Platone, Aristotele","Ellenismo e filosofia antica","Filosofia medievale (Agostino, Tommaso)","Rivoluzione scientifica e Cartesio","Empirismo e razionalismo","Kant","Hegel e l'idealismo","Schopenhauer, Kierkegaard, Marx","Nietzsche, Freud, Novecento"],
  "Storia":["Restaurazione e moti risorgimentali","Unità d'Italia","Seconda rivoluzione industriale","Imperialismo e Belle Époque","Prima guerra mondiale","Rivoluzione russa","Fascismo e Nazismo","Seconda guerra mondiale","Guerra fredda","Italia repubblicana"],
  "Scienze naturali":["Chimica: atomo e tavola periodica","Legami chimici e reazioni","La mole e la stechiometria","Acidi, basi e pH","Biologia: la cellula","Genetica ed ereditarietà","Evoluzione e classificazione","Corpo umano e apparati","Scienze della Terra: rocce e minerali","Tettonica delle placche"],
  "Inglese":["Grammar: tempi verbali","Condizionali e forma passiva","Reading comprehension","Shakespeare e il teatro","Romanticism","The Victorian Age","Modernism (Joyce, Woolf)","Writing e speaking"],
  "Informatica":["Algoritmi e pensiero computazionale","Programmazione (Python / C++)","Strutture dati","Basi di dati e SQL","Reti e Internet","Sistemi operativi","Sviluppo web (HTML, CSS, JS)"],
  "Sistemi e reti":["Architettura delle reti","Modello ISO/OSI e TCP/IP","Indirizzamento IP e subnetting","Routing e switching","Sicurezza di rete","Servizi e protocolli (DNS, HTTP, DHCP)"],
  "Telecomunicazioni":["Segnali analogici e digitali","Trasmissione dati","Modulazioni","Mezzi trasmissivi","Reti di telecomunicazione"],
  "TPSIT":["Sistemi distribuiti","Programmazione di rete (socket)","Architetture client-server","Servizi web e API","Sicurezza applicativa"],
  "Economia aziendale":["La partita doppia e la contabilità","Il bilancio d'esercizio","Analisi di bilancio per indici","Gestione e finanziamenti","Marketing e mercato","Calcolo e matematica finanziaria"],
  "Diritto":["Le fonti del diritto","La Costituzione italiana","Stato e ordinamento","Obbligazioni e contratti","Diritto commerciale e impresa"],
  "Economia politica":["Domanda, offerta e mercato","Il reddito nazionale (PIL)","Moneta e inflazione","Il ruolo dello Stato","Commercio internazionale"],
  "Diritto ed Economia":["Le regole e il diritto","La Costituzione","Stato, cittadino e diritti","Bisogni, beni e mercato","Il sistema economico"],
  "Scienze umane":["Psicologia: mente e comportamento","Pedagogia e storia dell'educazione","Sociologia: società e istituzioni","Antropologia culturale","Metodologia della ricerca"],
  "Storia dell'arte":["Arte greca e romana","Arte medievale","Il Rinascimento","Il Barocco","Neoclassicismo e Romanticismo","Impressionismo","Le avanguardie del Novecento"],
  "Lingua straniera 2":["Grammatica di base","Comprensione e produzione","Cultura e civiltà","Letteratura"],
  "Lingua straniera 3":["Grammatica di base","Comprensione e produzione","Cultura e civiltà"],
  "Scienze motorie":["Capacità motorie","Sport di squadra e individuali","Anatomia e benessere","Primo soccorso"]
}
EMO = {"Matematica":"📐","Fisica":"⚛️","Italiano":"📖","Latino":"🏛️","Greco":"🏺","Filosofia":"💭","Storia":"📜","Scienze naturali":"🧬","Inglese":"🇬🇧","Informatica":"💻","Sistemi e reti":"🌐","Telecomunicazioni":"📡","TPSIT":"🖧","Economia aziendale":"📊","Diritto":"⚖️","Economia politica":"💶","Diritto ed Economia":"⚖️","Scienze umane":"🧠","Storia dell'arte":"🎨","Lingua straniera 2":"🗣️","Lingua straniera 3":"🗣️","Scienze motorie":"🏃"}

INDIRIZZI = {
  "liceo-scientifico":{"nome":"Liceo Scientifico","emo":"🔬","ds":"Matematica, Fisica e Scienze","materie":["Italiano","Latino","Inglese","Storia","Filosofia","Matematica","Fisica","Scienze naturali","Storia dell'arte","Scienze motorie"],"intro":"Il Liceo Scientifico è l'indirizzo più scelto in Italia: unisce una solida formazione scientifica (Matematica, Fisica, Scienze) a una base umanistica completa. Qui trovi tutte le materie del percorso e il programma tipico, argomento per argomento."},
  "liceo-scienze-applicate":{"nome":"Liceo Scientifico Scienze Applicate","emo":"🧪","ds":"Scientifico + Informatica, senza Latino","materie":["Italiano","Inglese","Storia","Filosofia","Matematica","Fisica","Scienze naturali","Informatica","Storia dell'arte","Scienze motorie"],"intro":"L'opzione Scienze Applicate potenzia l'area scientifica e aggiunge Informatica al posto del Latino. Ideale per chi punta a Ingegneria, Informatica o percorsi tecnico-scientifici. Ecco materie e programma."},
  "liceo-classico":{"nome":"Liceo Classico","emo":"🏛️","ds":"Latino, Greco e cultura umanistica","materie":["Italiano","Latino","Greco","Inglese","Storia","Filosofia","Matematica","Fisica","Scienze naturali","Storia dell'arte","Scienze motorie"],"intro":"Il Liceo Classico forma al ragionamento e alla cultura umanistica attraverso Latino, Greco, Filosofia e Storia, senza trascurare l'area scientifica. Qui trovi il quadro completo delle materie e degli argomenti."},
  "liceo-linguistico":{"nome":"Liceo Linguistico","emo":"🌍","ds":"Tre lingue straniere","materie":["Italiano","Inglese","Lingua straniera 2","Lingua straniera 3","Storia","Filosofia","Matematica","Fisica","Scienze naturali","Storia dell'arte","Scienze motorie"],"intro":"Il Liceo Linguistico ti fa studiare tre lingue straniere con le rispettive culture e letterature, su una base umanistica e scientifica solida. Ecco tutte le materie e il programma tipico."},
  "liceo-scienze-umane":{"nome":"Liceo Scienze Umane","emo":"🧠","ds":"Psicologia, Pedagogia, Sociologia","materie":["Italiano","Latino","Inglese","Scienze umane","Storia","Filosofia","Diritto ed Economia","Matematica","Scienze naturali","Storia dell'arte","Scienze motorie"],"intro":"Il Liceo delle Scienze Umane approfondisce psicologia, pedagogia, sociologia e antropologia, perfetto per chi pensa a insegnamento, educazione o area sociale. Qui materie e argomenti del percorso."},
  "istituto-tecnico-informatica":{"nome":"Istituto Tecnico Informatica","emo":"💻","ds":"Informatica, Sistemi e reti","materie":["Italiano","Storia","Inglese","Matematica","Informatica","Sistemi e reti","Telecomunicazioni","TPSIT","Scienze motorie"],"intro":"L'Istituto Tecnico indirizzo Informatica e Telecomunicazioni forma alle competenze digitali: programmazione, reti, sistemi e sviluppo. Ecco le materie di indirizzo e gli argomenti chiave."},
  "istituto-tecnico-economico":{"nome":"Istituto Tecnico Economico (AFM)","emo":"📊","ds":"Economia, Diritto e Marketing","materie":["Italiano","Storia","Inglese","Lingua straniera 2","Matematica","Economia aziendale","Diritto","Economia politica","Informatica","Scienze motorie"],"intro":"L'Istituto Tecnico Economico (Amministrazione, Finanza e Marketing) forma alle competenze aziendali: contabilità, bilancio, diritto ed economia. Qui trovi materie e programma dell'indirizzo."},
}

def slug_mat(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')

CSS = """*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#030305;--accent:#a855f7;--accent2:#3b82f6;--text:#f8fafc;--muted:#94a3b8;--muted2:#64748b;--glass:rgba(255,255,255,0.03);--gborder:rgba(255,255,255,0.08)}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);line-height:1.65;overflow-x:hidden}
h1,h2,h3{font-family:'Outfit',sans-serif;letter-spacing:-0.03em}
a{text-decoration:none;color:inherit}
.container{max-width:860px;margin:0 auto;padding:0 24px}
.bg-mesh{position:fixed;inset:0;background:radial-gradient(ellipse at 15% 15%,rgba(168,85,247,0.10) 0%,transparent 55%),radial-gradient(ellipse at 85% 75%,rgba(59,130,246,0.09) 0%,transparent 55%),radial-gradient(ellipse at 50% 50%,rgba(124,58,237,0.04) 0%,transparent 70%),var(--bg);z-index:-2}
.orb{position:fixed;border-radius:50%;filter:blur(110px);z-index:-1;pointer-events:none}
.orb1{width:520px;height:520px;background:rgba(168,85,247,0.14);top:-180px;right:-160px}
.orb2{width:420px;height:420px;background:rgba(59,130,246,0.10);bottom:-140px;left:-140px}
header{position:sticky;top:0;z-index:50;background:rgba(3,3,5,0.72);backdrop-filter:blur(18px);border-bottom:1px solid var(--gborder)}
.hin{max-width:1140px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;justify-content:space-between}
.hlogo{display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-weight:800;font-size:1.15rem}
.hlogo img{width:34px;height:34px;border-radius:9px}
.hnav{display:flex;align-items:center;gap:22px;font-size:.92rem;color:var(--muted)}
.hnav a:hover{color:#fff}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:'Outfit',sans-serif;font-weight:800;border:none;cursor:pointer;border-radius:100px;transition:transform .15s,box-shadow .15s}
.btn-p{background:linear-gradient(135deg,var(--accent),#7c3aed);color:#fff;box-shadow:0 8px 30px rgba(168,85,247,0.35);padding:12px 26px;font-size:.95rem}
.btn-p:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 16px 48px rgba(168,85,247,0.55)}
.btn-xl{padding:18px 40px;font-size:1.1rem}
.crumb{font-size:.8rem;color:var(--muted2);margin:26px 0 8px}
.crumb a{color:var(--muted)}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.3);color:#c084fc;border-radius:50px;padding:6px 16px;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:18px}
h1{font-size:clamp(2rem,5.4vw,3rem);font-weight:900;line-height:1.12;margin-bottom:14px}
.grad{background:linear-gradient(120deg,#c084fc,#818cf8,#60a5fa);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sub{font-size:1.08rem;color:var(--muted);max-width:640px;margin-bottom:34px}
h2{font-size:1.5rem;font-weight:800;margin:44px 0 16px}
h3{font-size:1.08rem;font-weight:700;margin:20px 0 8px}
p{margin-bottom:14px;color:#d7dce3}
.card{background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--gborder);border-radius:20px;padding:24px 26px;margin:18px 0}
.matgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:16px 0}
.matgrid span{background:var(--glass);border:1px solid var(--gborder);border-radius:12px;padding:11px 14px;font-size:.92rem;display:flex;align-items:center;gap:8px}
details{background:var(--glass);border:1px solid var(--gborder);border-radius:16px;padding:16px 20px;margin:12px 0}
summary{cursor:pointer;font-weight:600;color:#e8e8ee;display:flex;align-items:center;gap:10px}
details ul{list-style:none;margin:14px 0 6px}
details li{padding:8px 12px;border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin:6px 0;font-size:.92rem;color:var(--muted)}
.mcta{display:inline-block;margin-top:10px;font-size:.85rem;color:#c084fc;font-weight:700}
.hint{font-size:.8rem;color:var(--muted2)}
.cta{position:relative;text-align:center;background:linear-gradient(135deg,rgba(168,85,247,0.14),rgba(59,130,246,0.10));border:1px solid rgba(168,85,247,0.3);border-radius:26px;padding:44px 28px;margin:52px 0 26px;overflow:hidden}
.cta h2{margin:0 0 10px}
.cta p{color:var(--muted)}
footer{border-top:1px solid var(--gborder);margin-top:70px;padding:44px 0 60px;font-size:.88rem}
.fgrid{max-width:1140px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:28px}
.fgrid h4{font-family:'Outfit',sans-serif;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted2);margin-bottom:12px}
.fgrid a{display:block;color:var(--muted);padding:3px 0}
.fgrid a:hover{color:#fff}
ul.tips{list-style:none}
ul.tips li{padding:10px 0 10px 34px;position:relative;color:#d7dce3}
ul.tips li::before{content:'⚡';position:absolute;left:4px}
@media(max-width:640px){.hnav .hidem{display:none}}"""

FX = """<style id="cortex-fx-style">
@keyframes cfxFloatUp{0%{transform:translateY(0);opacity:0}10%{opacity:.7}90%{opacity:.5}100%{transform:translateY(-110vh);opacity:0}}
@keyframes cfxOrb1{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,20px)}}
@keyframes cfxOrb2{0%,100%{transform:translate(0,0)}50%{transform:translate(-25px,-18px)}}
.cfx-particles{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.cfx-particles span{position:absolute;bottom:-10px;border-radius:50%;background:rgba(196,181,253,.55);animation:cfxFloatUp linear infinite}
.cfx-orb{position:fixed;border-radius:50%;pointer-events:none;z-index:-1;filter:blur(110px)}
.cfx-orb1{width:520px;height:520px;background:rgba(168,85,247,.13);top:-180px;right:-160px;animation:cfxOrb1 14s ease-in-out infinite}
.cfx-orb2{width:420px;height:420px;background:rgba(59,130,246,.10);bottom:-140px;left:-140px;animation:cfxOrb2 17s ease-in-out infinite}
.cfx-reveal{opacity:0;transform:translateY(16px);transition:opacity .7s ease,transform .7s ease}
.cfx-reveal.cfx-in{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){.cfx-particles,.cfx-orb{display:none}.cfx-reveal{opacity:1;transform:none;transition:none}}
</style>
<script id="cortex-fx">(function(){
  if(!document.querySelector('.orb,.cfx-orb')){var o1=document.createElement('div');o1.className='cfx-orb cfx-orb1';var o2=document.createElement('div');o2.className='cfx-orb cfx-orb2';document.body.appendChild(o1);document.body.appendChild(o2);}
  var wrap=document.createElement('div');wrap.className='cfx-particles';var n=window.innerWidth<768?16:32;
  for(var i=0;i<n;i++){var s=document.createElement('span');var sz=(Math.random()*3+1).toFixed(1);s.style.width=sz+'px';s.style.height=sz+'px';s.style.left=(Math.random()*100).toFixed(1)+'%';s.style.animationDelay=(Math.random()*20).toFixed(1)+'s';s.style.animationDuration=(Math.random()*15+12).toFixed(1)+'s';wrap.appendChild(s);}
  document.body.appendChild(wrap);
  var targets=document.querySelectorAll('main > *, .card, .cta, details');
  var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('cfx-in');io.unobserve(e.target);}});},{threshold:.08}):null;
  targets.forEach(function(el,i){el.classList.add('cfx-reveal');el.style.transitionDelay=Math.min(i%6*60,300)+'ms';if(io)io.observe(el);else el.classList.add('cfx-in');});
})();</script>"""

def footer_indirizzi():
    links = "".join('<a href="/%s">%s</a>' % (s, d["nome"]) for s, d in INDIRIZZI.items())
    return ('<footer><div class="fgrid">'
      '<div><h4>Indirizzi scuola</h4>' + links + '</div>'
      '<div><h4>TOLC & Guide</h4><a href="/simulazione-tolc?sim=tolc">Simulazione TOLC gratis</a><a href="/quale-tolc-scegliere">Quale TOLC scegliere</a><a href="/come-funziona-il-tolc">Come funziona il TOLC</a></div>'
      '<div><h4>Cortex</h4><a href="/">Home</a><a href="/scuola">Trova il tuo indirizzo</a><a href="/app">Apri l\'app</a><a href="/privacy">Privacy</a><a href="/terms">Termini</a></div>'
      '</div><p style="text-align:center;color:var(--muted2);margin-top:36px;font-size:.8rem">© 2026 Cortex — cortexapp.it · Programmi indicativi basati sulle indicazioni nazionali; ogni scuola può avere variazioni.</p></footer>')

def build_page(sl, d):
    materie = d["materie"]
    title = f'{d["nome"]}: materie, programma e ripasso | Cortex'
    desc = f'Tutte le materie del {d["nome"]} e il programma per argomenti. Ripassa con le flashcard AI di Cortex, gratis e senza registrarti.'
    url = f'https://cortexapp.it/{sl}'
    # blocchi materie (grid)
    matgrid = "".join('<span>%s %s</span>' % (EMO.get(m,'📘'), m) for m in materie)
    # accordion programma
    acc = ""
    for m in materie:
        args = ARG.get(m, [])
        if not args: continue
        lis = "".join('<li>%s</li>' % a for a in args)
        acc += ('<details><summary>%s %s</summary><ul>%s</ul>'
                '<a class="mcta" href="/app?guest=1&area=scuola&materia=%s&utm_source=seo&utm_campaign=%s">Studia %s con le flashcard AI →</a></details>'
                % (EMO.get(m,'📘'), m, "\n".join(args) and lis, slug_mat(m), sl, m))
    # FAQ + JSON-LD
    faqs = [
        (f'Quali materie si studiano al {d["nome"]}?', 'Le materie principali sono: ' + ', '.join(materie) + '. Il quadro esatto e le ore possono variare leggermente da scuola a scuola.'),
        (f'Quanti anni dura il {d["nome"]}?', 'Come tutte le scuole superiori, dura 5 anni: un primo biennio, un secondo biennio e un quinto anno finale con l\'Esame di Stato (Maturità).'),
        ('Come posso ripassare il programma?', 'Con Cortex carichi i tuoi appunti o una foto e l\'AI genera flashcard con ripetizione spaziata sugli argomenti dove sbagli di più. Puoi provarlo gratis, senza registrarti.'),
    ]
    faq_html = "".join('<details><summary>%s</summary><p style="margin-top:10px">%s</p></details>' % (q, a) for q, a in faqs)
    ld = {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]}

    html = f"""<!DOCTYPE html>
<html lang="it">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DFJ42477QK"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
var _nt=false;try{{if(new URLSearchParams(location.search).get('notrack')==='1')localStorage.setItem('cortex_no_track','1');_nt=localStorage.getItem('cortex_no_track')==='1';}}catch(e){{}}
if(!_nt){{gtag('js',new Date());gtag('config','G-DFJ42477QK');}}</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}"><meta property="og:type" content="article">
<meta property="og:image" content="https://cortexapp.it/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="bg-mesh"></div><div class="orb orb1"></div><div class="orb orb2"></div>
<header><div class="hin">
<a href="/" class="hlogo"><img src="/LOGO_PREMIUM.png" alt="Cortex">Cortex</a>
<nav class="hnav"><a href="/scuola" class="hidem">Indirizzi</a><a href="/simulazione-tolc?sim=tolc" class="hidem">TOLC</a><a href="/app?guest=1&area=scuola" class="btn btn-p" style="padding:10px 20px">Prova gratis</a></nav>
</div></header>
<main class="container">

<p class="crumb"><a href="/">Home</a> › <a href="/scuola">Scuola</a> › {d["nome"]}</p>
<div class="badge">{d["emo"]} {d["ds"]} · Aggiornato a luglio 2026</div>
<h1>{d["nome"]}: <span class="grad">materie e programma</span></h1>
<p class="sub">{d["intro"]}</p>
<a class="btn btn-p btn-xl" href="/scuola?utm_source=seo&utm_campaign={sl}">Trova le tue materie su Cortex →</a>

<h2>Le materie del {d["nome"]}</h2>
<div class="matgrid">{matgrid}</div>
<p class="hint">Le materie principali dell'indirizzo. Il quadro orario esatto può variare leggermente da scuola a scuola.</p>

<h2>Il programma, materia per materia</h2>
<p>Apri una materia per vedere gli argomenti tipici del programma — e generare le flashcard su quelli dove hai più difficoltà.</p>
{acc}

<h2>Come studiare al meglio</h2>
<ul class="tips">
<li><strong>Ripassa con le flashcard AI:</strong> carica appunti o una foto e Cortex crea flashcard con ripetizione spaziata sugli argomenti dove sbagli di più.</li>
<li><strong>Allenati con le simulazioni:</strong> mettiti alla prova su ogni materia e monitora i progressi.</li>
<li><strong>Prepara la Maturità:</strong> il programma del quinto anno è quello dell'Esame di Stato — inizia a ripassarlo con anticipo.</li>
</ul>

<h2>Domande frequenti</h2>
{faq_html}

<div class="cta"><h2>Inizia a studiare il {d["nome"]}</h2><p>Le tue materie, il programma e le flashcard AI · gratis · senza registrarti</p><br>
<a class="btn btn-p btn-xl" href="/scuola?utm_source=seo&utm_campaign={sl}">Entra in Cortex gratis →</a></div>

</main>
{footer_indirizzi()}
{FX}
</body>
</html>"""
    return html

def main():
    OUT.mkdir(exist_ok=True)
    for sl, d in INDIRIZZI.items():
        (OUT / f"{sl}.html").write_text(build_page(sl, d), encoding="utf-8")
        print(f"OK  public/{sl}.html")
    print(f"\n{len(INDIRIZZI)} landing generate in {OUT}")

if __name__ == "__main__":
    main()
