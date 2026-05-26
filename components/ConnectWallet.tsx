'use client'

import dynamic from 'next/dynamic'

const ConnectWalletInner = dynamic(
  () => import('./ConnectWalletInner'),
  { ssr: false, loading: () => <span className="h-9 w-20 sm:w-24 rounded-sm bg-brand/30 animate-pulse shrink-0" /> }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
