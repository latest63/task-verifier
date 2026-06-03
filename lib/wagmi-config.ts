import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

const bradbury = {
  id: 4221,
  name: 'GenLayer Bradbury',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public: { http: ['https://rpc-bradbury.genlayer.com'] },
  },
  blockExplorers: {
    default: { name: 'Bradbury Explorer', url: 'https://explorer-bradbury.genlayer.com' },
  },
} as const

const studionet = {
  id: 1337,
  name: 'GenLayer Studio',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://studio.genlayer.com/api'] },\n    public: { http: ['https://studio.genlayer.com/api'] },
  },
  testnet: true,
} as const

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || ''
if (!projectId) {
  console.warn('NEXT_PUBLIC_WALLETCONNECT_ID not set — WalletConnect QR connections unavailable. Only injected wallets (MetaMask) will work.')
}

export const config = createConfig({
  chains: [bradbury, studionet],
  connectors: [
    injected(),
    walletConnect({ projectId, showQrModal: false }),
  ],
  transports: {
    [bradbury.id]: http(),
    [studionet.id]: http(),
  },
})
