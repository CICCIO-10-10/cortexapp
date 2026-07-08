# 🧠 Cortex: AI-Ready Project Map (v9.34)

This document is designed for AI coding assistants to quickly understand the architecture, logic flow, and optimization status of the Cortex PWA.

## 🚀 Overview
Cortex is a specialized **Second Brain PWA** for students, combining AI features (Gemini), Spaced Repetition (SRS), and world-class mnemonics (Palace of Memory, Feynman, etc.).

## 🏗️ Architecture & Core Files
- **`index.html`**: The UI Shell. Uses a single-page architecture with hidden/visible section "pages".
- **`main.js`**: The Brain. Contains:
    - `state`: Central reactive-like state management.
    - `initFirebase()`: Cloud sync & Auth listener.
    - `handleAudioFile()`: Complex pipeline for transcription and AI processing.
    - `renderDecks()`: Core UI rendering loop for SRS.
- **`styles.css`**: Design System. Optimized for Glassmorphism on Desktop and **Ultra-Performance (Solid Colors)** on Mobile.
- **`service-worker.js`**: Handles offline mode and aggressive caching (currently v25).

## ⚡ Performance Optimization (Historical Context)
As of **v9.29**, the project has undergone a "Native-Like" overhaul:
- **Mobile overrides**: `@media (max-width: 800px)` disables `backdrop-filter` and heavy mesh animations to eliminate lag.
- **Touch optimization**: `touch-action: manipulation` and immediate overlay hiding (pointer-events) for sub-millisecond responsiveness.
- **JS Audit**: `mousemove` listeners are disabled on touch devices. Firestore connections are kept alive (no termination) to avoid sync latency.

## 🛠️ Key Logic Hubs
- **AI Integration**: Search for `evaluateRecallWithGemini` in `main.js`.
- **SRS Engine**: Uses a modified SM-2 algorithm. Search for `processFlashcardResult`.
- **Nuclear Rescue**: Triple-tap on screen triggers a rescue script in `index.html` to force-hide stuck overlays and disable blur.

## 🧠 4 Pilastri di Cortex (La Visione dell'Architect)
Cortex non è una semplice app di appunti; è un **Framework di Potenziamento Cognitivo** fondato su:

1. **Architettura di Verità Ibrida (Hybrid RAG)**: Utilizza documenti locali (PDF, Word, TXT) combinati con Google Search Grounding per risposte aggiornate e validate scientificamente con citazione fonti.
2. **Profilazione Attitudinale Neurale**: Il Neural Trial mappa 5 dimensioni cognitive (*Logica, Sintesi, Applicazione, Critica, Problem Solving*) visualizzate in un grafico Radar Chart SVG dinamico.
3. **Gamification Deterministica**: Sistema di XP e Modalità Sfida (60s) strutturato per simulare lo stress reale e forzare il recupero delle informazioni massimizzando la Ritenzione Neurale.
4. **Archiviazione Strategica (Cloud Sync)**: Integrazione Firebase Storage per caricamenti isolati preservando contesti granulari per mazzo di studio.

## 📁 Directory Structure
- `/.well-known`: TWA verification (AssetLinks).
- `/play_store_package`: Build artifacts and signing keys.
- `/idee`: Future roadmap and architectural notes.

## 🛡️ Security Notes & TO-DO
- **[CRITICAL] XSS in Community Decks**: `modules/community.js` renders public deck data (name, author) using `innerHTML` without sanitization. **Risk**: Stealing keys or sessions via shared decks.
- **API Key Storage**: `SecurityManager` uses `localStorage` (vulnerable to XSS). Fix XSS first to secure the keys.
- **To-Do**: Apply `sanitizeHTML()` to all properties rendered inside public list loops (e.g., `community.js`, lists).

---
*Created by Antigravity (Google DeepMind) for efficient AI-to-AI collaboration.*
