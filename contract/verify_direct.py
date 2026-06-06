"""Verify p_0 on Bradbury using direct web3 calls (bypass genlayer-py write)."""
from web3 import Web3
from eth_account import Account
from eth_account._utils.signing import keccak
import time, json

PRIVATE_KEY = "0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0"
acct = Account.from_key(PRIVATE_KEY)

w3 = Web3(Web3.HTTPProvider("https://rpc-bradbury.genlayer.com"))
contract_addr = "0x63DD4Db1971506773eEc2e453Ca3e7b3868526Cf"

# Build calldata for verify(string)
def encode_call(function_sig, args):
    selector = keccak(function_sig.encode())[:4]
    # Simplified string encoding for this specific case
    # ABI: offset(32) + len(str) + padded_str
    s = args[0].encode()
    offset = Web3.to_bytes(0x20).rjust(32, b'\x00')
    length = Web3.to_bytes(len(s)).rjust(32, b'\x00')
    padded = s.ljust(32 * ((len(s) + 31) // 32), b'\x00')
    return selector + offset + length + padded

calldata = encode_call("verify(string)", ["p_0"])
print(f"Calldata: {calldata.hex()[:100]}...")

# Build transaction
tx = {
    "from": acct.address,
    "to": contract_addr,
    "data": "0x" + calldata.hex(),
    "value": 0,
    "nonce": w3.eth.get_transaction_count(acct.address),
    "chainId": 4221,
}

# Estimate gas
try:
    tx["gas"] = w3.eth.estimate_gas(tx)
    print(f"Gas estimate: {tx['gas']}")
except Exception as e:
    print(f"Gas estimation failed: {e}")
    tx["gas"] = 2000000

# Add gas price
base_fee = w3.eth.gas_price
tx["maxFeePerGas"] = base_fee * 2
tx["maxPriorityFeePerGas"] = w3.to_wei(2, "gwei")
tx["type"] = 2

print(f"Sending tx with nonce {tx['nonce']}...")
signed = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
print(f"TX: {tx_hash.hex()}")

# Wait
receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
print(f"Receipt status: {receipt['status']}")
print(f"Block: {receipt['blockNumber']}")
print(f"Gas used: {receipt['gasUsed']}")
