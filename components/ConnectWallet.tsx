'use client'

import dynamic from 'next/dynamic'

const ConnectWalletInner = dynamic(
  () => import('./ConnectWalletInner'),
  {
    ssr: false,
    loading: () => (
      <span
        className="shrink-0 animate-pulse"
        style={{
          display: 'inline-block',
          height: '32px',
          width: '80px',
          borderRadius: '6px',
          backgroundColor: 'rgba(30, 58, 95, 0.2)',
        }}
      />
    ),
  }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
