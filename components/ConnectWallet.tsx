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
          height: '44px',
          width: '110px',
          borderRadius: '10px',
          backgroundColor: 'rgba(245, 78, 0, 0.2)',
        }}
      />
    ),
  }
)

export default function ConnectWallet() {
  return <ConnectWalletInner />
}
