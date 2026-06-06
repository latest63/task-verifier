#!/usr/bin/env python3
"""Test V2: submit raw oEmbed JSON, then verify."""
import subprocess
import json
import sys
import urllib.request
import urllib.parse
import tempfile
import os
import shlex

RPC = "https://rpc-bradbury.genlayer.com"
CONTRACT = "0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C"
TWEET_URL = "https://x.com/momentum_pool/status/2063205363327844420"
HANDLE = "momentum_pool"
CODE = "XYZ789"

def genlayer_write(method, args_list=None, timeout=180):
    """Call genlayer write with shell pipe for password."""
    cmd = f'echo "test1234" | genlayer write {CONTRACT} {method} --rpc {RPC}'
    if args_list:
        # Properly quote each arg for shell
        quoted = " ".join(shlex.quote(a) for a in args_list)
        cmd += f" --args {quoted}"
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=True,
    )
    return result.stdout, result.stderr, result.returncode

# Step 1: Get oEmbed
print("=== STEP 1: Fetch oEmbed ===")
req = urllib.request.Request(
    f"https://publish.twitter.com/oembed?url={urllib.parse.quote(TWEET_URL, safe='')}",
    headers={"User-Agent": "Mozilla/5.0"}
)
resp = urllib.request.urlopen(req)
oembed_raw = resp.read().decode()
print(f"oEmbed: {len(oembed_raw)} chars")

# Step 2: Submit
print("\n=== STEP 2: Submit ===")
stdout, stderr, rc = genlayer_write("submit", [HANDLE, CODE, TWEET_URL, oembed_raw], timeout=180)
print(f"RC: {rc}")
if stderr:
    print(f"STDERR: {stderr[-500:]}")
if stdout:
    print(f"STDOUT: {stdout[-1000:]}")
if rc != 0:
    print("SUBMIT FAILED!")
    sys.exit(1)

task_id = "p_0"

# Step 3: Verify
print(f"\n=== STEP 3: Verify ({task_id}) ===")
stdout, stderr, rc = genlayer_write("verify", [task_id], timeout=180)
print(f"RC: {rc}")
if stderr:
    print(f"STDERR: {stderr[-500:]}")
if stdout:
    print(f"STDOUT: {stdout[-1500:]}")

# Parse result
if "FINISHED_WITH_RETURN" in (stdout or ""):
    print("\n✅ FINISHED_WITH_RETURN")
elif "FINISHED_WITH_ERROR" in (stdout or ""):
    print("\n❌ FINISHED_WITH_ERROR")
else:
    print("\n⚠️ Check output above")

print("\n=== DONE ===")
