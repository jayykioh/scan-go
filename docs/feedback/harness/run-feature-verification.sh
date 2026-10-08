#!/usr/bin/env bash
# Run the product-feedback feature verification inside `firebase emulators:exec`.
#
#   npx firebase emulators:exec --only firestore,functions,storage \
#     --project scango-8f0e9 "bash docs/feedback/harness/run-feature-verification.sh"
#
# Preconditions:
#   1. The Vite dev server is already running (`npm run dev`).
#   2. `.env.local` sets VITE_USE_STORAGE_EMULATOR=true, otherwise the browser
#      uploads to the real bucket and the Storage emulator never sees the image.
#   3. The Firestore emulator is included: `storage.rules` calls
#      `firestore.exists`, and the Storage rules runtime refuses to start
#      without it (see BUG-11 in docs/feedback/comparative-review-2026-10.md).
set -euo pipefail
cd "$(dirname "$0")/../../.."

if ! grep -q '^[[:space:]]*VITE_USE_STORAGE_EMULATOR=true' .env.local 2>/dev/null; then
  echo "VITE_USE_STORAGE_EMULATOR=true is missing from .env.local." >&2
  echo "Add it, restart 'npm run dev', then run this script again." >&2
  exit 1
fi

if ! curl -sf -o /dev/null http://127.0.0.1:3000/; then
  echo "No dev server on http://127.0.0.1:3000. Run 'npm run dev' first." >&2
  exit 1
fi

export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$PWD/.pw-cache}"
node docs/feedback/harness/seed-emulator.mjs
node docs/feedback/harness/run-feedback-feature.mjs
