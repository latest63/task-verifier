from genlayer_py.client import create_client
from genlayer_py.chains import studionet
from eth_account import Account
import time, json

PRIVATE_KEY = "0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0"
acct = Account.from_key(PRIVATE_KEY)
client = create_client(chain=studionet)

with open("profile_verifier.py") as f:
    code = f.read()

print("Deploying to StudioNet...")
tx_hash = client.deploy_contract(
    code=code,
    account=acct,
    args=[],
    leader_only=False,
)
print(f"TX: {tx_hash}")

# Poll for receipt
for i in range(60):
    time.sleep(3)
    try:
        receipt = client.wait_for_transaction_receipt(tx_hash)
        print(f"Contract address: {receipt['recipient']}")
        print(f"Status: {receipt['status_name']}")
        break
    except Exception as e:
        msg = str(e)
        if "KeyError" in msg or "status" in msg.lower() or "timeout" in msg.lower():
            # Try raw RPC
            import requests
            r = requests.post("https://studio.genlayer.com/api",
                json={"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":[tx_hash],"id":1},
                timeout=10)
            result = r.json().get("result")
            if result:
                addr = result.get("recipient") or result.get("contractAddress")
                print(f"Contract address (RPC): {addr}")
                print(f"Raw receipt: {json.dumps(result, indent=2)[:200]}")
                break
        print(f"  Attempt {i+1}: {msg[:80]}")
        continue
else:
    print("Timeout - checking via RPC...")
    import requests
    r = requests.post("https://studio.genlayer.com/api",
        json={"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":[tx_hash],"id":1},
        timeout=10)
    print(f"RPC result: {r.json()}")
