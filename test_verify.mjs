#!/usr/bin/env node
/**
 * Test TweetVerifier contract - submit + verify with oEmbed data.
 * Uses genlayer-js with custom provider backed by private key.
 */
import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

const CONTRACT = '0xA61F3c7C8eac998Baa08B0B6e715d7c1270571F1';
const TWEET_URL = 'https://x.com/momentum_pool/status/2063227504194703686';
const HANDLE = 'momentum_pool';
const TEXT = 'Verifying @taskverifier: VoI2AH';
const RPC_URL = 'https://rpc-bradbury.genlayer.com';

const PK = process.argv[2];
if (!PK) { console.error('Usage: node test_verify.mjs <private_key>'); process.exit(1); }

const account = createAccount(PK);
console.log('Account:', account.address);

// Custom provider that signs with the private key
const provider = {
  request: async ({ method, params }) => {
    if (method === 'eth_chainId') {
      return '0x107D'; // Bradbury chain ID 4221
    }
    if (method === 'eth_accounts') {
      return [account.address];
    }
    if (method === 'eth_requestAccounts') {
      return [account.address];
    }
    // For signing, delegate to the account
    if (method === 'eth_sendTransaction') {
      const tx = params[0];
      const signed = await account.signTransaction(tx);
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [signed],
          id: Date.now(),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }
    // Generic RPC passthrough
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) {
      // Some calls like eth_estimateGas might fail for read-only
      return null;
    }
  },
};

async function pollReceipt(client, hash, maxWait = 120) {
  for (let i = 0; i < maxWait; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {}
  }
  return null;
}

async function main() {
  // 1. Fetch oEmbed
  console.log('Fetching oEmbed...');
  const oembedRes = await fetch(`https://publish.x.com/oembed?url=${encodeURIComponent(TWEET_URL)}`);
  const oembed = await oembedRes.json();
  const oembedJson = JSON.stringify(oembed);
  console.log('oEmbed fetched:', oembed.author_url);

  // 2. Create write client
  const client = createClient({ chain: testnetBradbury, account: account.address, provider });

  // 3. Submit
  console.log('\nSubmitting...');
  try {
    const hash = await client.writeContract({
      address: CONTRACT,
      functionName: 'submit',
      args: [TWEET_URL, HANDLE, TEXT, oembedJson],
      value: 0n,
    });
    console.log('Submit TX:', hash);
    
    // Wait for receipt
    console.log('Waiting for receipt...');
    const receipt = await pollReceipt(client, hash);
    console.log('Receipt:', JSON.stringify(receipt, null, 2).slice(0, 500));
  } catch (err) {
    console.error('Submit error:', err?.shortMessage || err?.message || err);
    if (err?.cause) console.error('Cause:', err.cause);
    return;
  }

  // 4. Read submissions to find task_id
  console.log('\nReading submissions...');
  await new Promise(r => setTimeout(r, 15000));
  try {
    const readClient = createClient({ chain: testnetBradbury });
    const all = await readClient.readContract({
      address: CONTRACT,
      functionName: 'get_all',
      args: [],
    });
    console.log('Submissions:', JSON.stringify(all, null, 2));

    if (all && typeof all === 'object') {
      const entries = Object.entries(all);
      if (entries.length > 0) {
        const [taskId] = entries[entries.length - 1];
        console.log(`\nTask ID: ${taskId}`);

        // 5. Verify
        console.log('\nVerifying...');
        try {
          const verifyHash = await client.writeContract({
            address: CONTRACT,
            functionName: 'verify',
            args: [taskId],
            value: 0n,
          });
          console.log('Verify TX:', verifyHash);

          // Wait for result
          console.log('Waiting for verify result...');
          const verifyReceipt = await pollReceipt(client, verifyHash, 180);
          console.log('Verify receipt:', JSON.stringify(verifyReceipt, null, 2).slice(0, 800));
        } catch (err) {
          console.error('Verify error:', err?.shortMessage || err?.message || err);
          if (err?.cause) console.error('Cause:', err.cause);
        }
      }
    }
  } catch (err) {
    console.error('Read error:', err?.shortMessage || err?.message || err);
  }
}

main().catch(console.error);
