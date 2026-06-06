#!/usr/bin/env python3
"""V2 test via subprocess with list args (no shell escaping issues)."""
import subprocess
import json
import sys
import urllib.request
import urllib.parse

RPC = "https://rpc-bradbury.genlayer.com"
CONTRACT = "0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C"
TWEET_URL = "https://x.com/momentum_pool/status/2063205363327844420"
HANDLE = "momentum_pool"
CODE = "XYZ789"

# Step 1: Get oEmbed
print("=== STEP 1: Fetch oEmbed ===")
req = urllib.request.Request(
    f"https://publish.twitter.com/oembed?url={urllib.parse.quote(TWEET_URL, safe='')}",
    headers={"User-Agent": "Mozilla/5.0"}
)
resp = urllib.request.urlopen(req)
oembed_raw = resp.read().decode()
print(f"oEmbed: {len(oembed_raw)} chars")

# Step 2: Submit via genlayer CLI with list args (no shell)
print("\n=== STEP 2: Submit ===")
# Write args to a temp args file that genlayer can read
# Actually genlayer CLI doesn't support args file. Let me use a heredoc in shell.
cmd = ["genlayer", "write", CONTRACT, "submit", "--rpc", RPC, "--args",
       HANDLE, CODE, TWEET_URL, oembed_raw]
print(f"Calling: {' '.join(cmd[:6])} <4 args>")

result = subprocess.run(
    cmd,
    capture_output=True,
    text=True,
    input="test1234\n",
    timeout=200,
)
print(f"RC: {result.returncode}")
stdout = result.stdout
stderr = result.stderr

if "FINISHED_WITH_RETURN" in stdout:
    print("✅ SUBMIT SUCCEEDED")
elif "FINISHED_WITH_ERROR" in stdout:
    print("❌ SUBMIT FAILED WITH ERROR")
elif "Transaction reverted" in stdout or "Transaction reverted" in stderr:
    print("❌ TRANSACTION REVERTED")
elif "timed out" in stdout.lower() or "timed out" in stderr.lower():
    print("⏰ TIMED OUT")
else:
    print("⚠️ Check output")

# Print last 30 lines
lines = (stdout or "").split('\n')
for line in lines[-30:]:
    print(line)
if stderr:
    for line in stderr.split('\n')[-10:]:
        print(f"STDERR: {line}")
