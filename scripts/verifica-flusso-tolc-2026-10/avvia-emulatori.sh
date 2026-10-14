#!/usr/bin/env bash
# Emulatori locali Auth (9099) + Firestore (8189), progetto demo: nessun contatto con la produzione.
# firebase.json non avvia l'emulatore Auth: si usa una configurazione temporanea con una copia delle
# regole Firestore del repository (firebase.json non viene modificato).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
cp "$ROOT/firestore.rules" "$TMP/firestore.rules"
cat > "$TMP/firebase.json" <<JSON
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "auth": { "port": 9099, "host": "127.0.0.1" }, "firestore": { "port": 8189, "host": "127.0.0.1" }, "ui": { "enabled": false } } }
JSON
cd "$TMP"
exec npx -y firebase-tools@13 emulators:start --only auth,firestore --project demo-cortex-security --config "$TMP/firebase.json"
