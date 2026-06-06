const { createClient, createAccount, chains } = require('genlayer-js');

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

  // Step 1: Fetch oEmbed
  console.log('=== STEP 1: Fetch oEmbed ===');
  const res = await fetch(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(TWEET_URL)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const oembedRaw = await res.text();
  console.log(`oEmbed: ${oembedRaw.length} chars`);

  // Step 2: Submit via simulateWriteContract to get raw TX hash
  console.log('\n=== STEP 2: Submit ===');
  const txHash = await client.simulateWriteContract({
    address: CONTRACT_V2,
    functionName: 'submit',
    args: [HANDLE, CODE, TWEET_URL, oembedRaw],
    rawReturn: true,  // Returns tx hash, not simulated result
    transactionHashVariant: 'genlayer',
  });
  console.log('Simulated TX hash:', txHash);

  // Wait for transaction receipt
  console.log('Waiting for receipt...');
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    interval: 3000,
    retries: 60,
  });
  console.log('\nReceipt status:', receipt.status_name);
  console.log('Receipt exec:', receipt.txExecutionResultName);
  console.log('Receipt result:', receipt.resultName);
  console.log('Receipt votes:', receipt.lastRound?.validatorVotesName);
  
  if (receipt.lastRound?.returnData) {
    console.log('Return data:', JSON.stringify(receipt.lastRound.returnData));
  }
  if (receipt.txDataDecoded) {
    console.log('Decoded:', JSON.stringify(receipt.txDataDecoded).slice(0, 500));
  }

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
