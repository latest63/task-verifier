'use client'

import dynamic from 'next/dynamic'

const ConnectWalletInner = dynamic(
  () => import('./ConnectWalletInner'),
  { ssr: false, loading: () => <span className="h-8 w-24 rounded-lg bg-ink-dim/20 animate-pulse" /> }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
