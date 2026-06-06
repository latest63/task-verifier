#!/bin/bash
# Test V2 submit + verify
set -euo pipefail

RPC="https://rpc-bradbury.genlayer.com"
CONTRACT="0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C"
PASS="test1234"

echo "=== STEP 1: Get oEmbed ==="
OEMBED=$(curl -s -H "User-Agent: Mozilla/5.0" \
  "https://publish.twitter.com/oembed?url=https://x.com/momentum_pool/status/2063205363327844420")
echo "oEmbed: ${#OEMBED} chars"

# Write oEmbed to a temp file (for the CLI arg)
echo "$OEMBED" > /tmp/oembed_v2.txt

echo ""
echo "=== STEP 2: Submit ==="
# The genlayer CLI args system: 
# --args momentum_pool XYZ789 "tweet_url" 'oembed_raw_json'
# Use heredoc for password
echo "$PASS" | genlayer write "$CONTRACT" submit \
  --rpc "$RPC" \
  --args \
  momentum_pool \
  XYZ789 \
  "https://x.com/momentum_pool/status/2063205363327844420" \
  "$OEMBED" 2>&1

echo ""
echo "=== STEP 3: Verify p_0 ==="
echo "$PASS" | genlayer write "$CONTRACT" verify \
  --rpc "$RPC" \
  --args p_0 2>&1

echo ""
echo "=== DONE ==="
