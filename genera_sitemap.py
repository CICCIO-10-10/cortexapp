#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genera_sitemap.py — Crea public/sitemap.xml con tutte le pagine indicizzabili
(core + guide + TOLC + indirizzi + 107 province) e public/robots.txt che la
referenzia. Vite copia public/ in dist → servite su cortexapp.it/sitemap.xml.

Uso: python genera_sitemap.py   (dopo aver generato le landing)
"""
import glob
from pathlib import Path
from datetime import date

BASE = Path(__file__).resolve().parent
OUT  = BASE / "public"
DOMAIN = "https://cortexapp.it"
TODAY = date.today().isoformat()

# Route servite dai file in root (Vite inputs), non in public/
CORE = [("/", "1.0"), ("/home", "0.9"), ("/scuola", "0.9"), ("/unime", "0.9"), ("/simulazione-tolc", "0.9")]

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
        if name in EXCLUDE:
            continue
        urls.append(("/" + name, priority(name)))   # cleanUrls: /pagina

    body = "\n".join(
        f'  <url><loc>{DOMAIN}{loc}</loc><lastmod>{TODAY}</lastmod>'
        f'<changefreq>weekly</changefreq><priority>{prio}</priority></url>'
        for loc, prio in urls)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + body + '\n</urlset>\n')
    (OUT / "sitemap.xml").write_text(xml, encoding="utf-8")

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

    print(f"OK — sitemap.xml con {len(urls)} URL → {OUT/'sitemap.xml'}")

if __name__ == "__main__":
    main()
