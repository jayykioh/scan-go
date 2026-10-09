#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")" || exit 1
PROJECT=scango-8f0e9
LOG=/tmp/scango-redeploy
mkdir -p "$LOG"
FAILED=()
mapfile -t CHUNKS < <(node -e '
const fs=require("fs");
const s=fs.readFileSync("functions/src/index.ts","utf8");
const n=[...s.matchAll(/^\s{2}([A-Za-z0-9_]+),$/gm)].map(m=>m[1]);
for(let i=0;i<n.length;i+=11) console.log(n.slice(i,i+11).map(x=>"functions:"+x).join(","));
')
i=0
for chunk in "${CHUNKS[@]}"; do
  i=$((i+1)); name="batch-$(printf '%02d' "$i")"
  echo "=== $name START $(date -Is) ==="
  if npx firebase deploy --only "$chunk" --project "$PROJECT" --non-interactive >"$LOG/$name.log" 2>&1; then
    echo "=== $name OK $(date -Is) ==="
  else
    echo "=== $name FAILED $(date -Is) ==="
    tail -30 "$LOG/$name.log"
    FAILED+=("$name")
  fi
  sleep 45
done
echo "FAILED_BATCHES: ${FAILED[*]:-none}"
