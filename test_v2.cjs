const { createClient, createAccount, chains } = require('genlayer-js');

const PK = '0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0';
const CONTRACT = '0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C';
const TWEET_URL = 'https://x.com/momentum_pool/status/2063205363327844420';
const HANDLE = 'momentum_pool';
const CODE = 'XYZ789';

async function main() {
  // Create account + client
  const account = createAccount(PK);
  const client = createClient({
    chain: chains.testnetBradbury,
    account,
  });
  console.log('Account:', account.address);
  console.log('Contract:', CONTRACT);

  // Step 1: Fetch oEmbed
  console.log('\n=== STEP 1: Fetch oEmbed ===');
  const oembedRes = await fetch(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(TWEET_URL)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const oembedRaw = await oembedRes.text();
  console.log(`oEmbed: ${oembedRaw.length} chars`);

  // Step 2: Submit
  console.log('\n=== STEP 2: Submit ===');
  const submitTx = await client.writeContract({
    address: CONTRACT,
    functionName: 'submit',
    args: [HANDLE, CODE, TWEET_URL, oembedRaw],
    value: 0n,
  });
  console.log('Submit TX:', submitTx);

  // Wait and get task id
  const submitReceipt = await client.waitForTransactionReceipt({ hash: submitTx });
  console.log('Submit receipt status:', submitReceipt.status_name);
  console.log('Submit receipt result:', submitReceipt.resultName);
  console.log('Submit receipt votes:', submitReceipt.lastRound?.validatorVotesName);

  // Extract task_id from the receipt - look at txDataDecoded
  const txData = submitReceipt.txDataDecoded || submitReceipt.txData;
  console.log('txData:', JSON.stringify(txData).slice(0, 200));

  // Try to get return data from the receipt
  const returnData = submitReceipt.lastRound?.returnData?.args;
  console.log('Return data:', returnData);

  // Check all decoded info
  if (submitReceipt.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
    console.log('Submit failed!');
    console.log(JSON.stringify(submitReceipt, null, 2).slice(0, 2000));
    return;
  }

  // For now just try p_0
  const taskId = 'p_0';
  console.log('\nTask ID:', taskId);

  // Step 3: Verify
  console.log('\n=== STEP 3: Verify ===');
  const verifyTx = await client.writeContract({
    address: CONTRACT,
    functionName: 'verify',
    args: [taskId],
    value: 0n,
  });
  console.log('Verify TX:', verifyTx);

  const verifyReceipt = await client.waitForTransactionReceipt({ hash: verifyTx });
  console.log('\nVerify receipt votes:', verifyReceipt.lastRound?.validatorVotesName);
  console.log('Verify receipt result:', verifyReceipt.resultName);
  console.log('Verify receipt exec:', verifyReceipt.txExecutionResultName);
  console.log('Verify receipt status:', verifyReceipt.status_name);

  // Check output
  if (verifyReceipt.lastRound?.returnData) {
    console.log('Return data:', JSON.stringify(verifyReceipt.lastRound.returnData));
  }
  if (verifyReceipt.txDataDecoded) {
    console.log('Decoded:', JSON.stringify(verifyReceipt.txDataDecoded).slice(0, 500));
  }

  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
