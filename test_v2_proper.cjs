const { createClient, createAccount, chains, encode, makeCalldataObject } = require('genlayer-js');
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
  const submitTx = await client.writeContract({
    address: CONTRACT_V2,
    functionName: 'submit',
    args: [HANDLE, CODE, TWEET_URL, oembedRaw],
    value: 0n,
  });
  console.log('Submit TX:', submitTx);
  
  // Wait with longer timeout
  console.log('Waiting for submit receipt...');
  const submitReceipt = await client.waitForTransactionReceipt({
    hash: submitTx,
    interval: 2000,
    retries: 60,  // 60 * 2s = 120s max wait
  });
  console.log('Submit status:', submitReceipt.status_name);
  console.log('Submit exec:', submitReceipt.txExecutionResultName);
  console.log('Submit votes:', submitReceipt.lastRound?.validatorVotesName);
  
  if (submitReceipt.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
    console.log('Submit failed! Full receipt:');
    console.log(JSON.stringify(submitReceipt, null, 2).slice(0, 2000));
    return;
  }

  const taskId = 'p_0';
  console.log('\nTask ID:', taskId);

  // Step 3: Verify
  console.log('\n=== STEP 3: Verify ===');
  const verifyTx = await client.writeContract({
    address: CONTRACT_V2,
    functionName: 'verify',
    args: [taskId],
    value: 0n,
  });
  console.log('Verify TX:', verifyTx);
  
  console.log('Waiting for verify receipt...');
  const verifyReceipt = await client.waitForTransactionReceipt({
    hash: verifyTx,
    interval: 2000,
    retries: 60,
  });
  console.log('Verify status:', verifyReceipt.status_name);
  console.log('Verify exec:', verifyReceipt.txExecutionResultName);
  console.log('Verify votes:', verifyReceipt.lastRound?.validatorVotesName);
  console.log('Verify return:', JSON.stringify(verifyReceipt.lastRound?.returnData));

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
