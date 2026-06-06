from genlayer_py.client import create_client
from genlayer_py.chains import testnet_bradbury
from eth_account import Account
import time

PRIVATE_KEY = "0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0"
acct = Account.from_key(PRIVATE_KEY)
client = create_client(chain=testnet_bradbury, account=acct)

contract = "0x63DD4Db1971506773eEc2e453Ca3e7b3868526Cf"

print("Calling verify(p_0) on Bradbury...")
tx_hash = client.write_contract(
    address=contract,
    function_name="verify",
    args=["p_0"],
    account=acct,
    leader_only=False,
)
print(f"TX: {tx_hash}")

for i in range(40):
    time.sleep(7)
    try:
        receipt = client.wait_for_transaction_receipt(tx_hash, retries=1)
        print(f"Attempt {i+1}: status={receipt['status_name']}")
        if receipt["status_name"] in ("ACCEPTED", "REJECTED"):
            print(f"Result: {receipt.get('result_name', '?')}")
            break
    except Exception as e:
        msg = str(e)
        if "did not reach desired status" in msg or "still processing" in msg.lower():
            continue
        print(f"Error: {msg[:200]}")
        break

print("Done")
