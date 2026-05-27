# Task Verifier

Verify social media actions with AI consensus on [GenLayer](https://genlayer.com). Your community submits proof (screenshots), and GenLayer's AI validators cross-reference against live tweets to reach consensus on-chain.

## How it works

1. **Deploy the contract** on GenLayer Bradbury testnet
2. **Set your contract address** as an environment variable
3. **Share the contract address** with your community
4. **Community members submit proof** of completed tasks (like, retweet, reply, post)
5. **You verify submissions** — GenLayer AI checks the screenshot against the actual tweet
6. **Consensus is reached on-chain** — verified or rejected

## Quick start

### 1. Deploy the contract

The verification contract is at [`contract/task_verifier.py`](./contract/task_verifier.py).

```bash
# Install GenLayer CLI
npm install -g genlayer

# Switch to Bradbury testnet
genlayer network testnet-bradbury

# Deploy (you'll be prompted to confirm with your wallet)
genlayer contract deploy contract/task_verifier.py
```

**Requirements:**
- Python 3.12+
- A wallet with testnet GEN from the [Bradbury faucet](https://testnet-faucet.genlayer.foundation)
- GenLayer RPC: `https://rpc-bradbury.genlayer.com` (chain ID: 4221)

### 2. Clone and configure

```bash
git clone https://github.com/latest63/task-verifier.git
cd task-verifier
npm install
```

Create `.env.local`:
```
NEXT_PUBLIC_VERIFIER_CONTRACT=0x_YOUR_DEPLOYED_CONTRACT_ADDRESS
```

### 3. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/latest63/task-verifier)

Or manually:

```bash
npm run build
```

Set the same env var on Vercel: `NEXT_PUBLIC_VERIFIER_CONTRACT` = your contract address.

### 4. Share with your community

Your community members need:
- Your deployed contract address
- Your Vercel URL (or they interact directly with the contract)

They submit proof via the contract's `submit_task` function with:
- `tweet_url` — the tweet they engaged with
- `screenshot_url` — publicly hosted screenshot (use 0x0.st or any image host)
- `expected_handle` — their X handle
- `action_type` — `like`, `retweet`, `reply`, or `post`

### 5. Verify

Connect your wallet to the dashboard, click **Verify** on any pending submission. GenLayer validators will check the proof and reach consensus.

## Tech stack

- **Next.js 14** — frontend framework
- **GenLayer Bradbury** — AI-powered consensus (chain 4221)
- **Web3Modal (AppKit)** — wallet connection
- **wagmi + viem** — chain interaction
- **PostHog design system** — warm olive/sage UI
- **0x0.st** — free image hosting

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_VERIFIER_CONTRACT` | Yes | Your deployed contract address on Bradbury |
| `NEXT_PUBLIC_WALLETCONNECT_ID` | No | WalletConnect project ID (for QR/ mobile wallets) |

## License

MIT — build whatever you want.
