#!/usr/bin/env python3
"""
Test the deterministic BradburyProfileVerifier.
Submit with oEmbed JSON → verify deterministically.
"""
import subprocess, json, urllib.request, sys, time, os, uuid

CONTRACT = "0x5398320BAF4d0C795dcEEcf751D1C61795Ab7C14"
TWEET_URL = "https://x.com/momentum_pool/status/2063227504194703686"
HANDLE = "momentum_pool"
CODE = "VoI2AH"
PASSWORD = "test1234"
GENLAYER = "/usr/bin/genlayer"
CWD = "/root/task-verifier"

# 1. Fetch oEmbed
print("1. Fetching oEmbed...")
resp = urllib.request.urlopen(
    f"https://publish.x.com/oembed?url={urllib.parse.quote(TWEET_URL, safe='')}",
    timeout=10
)
oembed = json.loads(resp.read())
oembed_json = json.dumps(oembed, separators=(",", ":"))
print(f"   author_url: {oembed['author_url']}")
print(f"   oEmbed JSON: {len(oembed_json)} chars")

# 2. Submit
print("\n2. Submitting...")
result = subprocess.run(
    [GENLAYER, "write", CONTRACT, "submit",
     "--args", oembed_json, HANDLE, CODE, TWEET_URL],
    input=f"{PASSWORD}\n",
    capture_output=True, text=True, timeout=120, cwd=CWD
)
for line in (result.stdout or "").split("\n"):
    if "Transaction Hash" in line or "txId" in line or "error" in line.lower():
        print(f"   {line.strip()}")
print(f"   Exit: {result.returncode}")

# 3. Wait for submission
print("\n3. Waiting for submission...")
time.sleep(15)

result = subprocess.run(
    [GENLAYER, "call", CONTRACT, "get_all"],
    capture_output=True, text=True, timeout=60, cwd=CWD
)
print(result.stdout[-800:] if result.stdout else "")

# 4. Extract task_id and verify
import re
match = re.search(r'p_(\d+)', result.stdout or "")
if match:
    task_id = f"p_{match.group(1)}"
    print(f"\n4. Verifying {task_id}...")
    result = subprocess.run(
        [GENLAYER, "write", CONTRACT, "verify", "--args", task_id],
        input=f"{PASSWORD}\n",
        capture_output=True, text=True, timeout=180, cwd=CWD
    )
    # Extract key results from stdout
    for line in (result.stdout or "").split("\n"):
        if any(k in line for k in ["status_name", "resultName", "txExecutionResultName",
                                     "AGREE", "DISAGREE"]):
            print(f"   {line.strip()}")

    # 5. Check final state
    print("\n5. Final state after verify:")
    time.sleep(15)
    result = subprocess.run(
        [GENLAYER, "call", CONTRACT, "get_submission", "--args", task_id],
        capture_output=True, text=True, timeout=60, cwd=CWD
    )
    for line in (result.stdout or "").split("\n"):
        if any(k in line for k in ["status", "verdict", "x_handle", "code"]):
            print(f"   {line.strip()}")
else:
    print("No submission found")
    print(result.stderr[-500:] if result.stderr else "")
