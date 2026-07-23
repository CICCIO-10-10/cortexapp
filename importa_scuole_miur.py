#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
importa_scuole_miur.py — Trasforma l'anagrafe ufficiale MIUR (open data) nel
formato che usa la pagina Scuola: un file JSON per regione con le scuole
SUPERIORI (secondaria di II grado), raggruppate per provincia, con sito web.

COME USARLO (una tantum):
1. Vai su https://dati.istruzione.it  → sezione "Scuole" → "Informazioni anagrafiche"
   Scarica i CSV: "Scuole statali" + "Scuole paritarie" (anno corrente).
2. Metti i .csv scaricati nella cartella  scuole_csv/  (accanto a questo script).
3. Lancia:  python importa_scuole_miur.py
   → genera public/scuole/<regione>.json  +  public/scuole/regioni.json

Robusto ai nomi colonna standard MIUR (case-insensitive) e al separatore ; o ,.
"""
import csv, json, re, glob, io
from pathlib import Path

BASE = Path(__file__).resolve().parent
IN_DIR = BASE / "scuole_csv"
OUT_DIR = BASE / "public" / "scuole"

# Normalizza i nomi regione MIUR ai nomi usati dalla pagina scuola.html
_REGMAP = {
    "friuli venezia giulia": "Friuli-Venezia Giulia", "friuli-venezia g.": "Friuli-Venezia Giulia",
    "friuli-venezia giulia": "Friuli-Venezia Giulia",
    "emilia romagna": "Emilia-Romagna",
    "valle d'aosta": "Valle d'Aosta", "valle d`aosta": "Valle d'Aosta", "valle daosta": "Valle d'Aosta",
    "trentino alto adige": "Trentino-Alto Adige", "trentino-alto adige": "Trentino-Alto Adige",
}

# Colonne MIUR (varianti tollerate, minuscolo/senza spazi per il match)
def col(row, *names):
    keys = {re.sub(r'[^a-z0-9]', '', k.lower()): v for k, v in row.items() if k}
    for n in names:
        k = re.sub(r'[^a-z0-9]', '', n.lower())
        if k in keys and keys[k] not in (None, "", "-"):
            return keys[k].strip()
    return ""

def slug(s):
    s = s.lower()
    s = (s.replace("à","a").replace("è","e").replace("é","e").replace("ì","i")
           .replace("ò","o").replace("ù","u"))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def read_csv_any(path):
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "latin-1"):
        try:
            text = raw.decode(enc); break
        except Exception:
            continue
    sample = text[:2000]
    delim = ';' if sample.count(';') >= sample.count(',') else ','
    return csv.DictReader(io.StringIO(text), delimiter=delim)

_SUP = ("LICEO","ISTITUTO TECNICO","IST TEC","ISTITUTO PROFESSIONALE","IST PROF",
        "ISTITUTO SUPERIORE","ISTITUTO MAGISTRALE","ISTITUTO D'ARTE","SCIENTIFICO",
        "CLASSICO","LINGUISTICO","ARTISTICO","SECONDARIA II GRADO","SECONDARIA DI II GRADO",
        "ISTRUZIONE SUPERIORE","CONVITTO")
_NON = ("INFANZIA","PRIMARIA","PRIMO GRADO","COMPRENSIVO","CENTRO","DIREZIONE DIDATTICA")
def is_superiore(row):
    g = col(row, "DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA", "descrizionegradoistruzione", "gradoistruzione").upper()
    if not g or any(n in g for n in _NON):
        return False
    return any(s in g for s in _SUP)

def map_indirizzo(tip):
    """MIUR tipologia grado -> (label indirizzo, chiave materie Cortex o None)."""
    t = (tip or "").upper()
    if "SCIENZE APPLICATE" in t: return ("Scientifico · Scienze Applicate", "applicate")
    if "SCIENTIFICO" in t:       return ("Liceo Scientifico", "scientifico")
    if "CLASSICO" in t:          return ("Liceo Classico", "classico")
    if "LINGUISTICO" in t:       return ("Liceo Linguistico", "linguistico")
    if "SCIENZE UMANE" in t:     return ("Liceo Scienze Umane", "umane")
    if "ARTISTICO" in t:         return ("Liceo Artistico", None)
    if "MUSICALE" in t or "COREUTICO" in t: return ("Liceo Musicale e Coreutico", None)
    if "TECNICO" in t and ("INFORMAT" in t or "TECNOLOG" in t): return ("Tecnico · Informatica/Tecnologico", "informatica")
    if "TECNICO" in t and ("COMMERC" in t or "ECONOMIC" in t or "AMMINISTR" in t or "AZIENDAL" in t or "TURISM" in t): return ("Tecnico · Economico (AFM)", "afm")
    if "GEOMETR" in t or "COSTRUZ" in t: return ("Tecnico · Costruzioni (CAT)", None)
    if "TECNICO" in t:           return ("Istituto Tecnico", None)
    if "ALBERGH" in t or "RISTORAZ" in t or "ENOGASTR" in t: return ("Professionale · Alberghiero", None)
    if "PROF" in t:              return ("Istituto Professionale", None)
    if "MAGISTRAL" in t:         return ("Istituto Magistrale", None)
    return None  # ISTITUTO SUPERIORE / CONVITTO / contenitore: non è un indirizzo


def main():
    files = glob.glob(str(IN_DIR / "*.csv"))
    if not files:
        print(f"⚠  Nessun CSV in {IN_DIR}. Scarica i file MIUR e mettili lì (vedi istruzioni nel file).")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    scuole = {}   # key istituto -> dati + indirizzi
    for f in files:
        for row in read_csv_any(f):
            if not is_superiore(row):
                continue
            reg_raw   = col(row, "REGIONE", "descrizioneregione").title()
            regione   = _REGMAP.get(reg_raw.lower(), reg_raw)
            provincia = col(row, "PROVINCIA", "descrizioneprovincia").title()
            cod_ist   = col(row, "CODICEISTITUTORIFERIMENTO", "codicescuola")
            nome      = col(row, "DENOMINAZIONEISTITUTORIFERIMENTO", "DENOMINAZIONESCUOLA")
            comune    = col(row, "DESCRIZIONECOMUNE", "descrizionecomunescuola").title()
            sito      = col(row, "SITOWEBSCUOLA", "sitoweb")
            tip       = col(row, "DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA")
            if not (regione and provincia and nome):
                continue
            if sito:
                low = sito.lower()
                if low.startswith("https//"): sito = "https://" + sito[7:]
                elif low.startswith("http//"): sito = "http://" + sito[6:]
                elif not low.startswith("http"): sito = "https://" + sito
            key = cod_ist or (nome + comune)
            s = scuole.get(key)
            if not s:
                s = scuole[key] = {"regione": regione, "provincia": provincia,
                    "nome": re.sub(r'\s+', ' ', nome.replace('"', ' ')).strip().title(),
                    "comune": comune, "sito": sito, "ind": {}}
            if sito and not s["sito"]:
                s["sito"] = sito
            mi = map_indirizzo(tip)
            if mi:
                s["ind"][mi[0]] = mi   # dedup per label

    per_regione = {}
    for s in scuole.values():
        inds = [{"label": l, "key": k} for (l, k) in sorted(s["ind"].values(), key=lambda x: x[0])]
        per_regione.setdefault(s["regione"], {}).setdefault(s["provincia"], []).append(
            {"nome": s["nome"], "comune": s["comune"], "sito": s["sito"], "indirizzi": inds})

    regioni_index = []
    tot = 0
    for regione, province in sorted(per_regione.items()):
        for p in province:
            province[p].sort(key=lambda s: s["nome"])
        out = {p: province[p] for p in sorted(province)}
        (OUT_DIR / f"{slug(regione)}.json").write_text(
            json.dumps(out, ensure_ascii=False), encoding="utf-8")
        n = sum(len(v) for v in out.values()); tot += n
        regioni_index.append({"nome": regione, "slug": slug(regione), "scuole": n})
        print(f"OK  {regione}: {n} scuole in {len(out)} province")

    (OUT_DIR / "regioni.json").write_text(
        json.dumps(sorted(regioni_index, key=lambda r: r["nome"]), ensure_ascii=False), encoding="utf-8")
    print(f"\nTotale: {tot} scuole superiori · {len(regioni_index)} regioni → {OUT_DIR}")

if __name__ == "__main__":
    main()
