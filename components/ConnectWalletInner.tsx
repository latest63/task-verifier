'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { useWeb3Modal, createWeb3Modal } from '@web3modal/wagmi/react'
import { config } from '../lib/wagmi-config'
import { useState, useEffect } from 'react'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || ''

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: false,
  metadata: {
    name: 'Task Verifier',
    description: 'Verify social media actions with AI consensus on GenLayer',
    url: typeof window !== 'undefined' ? window.location.origin : '',
    icons: [''],
  },
})

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
          height: '36px',
          padding: '0 18px',
          fontSize: '13px',
          borderRadius: '8px',
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
        height: '36px',
        padding: '0 22px',
        fontSize: '13px',
        borderRadius: '8px',
        backgroundColor: '#F54E00',
        color: '#ffffff',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 1px 6px rgba(245, 78, 0, 0.3)',
        transition: 'all 0.2s ease',
        fontWeight: 600,
      }}
    >
      Connect
    </button>
  )
}
