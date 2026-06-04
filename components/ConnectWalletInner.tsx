'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useState, useEffect } from 'react'

export default function ConnectWalletInner() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useWeb3Modal()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  if (isConnected && address) {
    return (
      <button
        onClick={() => open()}
        className="font-semibold shrink-0 flex items-center gap-1"
        style={{
          height: '32px',
          padding: '0 10px',
          fontSize: '12px',
          borderRadius: '6px',
          backgroundColor: '#f5f5f0',
          border: '1px solid #d4d4cc',
          color: '#555',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          fontWeight: 600,
        }}
        title="Wallet"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={() => open()}
      className="font-semibold shrink-0"
      style={{
        height: '32px',
        padding: '0 16px',
        fontSize: '12px',
        borderRadius: '6px',
        backgroundColor: '#1e3a5f',
        color: '#ffffff',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(30, 58, 95, 0.3)',
        transition: 'all 0.2s ease',
        fontWeight: 600,
      }}
    >
      Connect
    </button>
  )
}
