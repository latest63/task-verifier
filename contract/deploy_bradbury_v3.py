from genlayer_py.client import create_client
from genlayer_py.chains import testnet_bradbury
from eth_account import Account
import time

PRIVATE_KEY = "0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0"
acct = Account.from_key(PRIVATE_KEY)
client = create_client(chain=testnet_bradbury)

with open("bradbury_task_verifier.py") as f:
    code = f.read()

print("Deploying BradburyTaskVerifier (syndication API + strict_eq)...")
tx_hash = client.deploy_contract(
    code=code,
    account=acct,
    args=[],
    leader_only=False,
)
print(f"TX: {tx_hash}")

for i in range(30):
    time.sleep(5)
    try:
        receipt = client.wait_for_transaction_receipt(tx_hash, timeout=5)
        print(f"Contract address: {receipt['recipient']}")
        print(f"Status: {receipt['status_name']}")
        break
    except Exception as e:
        print(f"Attempt {i+1}/30: {e}")
        continue
else:
    print("Timeout waiting for receipt")
    import requests
    r = requests.post("https://rpc-bradbury.genlayer.com",
        json={"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":[tx_hash],"id":1})
    print(f"Raw receipt: {r.json()}")
