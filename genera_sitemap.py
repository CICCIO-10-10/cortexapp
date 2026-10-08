#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genera_sitemap.py — Crea public/sitemap.xml con tutte le pagine indicizzabili
(core + guide + TOLC + indirizzi + 107 province) e public/robots.txt che la
referenzia. Vite copia public/ in dist → servite su cortexapp.it/sitemap.xml.

Uso: python genera_sitemap.py   (dopo aver generato le landing)
"""
import glob, re, json, hashlib, subprocess
from pathlib import Path
from datetime import date

BASE = Path(__file__).resolve().parent
OUT  = BASE / "public"
DOMAIN = "https://cortexapp.it"
TODAY = date.today().isoformat()

# Route servite dai file in root (Vite inputs), non in public/
CORE = [("/", "1.0"), ("/home", "0.9"), ("/scuola", "0.9"), ("/unime", "0.9"), ("/simulazione-tolc", "0.9")]

# 08/10/2026: <lastmod> vero per ogni pagina (prima era la data del giorno uguale per tutte,
# e la sitemap non veniva rigenerata quando si pubblicava → ferma al 25/09 anche per pagine cambiate).
# Si tiene l'impronta (sha256) di ogni file: se il contenuto cambia, lastmod = oggi; altrimenti resta
# la data salvata. Funziona anche con modifiche non ancora committate.
LASTMOD_DB = BASE / "scripts" / "sitemap_lastmod.json"
CORE_FILES = {"/": "index.html", "/home": "home.html", "/scuola": "scuola.html",
              "/unime": "unime.html", "/simulazione-tolc": "simulazione-tolc.html"}

def _git_date(path):
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)], cwd=BASE,
                             capture_output=True, text=True, timeout=20).stdout.strip()
        return out or None
    except Exception:
        return None

def lastmod_for(loc, path, db):
    if not path or not path.exists():
        return TODAY
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    key = loc
    old = db.get(key)
    if old and old.get("sha") == sha:
        return old["date"]
    # prima volta: data dell'ultimo commit del file (se il contenuto è quello committato)
    d = TODAY
    if not old:
        g = _git_date(path)
        try:
            committed = subprocess.run(["git", "show", "HEAD:" + path.relative_to(BASE).as_posix()], cwd=BASE,
                                       capture_output=True, timeout=20).stdout
        except Exception:
            committed = b""
        if g and hashlib.sha256(committed).hexdigest() == sha:
            d = g
    db[key] = {"sha": sha, "date": d}
    return d

# File in public/ da NON mettere in sitemap
EXCLUDE = {"admin-tiktok", "oauth-callback", "firebase-messaging-sw", "404", "500", "sitemap"}

def priority(name):
    if name.startswith("scuole-superiori-"): return "0.6"
    if name.endswith("-messina"): return "0.7"  # landing corso UNIME
    if name.startswith(("tolc-", "liceo-", "istituto-")): return "0.8"
    if name in ("privacy", "terms"): return "0.3"
    return "0.7"  # guide TOLC, demo, confronti...

def main():
    urls = list(CORE)
    for f in sorted(glob.glob(str(OUT / "*.html"))):
        name = Path(f).stem
        if name in EXCLUDE or name.startswith("google"):  # file di verifica Search Console
            continue
        if name.startswith("scuole-superiori-"):
            continue  # pagine-provincia: noindex, fuori dalla sitemap
        # 25/09/2026: in sitemap SOLO pagine canoniche (le copie di sede Siracusa/Noto
        # puntano col canonical alla versione di Messina) e niente pagine noindex.
        try:
            _h = Path(f).read_text(encoding="utf-8", errors="ignore")[:20000]
            _m = re.search(r'rel="canonical" href="([^"]+)"', _h)
            if _m and _m.group(1).rstrip("/") != f"{DOMAIN}/{name}":
                continue
            if re.search(r'<meta[^>]+name="robots"[^>]+noindex', _h, re.I):
                continue
        except Exception:
            pass
        urls.append(("/" + name, priority(name)))   # cleanUrls: /pagina

    try:
        db = json.loads(LASTMOD_DB.read_text(encoding="utf-8"))
    except Exception:
        db = {}
    def _path(loc):
        return BASE / CORE_FILES[loc] if loc in CORE_FILES else OUT / (loc.lstrip("/") + ".html")
    mods = {loc: lastmod_for(loc, _path(loc), db) for loc, _ in urls}
    db = {k: v for k, v in db.items() if k in mods}
    LASTMOD_DB.write_text(json.dumps(db, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    body = "\n".join(
        f'  <url><loc>{DOMAIN}{loc}</loc><lastmod>{mods[loc]}</lastmod>'
        f'<changefreq>weekly</changefreq><priority>{prio}</priority></url>'
        for loc, prio in urls)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + body + '\n</urlset>\n')
    (OUT / "sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")   # LF anche su Windows

    robots = OUT / "robots.txt"
    if not robots.exists():
        robots.write_text(
            "User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /oauth-callback\n"
            f"\nSitemap: {DOMAIN}/sitemap.xml\n", encoding="utf-8")
        print("robots.txt creato.")
    else:
        txt = robots.read_text(encoding="utf-8")
        if "sitemap.xml" not in txt.lower():
            robots.write_text(txt.rstrip() + f"\n\nSitemap: {DOMAIN}/sitemap.xml\n", encoding="utf-8")
            print("robots.txt aggiornato con la Sitemap.")

    nuove = sum(1 for d in mods.values() if d == TODAY)
    print(f"OK — sitemap.xml con {len(urls)} URL ({nuove} cambiate oggi) → {OUT/'sitemap.xml'}")

if __name__ == "__main__":
    main()
