'use client'

import dynamic from 'next/dynamic'

const ConnectWalletInner = dynamic(
  () => import('./ConnectWalletInner'),
  {
    ssr: false,
    loading: () => (
      <span
        className="h-9 w-20 sm:w-24 rounded-sm animate-pulse shrink-0"
        style={{ backgroundColor: 'rgba(245, 78, 0, 0.3)' }}
      />
    ),
  }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
