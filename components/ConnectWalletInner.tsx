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
        onClick={() => disconnect()}
        className="font-semibold shrink-0"
        style={{
          height: '32px',
          padding: '0 14px',
          fontSize: '12px',
          borderRadius: '6px',
          backgroundColor: '#f5f5f0',
          border: '1px solid #d4d4cc',
          color: '#555',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          fontWeight: 600,
        }}
        title="Disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
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
