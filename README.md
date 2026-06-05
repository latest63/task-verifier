# Task Verifier

**Verify X/Twitter social tasks with on-chain AI consensus.**

A plug-and-play platform that lets your community submit proof of X actions (posts, comments, likes, retweets) and have them verified by AI validators running on GenLayer — **$0 in API fees**, just gas costs.

The included **GenLayer Post Verification** is a sample implementation. Fork it, deploy your own contract, and adapt it to any X action type.

---

## How it works

1. **Your users** upload a screenshot of their X action (post, comment, like, retweet)
2. The image is auto-compressed and submitted to GenLayer
3. **4 AI validators** independently analyze the screenshot and vote
4. Consensus is reached on-chain — the verdict is stored permanently

Zero API keys, no subscriptions, no hidden costs.

---

## Project structure

| Route | What it is |
|---|---|
| `/` | Landing page — pitch, features, roadmap |
| `/app` | The app — submit screenshots, view activity, verify submissions |
| `/api/upload` | Image upload endpoint |

---

## Quick start

### 1. Deploy your contracts

Two sample contracts are included:

| Contract | File | Purpose |
|---|---|---|
| Post Verifier | [`contract/task_verifier.py`](./contract/task_verifier.py) | Verify screenshots of any @GenLayer post |
| Liked Post Verifier | [`contract/liked_post_verifier.py`](./contract/liked_post_verifier.py) | Verify screenshots of a liked @GenLayer post (heart must be filled) |
| Profile Verifier | [`contract/profile_verifier.py`](./contract/profile_verifier.py) | Verify X handle ownership via tweet + screenshot |

```bash
# Install GenLayer CLI
npm install -g genlayer

# Switch to Bradbury testnet
genlayer network testnet-bradbury

# Deploy all contracts
genlayer contract deploy contract/task_verifier.py
genlayer contract deploy contract/liked_post_verifier.py
genlayer contract deploy contract/profile_verifier.py
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
NEXT_PUBLIC_VERIFIER_CONTRACT=0x_YOUR_POST_VERIFIER_ADDRESS
NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT=0x_YOUR_LIKED_POST_VERIFIER_ADDRESS
NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT=0x_YOUR_PROFILE_VERIFIER_ADDRESS
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page, then navigate to `/app` to use the verifier.

### 4. Deploy to production

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/latest63/task-verifier)

Set the same env vars on Vercel: `NEXT_PUBLIC_VERIFIER_CONTRACT`, `NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT`, and `NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT`.

### 5. Share with your community

Your users visit your deployed URL and submit screenshots of their X actions. After submission, any connected wallet can trigger verification.

---

## Roadmap

| Feature | Status |
|---|---|
| Post Verification (sample) | ✅ Live |
| Liked Post Verification | ✅ Live |
| Profile Verification | ✅ Live |
| Comment Verification | 🔜 Upcoming |
| Retweet Verification | 🔜 Upcoming |

The contract and frontend are designed to be extended. Each action type follows the same pattern — upload a screenshot, AI validators check it, result is stored on-chain.

---

## Tech stack

- **Next.js 14 (App Router)** — frontend framework
- **GenLayer Bradbury** — AI-powered consensus blockchain (chain 4221)
- **Web3Modal (AppKit)** — wallet connection
- **wagmi + viem** — chain interaction and wallet management
- **genlayer-js** — GenLayer contract interaction (read/write, ABI encoding)
- **PostHog design system** — warm olive/sage UI palette
- **TypeScript** — full type safety

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_VERIFIER_CONTRACT` | Yes | Your Post Verifier contract address on Bradbury |
| `NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT` | No | Your Liked Post Verifier contract address on Bradbury |
| `NEXT_PUBLIC_VERIFIER_CONTRACT_STUDIO` | No | Contract address on StudioNet (optional testnet) |
| `NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT_STUDIO` | No | Liked Post Verifier address on StudioNet |
| `NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT` | No | Profile Verifier contract address on Bradbury |
| `NEXT_PUBLIC_WALLETCONNECT_ID` | No | WalletConnect project ID (QR/mobile wallets) |

## Customizing for your use case

The GenLayer Post Verification and Liked Post Verification are **samples** — the simplest instantiation of the pattern. To verify different X actions:

1. **Deploy your own contract** — modify `contract/task_verifier.py` or `contract/liked_post_verifier.py` to handle the action type you care about
2. **Update the frontend** — point `NEXT_PUBLIC_VERIFIER_CONTRACT` and/or `NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT` to your contracts
3. **The AI validators** handle the rest — no API fees, no additional infrastructure

---

## License

MIT — build whatever you want.
