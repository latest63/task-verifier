#!/usr/bin/env python3
"""Minimal V2 test - try submit with tiny oEmbed."""
import subprocess
import shlex

RPC = "https://rpc-bradbury.genlayer.com"
CONTRACT = "0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C"

def genlayer_write(method, args_list=None, timeout=180):
    cmd = f'echo "test1234" | genlayer write {CONTRACT} {method} --rpc {RPC}'
    if args_list:
        quoted = " ".join(shlex.quote(a) for a in args_list)
        cmd += f" --args {quoted}"
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, shell=True)
    return result

# Test 1: Simple submit with tiny dummy JSON
tiny_json = '{"author_url":"https://x.com/test","html":"<p>test</p>"}'
print("=== Try submit with tiny JSON ===")
r = genlayer_write("submit", ["test", "ABC123", "https://x.com/test/status/123", tiny_json])
print(f"RC: {r.returncode}")
print(f"STDOUT last 500: {r.stdout[-500:]}")
if r.stderr:
    print(f"STDERR: {r.stderr[-500:]}")
print()

# Test 2: Check if there's something wrong with just get_count (view works already)
# Test 3: Try verify directly should fail with "not found"
print("=== Try verify on non-existent ===")
r = genlayer_write("verify", ["nonexistent"])
print(f"RC: {r.returncode}")
print(f"STDOUT last 500: {r.stdout[-500:]}")
if r.stderr:
    print(f"STDERR: {r.stderr[-500:]}")
