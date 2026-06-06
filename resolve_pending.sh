#!/bin/bash
# resolve_pending.sh
# Bradbury Profile Verifier — Resolver Script
# Polls the contract for pending submissions, verifies via oEmbed API,
# and calls resolve(task_id, true|false) on-chain.
#
# Usage:  ./resolve_pending.sh [--once|--poll]
#   --once : Run once and exit
#   --poll : Run every 2 minutes (default)
#
# Requires: genlayer CLI (with debugger account), curl, jq

set -euo pipefail

CONTRACT="0x534025bC3F5e98cc5b33EC74A89ec3c1d59F3eaF"
ACCOUNT="debugger"
PASSWORD="test1234"
OEMBED_BASE="https://publish.x.com/oembed"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

extract_handle() {
  echo "$1" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    url = data.get('author_url', '')
    parts = url.rstrip('/').split('/')
    print(parts[-1].lower() if parts else '')
except:
    print('')
"
}

extract_text() {
  echo "$1" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    html = data.get('html', '')
    m = re.search(r'<p[^>]*>([\s\S]*?)</p>', html)
    text = re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else ''
    print(text)
except:
    print('')
"
}

fetch_oembed() {
  local tweet_url="$1"
  local clean_url="${tweet_url%%\?*}"
  local encoded_url
  encoded_url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${clean_url}', safe=''))")
  curl -s "${OEMBED_BASE}?url=${encoded_url}" \
    -H "User-Agent: TaskVerifierResolver/1.0" \
    --max-time 10 2>/dev/null || echo ""
}

resolve_submission() {
  local task_id="$1"
  local verified="$2"
  echo "    → Calling resolve(${task_id}, ${verified})..."
  echo "${PASSWORD}" | timeout 90 genlayer write "${CONTRACT}" resolve \
    --args "\"${task_id}\"" "${verified}" 2>&1 | tail -3
}

process_pending() {
  echo "[$(date -u +%FT%TZ)] Checking for pending submissions..."

  # Fetch all submissions
  local raw
  raw=$(genlayer call "${CONTRACT}" get_all 2>&1 | sed -n '/^{/,/^$/p' || true)

  if [ -z "${raw}" ] || [ "${raw}" = "{}" ]; then
    echo "  No submissions found."
    return
  fi

  # Parse pending submissions
  echo "${raw}" | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
except:
    sys.exit(0)

pending = {k: v for k, v in data.items() if v.get('status') == 'pending'}
if not pending:
    print('  No pending submissions.')
    sys.exit(0)

print(f'  Found {len(pending)} pending submission(s).')
for task_id, sub in pending.items():
    print(f'  {task_id}: @{sub[\"x_handle\"]} code={sub[\"code\"]} url={sub[\"tweet_url\"]}')
    print(f'RESOLVE:{task_id}:{sub[\"x_handle\"]}:{sub[\"code\"]}:{sub[\"tweet_url\"]}')
" > /tmp/resolve_output.txt 2>&1

  while IFS= read -r line; do
    if [[ "$line" == RESOLVE:* ]]; then
      IFS=':' read -r _ task_id x_handle code tweet_url <<< "$line"
      echo ""
      echo "  Processing ${task_id}: @${x_handle} code=${code}"

      # Fetch oEmbed
      oembed_json=$(fetch_oembed "${tweet_url}")
      if [ -z "${oembed_json}" ]; then
        echo "  ⚠ oEmbed fetch failed — marking rejected"
        resolve_submission "${task_id}" false
        continue
      fi

      # Extract handle and text
      api_handle=$(echo "${oembed_json}" | extract_handle)
      tweet_text=$(echo "${oembed_json}" | extract_text)

      echo "  oEmbed handle: @${api_handle}"
      echo "  tweet_text contains code: $(echo "${tweet_text}" | grep -q "${code}" && echo 'yes' || echo 'no')"

      # Determine if verified
      code_lower="${code,,}"
      handle_lower="${x_handle,,}"
      api_lower="${api_handle,,}"

      if [ "${api_lower}" = "${handle_lower}" ] && echo "${tweet_text}" | grep -qi "${code}"; then
        echo "  Verdict: VERIFIED ✓"
        resolve_submission "${task_id}" true
      else
        echo "  Verdict: REJECTED ✗"
        resolve_submission "${task_id}" false
      fi
    fi
  done < /tmp/resolve_output.txt
}

# ── Main ──────────────────────────────────────────────────────────

cd "${SCRIPT_DIR}"
echo "=== Bradbury Profile Verifier Resolver ==="
echo "Contract: ${CONTRACT}"
echo "Account:  ${ACCOUNT}"
echo ""

# Ensure the debugger account is active
genlayer account use "${ACCOUNT}" 2>/dev/null || true

case "${1:-}" in
  --once)
    process_pending
    ;;
  --poll)
    while true; do
      process_pending
      echo ""
      echo "Next check in 2 minutes..."
      sleep 120
    done
    ;;
  *)
    # Default: run once
    process_pending
    ;;
esac
