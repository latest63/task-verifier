from genlayer_py.client import create_client
from genlayer_py.chains import testnet_bradbury
from eth_account import Account

PRIVATE_KEY = "0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0"
acct = Account.from_key(PRIVATE_KEY)
client = create_client(chain=testnet_bradbury)

with open("profile_verifier.py") as f:
    code = f.read()

print("Deploying to Bradbury...")
tx_hash = client.deploy_contract(
    code=code,
    account=acct,
    args=[],
    leader_only=False,
)
print(f"TX: {tx_hash}")

receipt = client.wait_for_transaction_receipt(tx_hash)
print(f"Contract address: {receipt['recipient']}")
print(f"Status: {receipt['status_name']}")
