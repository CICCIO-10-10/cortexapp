# 🧠 CORTEX — Master Strategic Plan (2026)

> **Documento Unificato: Vision, Audit, Competizione & Monetizzazione.**  
> *Ultimo aggiornamento: 02 Aprile 2026*

---

## 🏛️ 1. Identità & Posizionamento Strategico
Cortex non è un'applicazione di flashcard "standard". È un **Sistema Operativo Metacognitivo (Learning OS)**. Mentre la concorrenza si concentra sul *Cosa* studiare, Cortex allena il **Come** studiare (metodologia, tecniche avanzate, trigger psicologici).

| Settore | **Descrizione della Vision** |
| :--- | :--- |
| **Ruolo** | Da tool di studio a **Personal Trainer Cognitivo** autonomo. |
| **Potenziale** | Diventare lo standard per la certificazione delle competenze neurali (Social Proof). |
| **Obiettivo** | Sfondare la "illusione di competenza" tramite Active Recall e Boss Mode. |

---

## 📋 2. Inventario delle Feature (Cosa c'è già)

### 🔬 Onboarding & Diagnostica
- [x] **Diagnostica Neurale Adattiva:** 10 domande dinamiche con branching LLM.
- [x] **Dashboard Neurale:** Pentagono (Radar Chart) con etichette psicologiche variabili.
- [x] **Badge Percentili:** Animazione a pillola per descrivere i punteggi esatti.
- [x] **Generazione Aura Plan:** Piano di studio coach-driven in tempo reale.

### 📚 Materiali & Studio
- [x] **Mazzi & Flashcard:** Creazione da PDF, Foto, Audio, YouTube e Scraping via Gemini.
- [x] **Algoritmo SRS:** Spaced Repetition ottimizzato per la memoria a lungo termine.
- [x] **Valutazione AI:** Correzione e feedback su risposte testuali aperte.

### 💡 Tecniche & Interattività
- [x] **11 Tecniche Spiegate:** Guide consultabili da Feynman alle Mind Map.
- [x] **Coaching AI:** Chatbot LLM focalizzato su specifiche tecniche di studio.
- [x] **Mnemotecniche:** Palazzo della memoria (Loci) visuale e PAO Generator.

### 🎮 Gamification & Social
- [x] **Gamification Classica:** XP, Livelli, Streak giornaliera, Badge.
- [x] **Boss Mode:** Sfide a tempo per l'iper-focus.
- [x] **Global Community:** Condivisione mazzi via link e classifiche centralizzate.

---

## 🔍 3. Audit dello Stato Attuale (Health Check)

| Area | Stato | Note / Rischi Critici |
| :--- | :--- | :--- |
| **Autenticazione**| ✅ Solida | Google Login + Guest Mode Firebase perfetti. |
| **Materiali/IA** | ✅ Solida | L'OCR e le trascrizioni Gemini sono killer feature. |
| **Scalabilità** | 🚨 Critico | **Firestore 1MB limit:** I mazzi devono essere in sub-collection. |
| **Sicurezza** | 🚨 Critico | `firestore.rules` permettono scrittura libera su Feedback (Spam). |
| **Costi IA** | ⚠️ Rischio | "Pro: Infinity" rischioso; implementare Soft Cap/Energia. |
| **UX/Polish** | ⚠️ Debole | Mancano animazioni "Premium" e fluidità nelle celebrazioni. |

---

## ⚔️ 4. Analisi di Mercato (SWOT & Competitor)

### Competitor principali:
*   **Astra AI:** Ottimo tutor "reattivo" (scatta e risolvi), ma privo di metodo a lungo termine.
*   **Kiwinote / Kiwi AI:** Eccelle nella digestione di contenuti passivi, meno nell'Active Recall.

### Analisi SWOT Cortex:
*   **Strengths:** Palazzo della Memoria visuale, Boss Mode, approccio olistico al metodo.
*   **Weaknesses:** Friction di ingresso (richiede impegno mentale), polish visivo migliorabile.
*   **Opportunities:** **Memory Bank (Vertex AI)** per un coach proattivo, **Cortex Classroom (B2B)**.
*   **Threats:** Marketing di massa dei competitor basato sul "risultato zero sforzo".

---

## 💡 5. Roadmap Sviluppi Futuri (Priorità)

### Fase 1: Hardening & Scalability (Settimana 1-2)
- [ ] **Refactoring Firestore:** Spostamento `decks` in sub-collections per scalabilità infinita.
- [ ] **Fix Security Rules:** Protezione della collezione `feedback` da injection.
- [ ] **IA Safety:** Implementazione tracking "Plan" nel Proxy IA per protezione costi.

### Fase 2: Retention & Social (Settimana 3-5)
- [ ] **🎙️ Neural Podcasts:** Trasformazione mazzi in dialoghi audio (TTS) per ripasso passivo.
- [ ] **⚔️ Neural Duels:** Sfide 1v1 in tempo reale con domande AI basate sui mazzi condivisi.
- [ ] **🕸️ Visual Knowledge Graph:** Mappa 3D dei concetti collegati tra i vari mazzi dell'utente.

---

## 💰 6. Modello di Monetizzazione Consolidato

1.  **🥉 Piano Free:** 5 creazioni AI/giorno, 3 mazzi attivi, Community in lettura.
2.  **⚡ Neural Sparks (Micro-transazioni):** Acquisto di "Energia IA" una tantum per generazioni massive (es. 500 pagine in un click).
3.  **🥈 Cortex Pro (Sub €4.99/mese):** Queries illimitate (Soft-cap), Memory Bank attiva, Multimodalità totale.
4.  **🥇 Verified Marketplace:** Commissione 30% sui mazzi premium venduti da tutor o professori famosi.
5.  **🏫 Licenze Classroom (B2B):** Tool per docenti che vogliono monitorare i progressi cognitivi di intere classi.

---

> **Conclusione Strategica:** Astra AI è un *Tutor*. Kiwinote è un *Segretario*. **Cortex è un Personal Trainer Cognitivo.**  
> Il mercato dei Trainer è più fedele e disposto a pagare abbonamenti ricorrenti se i risultati (Miglioramento Memoria/Metodo) sono tangibili.
