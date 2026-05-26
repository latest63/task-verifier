'use client'

import dynamic from 'next/dynamic'

const ConnectWalletInner = dynamic(
  () => import('./ConnectWalletInner'),
  { ssr: false, loading: () => <span className="h-9 w-20 sm:w-24 rounded-lg bg-ink-dim/20 animate-pulse shrink-0" /> }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
