#!/usr/bin/env python3
"""V2 test via genlayer CLI with properly escaped JSON."""
import subprocess
import json
import sys
import urllib.request
import urllib.parse
import shlex
import os

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

# Write to file to avoid shell escaping issues
with open("/tmp/oembed_v2_submit.json", "w") as f:
    f.write(oembed_raw)

# Step 2: Submit via CLI with HEREDOC to avoid escaping
print("\n=== STEP 2: Submit ===")
# Use Python to write a temp script that genlayer can read
submit_script = f"""#!/bin/bash
echo "test1234" | genlayer write {CONTRACT} submit \\
  --rpc {RPC} \\
  --args {shlex.quote(HANDLE)} {shlex.quote(CODE)} {shlex.quote(TWEET_URL)} {shlex.quote(oembed_raw)}
"""
with open("/tmp/v2_submit.sh", "w") as f:
    f.write(submit_script)
os.chmod("/tmp/v2_submit.sh", 0o755)

result = subprocess.run(
    ["/tmp/v2_submit.sh"],
    capture_output=True,
    text=True,
    timeout=180,
    shell=False,
)
print(f"RC: {result.returncode}")
if result.stdout:
    # Show the last part
    lines = result.stdout.split('\n')
    for line in lines[-30:]:
        print(line)
if result.stderr:
    print(f"STDERR: {result.stderr[-300:]}")
