# Cortex — Conformità Google Play (aggiornamento policy 15 luglio 2026)

**Cos'è:** la mail di Google Play era la newsletter generica sugli aggiornamenti policy, non un richiamo su Cortex. Nessuna emergenza. Qui sotto solo ciò che tocca Cortex, con le azioni pronte.

**Scadenze:** almeno 30 giorni dal 15/07/2026 per le policy aggiornate · **target API entro il 31 agosto 2026**.

---

## ✅ Già a posto (niente da fare)

- **Dati utente + AI di terze parti.** La privacy policy (`public/privacy.html`) dichiara già: uso di Google Gemini solo per elaborazione temporanea su richiesta esplicita, dati non usati per addestrare modelli pubblici, no vendita a terzi. Questo copre la "clarification" della policy. *(Opzionale: aggiornare la data "Ultimo aggiornamento" e aggiungere una riga "consenso esplicito prima del primo invio all'AI" per essere blindati — vedi in fondo.)*
- Non ti riguardano: chat anonime/random, permessi SMS/Call Log, prestiti/EWA, disclosure posizione (Cortex non usa la geolocalizzazione).

---

## ⚠️ Azioni TUE nel Play Console (io non posso: serve il tuo login)

### 1. Registrazione app / verifica sviluppatore  *(priorità alta — rischio rimozione)*
- Play Console → **Home** → sezione **Android Developer Verification** (oppure: play.google.com/console → Verifica sviluppatore).
- Controlla che **Cortex** risulti registrata. Il 99% è automatico, ma verifica: se manca, registrala. Se non lo fai, l'app rischia la rimozione globale.

### 2. Target API level (entro 31/08/2026)
- Cortex sul Play Store è una **PWA/TWA** (il wrapper Android non è nel repo, è generato — PWABuilder/Bubblewrap).
- Quando fai il prossimo build del wrapper, assicurati che punti all'ultimo **targetSdk richiesto** (Android 15 / API 35, salvo aggiornamenti). In PWABuilder: rigenera il pacchetto con la versione aggiornata. In Bubblewrap: `targetSdkVersion` in `twa-manifest.json`, poi `bubblewrap update` + build.
- Carica il nuovo `.aab` come nuova release prima della scadenza.

### 3. Content rating (niente app "unrated")
- Play Console → **Classificazione dei contenuti** → verifica che il questionario **IARC** sia compilato e il rating assegnato. Se già fatto, ok.

### 4. Sezione Data safety (deve combaciare con la privacy policy)
- Play Console → **Contenuti dell'app → Sicurezza dei dati**. Usa le risposte pronte qui sotto.

---

## 📋 Data safety — risposte pronte da incollare

**Raccogli o condividi dati utente?** → Sì.

**Crittografia in transito?** → Sì.
**L'utente può chiedere la cancellazione dei dati?** → Sì (dall'app: elimina account → rimozione da Firebase).

**Tipi di dati RACCOLTI:**

| Tipo | Raccolto | Condiviso | Perché | Facoltativo? |
|---|---|---|---|---|
| Email | Sì | No | Autenticazione (Google Sign-In) | Sì (solo con Cloud Sync) |
| Nome | Sì | No | Profilo | Sì |
| File e documenti (PDF, testi) | Sì | Sì (Gemini, solo elaborazione) | Generare flashcard | Sì |
| Registrazioni audio | Sì | Sì (Gemini, solo trascrizione) | Trascrizione lezioni | Sì (funzione opzionale) |
| Attività nell'app (flashcard, pomodori) | Sì | No | Statistiche personali | No |

**Condivisione con terzi (AI):** dichiara che i contenuti inviati a Google Gemini sono per **elaborazione temporanea** e non per addestrare modelli. (Google, in Data safety, chiede di indicare la condivisione anche se il provider è un "service provider" — meglio dichiararlo che ometterlo.)

**Finalità:** Funzionalità dell'app · Personalizzazione. **NO** advertising, **NO** vendita dati.

---

## ✍️ (Opzionale) Blindare la privacy policy sull'AI

Se vuoi essere a prova di revisore, aggiungo alla policy una riga tipo:
> "Prima del primo invio di contenuti all'IA, l'app richiede il tuo consenso esplicito. Puoi usare Cortex anche senza le funzioni AI. I provider AI (Google Gemini) elaborano i dati solo per la richiesta specifica e non li conservano né li usano per addestramento."

Dimmi e la inserisco in tutte le copie (`privacy.html`, `public/`, `dist/`) e ti preparo il deploy.

---

## 🤖 Chicca: skill Google per il controllo policy

Google ha rilasciato una skill open-source che fa valutare la conformità del codice al tuo AI assistant in IDE/CLI: `github.com/android/skills` → `play/play-policy-insights`. Utile per i check futuri.
