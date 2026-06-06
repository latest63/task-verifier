const { createClient, createAccount, chains } = require('genlayer-js');
const { createPublicClient, http } = require('viem');

const PK = '0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0';
const CONTRACT_V2 = '0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C';
const TWEET_URL = 'https://x.com/momentum_pool/status/2063205363327844420';
const HANDLE = 'momentum_pool';
const CODE = 'XYZ789';

async function main() {
  const account = createAccount(PK);
  const client = createClient({
    chain: chains.testnetBradbury,
    account,
  });

  // Raw RPC client
  const publicClient = createPublicClient({
    chain: chains.testnetBradbury,
    transport: http('https://rpc-bradbury.genlayer.com'),
  });

  // Step 1: Fetch oEmbed
  console.log('=== STEP 1: Fetch oEmbed ===');
  const res = await fetch(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(TWEET_URL)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const oembedRaw = await res.text();
  console.log(`oEmbed: ${oembedRaw.length} chars`);

  // Step 2: Submit
  console.log('\n=== STEP 2: Submit ===');
  try {
    const submitTx = await client.writeContract({
      address: CONTRACT_V2,
      functionName: 'submit',
      args: [HANDLE, CODE, TWEET_URL, oembedRaw],
      value: 0n,
    });
    console.log('Submit TX hash:', submitTx);

    // Wait using public client directly
    console.log('Waiting...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: submitTx,
      pollingInterval: 3000,
      timeout: 120000,
    });
    console.log('Receipt:', receipt);
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack?.split('\n').slice(0, 3).join('\n'));
    // Check if there's additional data in the error
    if (err.cause) console.error('Cause:', err.cause);
    if (err.details) console.error('Details:', err.details);
  }

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
