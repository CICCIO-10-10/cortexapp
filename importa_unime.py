#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
importa_unime.py — Estrae TUTTO il catalogo corsi UNIME dall'API CINECA.

Catena API (scoperta 22/07/2026):
  1) /api/v1/corsi?anno=AA&minimal=true                  -> albero aree/gruppi/corsi (154 corsi)
  2) /api/v1/corso/AA/{cod}                               -> codicione, sede_cod, ordinamento_aa, durata
  3) /api/v1/corso-offerta/{cod}?codicione&annoOrdinamento&sede -> insegnamenti (attivita)
  4) /api/v1/insegnamento?anno&insegnamento={adCod}&ordinamento_aa&corso_cod&schema_id -> testiTotali
     testiTotali[0]: obiettivi_formativi_it, contenuti_it, prerequisiti_it, verifica_apprendimento_it, testi_it

Output:
  public/unime/corsi.json              -> indice: aree + corsi (cod, codicione, tipo, gruppo)
  public/unime/corso/{cod}.json        -> corso + lista insegnamenti (con programma se --programma)

Resumable: salta i corso/{cod}.json già completi. Rate-limited.
Uso:
  python importa_unime.py               # livello 1: corsi + insegnamenti (veloce)
  python importa_unime.py --programma   # livello 2: aggiunge programma per ogni insegnamento (lento)
  python importa_unime.py --corso 10719 # solo un corso (test)
"""
import json, sys, time, urllib.request, urllib.error, re, os, ssl
from pathlib import Path

# Fallback SSL: su Windows Python spesso fallisce la verifica del certificato
# ("CERTIFICATE_VERIFY_FAILED"). Se la richiesta normale fallisce, riproviamo
# con un contesto SSL non verificato (dati pubblici, nessun rischio).
try:
    _CTX_INSECURE = ssl._create_unverified_context()
except Exception:
    _CTX_INSECURE = None

AA = "2026"
BASE = "https://unime.coursecatalogue.cineca.it/api/v1"
OUT = Path(__file__).parent / "public" / "unime"
OUT_CORSO = OUT / "corso"
HDRS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json", "Accept-Language": "it-IT,it;q=0.9"}
SLEEP = 0.12  # gentile con il server

WANT_PROGRAMMA = "--programma" in sys.argv
FORCE = "--force" in sys.argv  # rigenera anche i corsi gia' presenti (ignora il resume)
ONLY_CORSO = None
if "--corso" in sys.argv:
    ONLY_CORSO = sys.argv[sys.argv.index("--corso") + 1]


_last_err = None

def get(url, retries=5):
    global _last_err
    contexts = [None] + ([_CTX_INSECURE] if _CTX_INSECURE is not None else [])
    for a in range(retries):
        for ctx in contexts:  # prima verifica SSL normale, poi fallback non verificato
            try:
                req = urllib.request.Request(url, headers=HDRS)
                with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
                    return json.loads(r.read().decode("utf-8", "ignore"))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                _last_err = f"HTTP {e.code}"
            except Exception as e:
                _last_err = f"{type(e).__name__}: {e}"
        time.sleep(1.0 * (a + 1))
    return None


def clean(html):
    if not html:
        return ""
    t = re.sub(r"<[^>]+>", " ", str(html))
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&egrave;", "è").replace("&agrave;", "à")
    return " ".join(t.split()).strip()


def estrai_programma(corso_aa, adCod, ordinamento_aa, corso_cod, schema_id):
    """Livello 2: testiTotali di un insegnamento."""
    url = (f"{BASE}/insegnamento?anno={corso_aa}&insegnamento={adCod}"
           f"&ordinamento_aa={ordinamento_aa}&corso_cod={corso_cod}&schema_id={schema_id}")
    d = get(url)
    if not d:
        return {}
    d0 = d[0] if isinstance(d, list) and d else d
    if not isinstance(d0, dict):
        return {}
    tt = d0.get("testiTotali") or []
    t = tt[0] if tt else {}
    return {
        "ssd": d0.get("ssd", ""),
        "obiettivi": clean(t.get("obiettivi_formativi_it")),
        "contenuti": clean(t.get("contenuti_it")),
        "prerequisiti": clean(t.get("prerequisiti_it")),
        "verifica": clean(t.get("verifica_apprendimento_it")),
        "metodi": clean(t.get("metodi_didattici_est_it") or d0.get("metodi_didattici_it")),
        "testi": clean(t.get("testi_it")),
    }


def slug_docenti(att):
    out = []
    for d in (att.get("docenti") or []):
        n = (d.get("des") or "").strip()
        if n and n not in out:
            out.append(n)
    return out


def main():
    OUT_CORSO.mkdir(parents=True, exist_ok=True)

    # --- livello 0: albero corsi ---
    print("[1/3] Scarico albero corsi...")
    tree = get(f"{BASE}/corsi?anno={AA}&minimal=true")
    if not tree:
        print(f"ERRORE: albero corsi non raggiungibile. Ultimo errore: {_last_err}")
        print("  -> Controlla la connessione internet e riprova (rilancia il .bat).")
        sys.exit(1)  # esce con codice 1 cosi' il .bat si ferma davvero
    corsi_idx = []
    for area in tree:
        for sg in area.get("subgroups", []):
            for cds in sg.get("cds", []):
                for sub in cds.get("cdsSub", []):
                    corsi_idx.append({
                        "cod": sub["cod"], "cdsCod": sub.get("cdsCod", ""),
                        "nome": sub.get("des_it", ""),
                        "area_cod": sub.get("area_cod", ""), "area": sub.get("area_des_it", ""),
                        "gruppo": sub.get("gruppo_des_it", ""),  # Triennale / Magistrale...
                        "tipo": sub.get("tipo_corso_des_it", ""),
                        "sede": sub.get("sede_des_it", ""), "lingua": sub.get("lingua_des_it", ""),
                    })
    print(f"      {len(corsi_idx)} corsi trovati.")

    if ONLY_CORSO:
        corsi_idx = [c for c in corsi_idx if c["cod"] == ONLY_CORSO]

    # --- livello 1+2: per ogni corso ---
    done, skip, ins_tot = 0, 0, 0
    for i, c in enumerate(corsi_idx, 1):
        cod = c["cod"]
        fp = OUT_CORSO / f"{cod}.json"
        # resume: salta se già fatto (e se richiediamo programma, che sia già arricchito)
        if fp.exists() and not FORCE:
            try:
                prev = json.loads(fp.read_text(encoding="utf-8"))
                ok_v = prev.get("_v", 0) >= 3   # 3 = dedup + programma ricco (obiettivi/contenuti/testi) A.A. 2026/2027
                has_prog = any(ins.get("contenuti") or ins.get("obiettivi") for ins in prev.get("insegnamenti", []))
                if ok_v and ((not WANT_PROGRAMMA) or has_prog):
                    skip += 1; ins_tot += len(prev.get("insegnamenti", []))
                    continue
            except Exception:
                pass

        det = get(f"{BASE}/corso/{AA}/{cod}")
        det0 = det[0] if isinstance(det, list) and det else (det or {})
        codicione = det0.get("codicione", "")
        sede_cod = det0.get("sede_cod", "1036")
        ord_aa = det0.get("ordinamento_aa", AA)

        offerta = get(f"{BASE}/corso-offerta/{cod}?codicione={codicione}&annoOrdinamento={ord_aa}&sede={sede_cod}")
        # 1) raccogli tutte le attivita (grezze)
        raw = []
        if isinstance(offerta, dict):
            for anno_key, periodi in offerta.items():
                if not isinstance(periodi, dict):
                    continue
                for _, blocco in periodi.items():
                    for att in (blocco.get("attivita") or []):
                        if att.get("adCod") or att.get("cod"):
                            raw.append(att)
        # 2) scegli il percorso principale = quello con piu' insegnamenti in italiano
        #    (i corsi bilingue elencano lo stesso esame in IT e EN sotto percorsi diversi)
        perc_ita, perc_tot = {}, {}
        for att in raw:
            pc = att.get("corso_percorso_cod") or ""
            perc_tot[pc] = perc_tot.get(pc, 0) + 1
            if att.get("lingua_cod") == "ita":
                perc_ita[pc] = perc_ita.get(pc, 0) + 1
        best = sorted(perc_tot, key=lambda p: (perc_ita.get(p, 0), perc_tot[p]))[-1] if perc_tot else None
        # 3) costruisci gli insegnamenti solo dal percorso principale (+ quelli senza percorso)
        insegnamenti, seen = [], set()
        for att in raw:
            pc = att.get("corso_percorso_cod") or ""
            if best is not None and pc and pc != best:
                continue
            adCod = att.get("adCod") or att.get("cod")
            nome_ins = (att.get("des_it") or "").strip()
            if nome_ins.upper() in ("DEBITO OFA", "OFA", "DEBITI OFA", "DEBITO FORMATIVO AGGIUNTIVO"):
                continue  # non e' un esame, e' un debito formativo
            key = (adCod, att.get("annoCorso"))
            if key in seen:
                continue
            seen.add(key)
            rec = {
                "adCod": adCod, "nome": att.get("des_it", ""),
                "cfu": att.get("crediti"), "ore": att.get("ore"),
                "annoCorso": att.get("annoCorso"),
                "periodo": att.get("periodo_didattico_it") or "",
                "tipo": att.get("tipo_ins_des_it", ""),
                "lingua": att.get("lingua_des_it", ""),
                "docenti": slug_docenti(att),
                "schemaId": att.get("schemaId"),
                "corso_aa": att.get("annoCoorte", ord_aa),
                "ordinamento_aa": att.get("ordinamento_aa", ord_aa),
            }
            if WANT_PROGRAMMA and rec["schemaId"]:
                prog = estrai_programma(rec["corso_aa"], adCod, rec["ordinamento_aa"], cod, rec["schemaId"])
                rec.update(prog)
                time.sleep(SLEEP)
            insegnamenti.append(rec)
        insegnamenti.sort(key=lambda x: (x.get("annoCorso") or 9, x.get("nome") or ""))

        out = {**c, "_v": 3, "aa_label": "2026/2027", "codicione": codicione, "sede_cod": sede_cod,
               "durata": det0.get("durata_it", ""), "crediti": det0.get("crediti_it", ""),
               "n_insegnamenti": len(insegnamenti), "insegnamenti": insegnamenti}
        fp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        done += 1; ins_tot += len(insegnamenti)
        print(f"  [{i}/{len(corsi_idx)}] {cod} {c['gruppo'][:4]:4} {c['nome'][:44]:44} -> {len(insegnamenti)} ins")
        time.sleep(SLEEP)

    # indice finale — SOLO su run completo (con --corso NON sovrascrivere l'indice!)
    if not ONLY_CORSO:
        (OUT / "corsi.json").write_text(json.dumps({
            "ateneo": "UNIME", "aa": AA, "n_corsi": len(corsi_idx),
            "corsi": corsi_idx,
        }, ensure_ascii=False), encoding="utf-8")

    print(f"\nFATTO. corsi nuovi:{done} saltati:{skip} | insegnamenti totali:{ins_tot}")
    print(f"Output in {OUT}")


if __name__ == "__main__":
    main()
