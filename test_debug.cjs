const { createClient, createAccount, chains } = require('genlayer-js');

const PK = '0x4729a6ab21896ecaf522c23037065fbd39eb2c8b6275cd074663fbf6b44d73d0';
const CONTRACT_V1 = '0x7575A5f2F16b6e6653623c8Ee4379f9a62f01Ec9';
const CONTRACT_V2 = '0xC085eC65B3C253c01A3f3150ACd1649F58c60C3C';

async function main() {
  const account = createAccount(PK);
  const client = createClient({
    chain: chains.testnetBradbury,
    account,
  });
  console.log('Account:', account.address);

  // Test V1 verify with non-existent task
  console.log('\n=== V1 verify(nonexistent) ===');
  try {
    const tx = await client.writeContract({
      address: CONTRACT_V1,
      functionName: 'verify',
      args: ['test123'],
      value: 0n,
    });
    console.log('TX:', tx);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log('Status:', receipt.status_name);
    console.log('Exec:', receipt.txExecutionResultName);
    console.log('Votes:', receipt.lastRound?.validatorVotesName);
  } catch (err) {
    console.error('V1 ERROR:', err.message);
  }

  // Test V2 verify with non-existent task
  console.log('\n=== V2 verify(nonexistent) ===');
  try {
    const tx = await client.writeContract({
      address: CONTRACT_V2,
      functionName: 'verify',
      args: ['test123'],
      value: 0n,
    });
    console.log('TX:', tx);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log('Status:', receipt.status_name);
    console.log('Exec:', receipt.txExecutionResultName);
    console.log('Votes:', receipt.lastRound?.validatorVotesName);
  } catch (err) {
    console.error('V2 ERROR:', err.message);
  }

  // Test V2 submit with minimal data
  console.log('\n=== V2 submit(minimal) ===');
  try {
    const tx = await client.writeContract({
      address: CONTRACT_V2,
      functionName: 'submit',
      args: ['test', 'ABC123', 'https://x.com/test/status/123', '{"ok":true}'],
      value: 0n,
    });
    console.log('TX:', tx);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log('Status:', receipt.status_name);
    console.log('Exec:', receipt.txExecutionResultName);
    console.log('Votes:', receipt.lastRound?.validatorVotesName);
  } catch (err) {
    console.error('V2 submit ERROR:', err.message);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
