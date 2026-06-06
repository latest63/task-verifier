#!/usr/bin/env node
/**
 * Test deterministic BradburyProfileVerifier using genlayer-js.
 */
import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

const CONTRACT = '0x5398320BAF4d0C795dcEEcf751D1C61795Ab7C14';
const TWEET_URL = 'https://x.com/momentum_pool/status/2063227504194703686';
const HANDLE = 'momentum_pool';
const CODE = 'VoI2AH';
const RPC_URL = 'https://rpc-bradbury.genlayer.com';

const PK = process.argv[2];
if (!PK) { console.error('Usage: node test.mjs <private_key>'); process.exit(1); }

const account = createAccount(PK);
console.log('Account:', account.address);

// Custom provider backed by private key
const provider = {
  request: async ({ method, params }) => {
    if (method === 'eth_chainId') return '0x107d';
    if (method === 'eth_accounts') return [account.address];
    if (method === 'eth_requestAccounts') return [account.address];
    if (method === 'eth_sendTransaction') {
      const tx = params[0];
      const signed = await account.signTransaction(tx);
      const res = await fetch(RPC_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signed], id: 1 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch { return null; }
  },
};

async function main() {
  // 1. Fetch oEmbed
  console.log('1. Fetching oEmbed...');
  const oembedRes = await fetch(`https://publish.x.com/oembed?url=${encodeURIComponent(TWEET_URL)}`);
  const oembed = await oembedRes.json();
  const oembedStr = JSON.stringify(oembed);
  console.log('   author_url:', oembed.author_url);

  // 2. Create client + connect
  const client = createClient({ chain: testnetBradbury, account: account.address, provider });
  await client.connect('Genlayer Bradbury Testnet').catch(() => {});

  // 3. Submit
  console.log('\n2. Submitting...');
  const submitHash = await client.writeContract({
    address: CONTRACT, functionName: 'submit',
    args: [oembedStr, HANDLE, CODE, TWEET_URL],
    value: 0n,
  });
  console.log('   TX:', submitHash);
  console.log('   Waiting for receipt...');

  // Wait for tx
  await new Promise(r => setTimeout(r, 20000));

  // 4. Read submissions
  console.log('\n3. Reading submissions...');
  const readClient = createClient({ chain: testnetBradbury });
  const all = await readClient.readContract({ address: CONTRACT, functionName: 'get_all', args: [] });
  console.log('   Submissions:', JSON.stringify(all, null, 2));

  const entries = Object.entries(all || {});
  if (entries.length === 0) { console.log('   No submissions found'); return; }
  const [taskId] = entries[entries.length - 1];
  console.log(`\n4. Verifying ${taskId}...`);

  // 5. Verify
  const verifyHash = await client.writeContract({
    address: CONTRACT, functionName: 'verify',
    args: [taskId], value: 0n,
  });
  console.log('   Verify TX:', verifyHash);
  console.log('   Waiting for verify (60s)...');
  await new Promise(r => setTimeout(r, 30000));

  // 6. Check result
  console.log('\n5. Final state:');
  try {
    const sub = await readClient.readContract({ address: CONTRACT, functionName: 'get_submission', args: [taskId] });
    console.log('   status:', sub.status);
    console.log('   verdict:', sub.verdict);
  } catch (e) {
    console.log('   Error reading:', e.message);
  }
}

main().catch(e => console.error('Fatal:', e?.shortMessage || e?.message || e));
