# Cortex — Jules Context File

## Project
Cortex is a PWA + Android TWA flashcard/spaced-repetition study app.
Tech stack: Vanilla JS ES Modules, Vite 5, Firebase (Auth, Firestore, Cloud Functions, FCM), Stripe.
The Cortex app lives in the `cortex/` subfolder of this repository.

## Architecture
- `cortex/main.js` — entry point, global registry (register/dispatch pattern)
- `cortex/core/` — appBoot, navigation, state, eventBus, i18n, onboarding, pwa, ui
- `cortex/modules/` — feature modules (home, decks, study, quiz, pomodoro, gamification, etc.)
- `cortex/services/` — firebase, ai, settings, srs, fileHandler, neuralCoach, notifications
- `cortex/app.html` — main app shell (single-page)
- `cortex/styles.css` — all styles
- `cortex/functions/index.js` — Firebase Cloud Functions (Stripe, Gemini proxy)

## Key Patterns
- All global functions registered via `register('fnName', fn)` in main.js
- HTML elements use `data-fn="fnName"` and `data-params='[...]'` for event delegation
- Firebase Firestore for cloud sync, localStorage/IndexedDB for local
- Gemini AI accessed via `callGeminiProxy` Cloud Function (not directly)
- Stripe for subscriptions: student_monthly €4.99, student_yearly €39.99

## Current Known Issues / Tasks
- The `cortex/modules/pomodoro.js` soundscapes now use YouTube embed (iframe hidden)
  instead of broken Mixkit MP3 URLs. The YouTube player is controlled via postMessage.
- `cortex/services/firebase.js` submitFeedback() was gated behind login — now works anonymously too.
- physicsMap.js and visualGraph.js have been removed (renamed to .bak) — do not re-add them.
- All URLs should use `cortexapp.it` not `cortex-app.web.app`.

## Build & Deploy
```bash
cd cortex
npm run build        # Vite build → dist/
firebase deploy --only "hosting"
firebase deploy --only "functions"
```

## Important: File Truncation Issue
Large files (>100KB) may appear truncated when read via tools.
Always check `wc -l` and `tail` before editing large files like app.html, firebase.js, main.js.
Use `tr -d '\0'` to strip null bytes if build fails with "Unexpected character '\0'".

## Domain
Production: https://cortexapp.it
Firebase project: cortex-74a4e
