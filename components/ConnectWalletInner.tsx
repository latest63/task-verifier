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
        className="h-9 px-3 sm:px-9 rounded-sm text-[13px] sm:text-[14px] font-semibold transition-colors shrink-0"
        style={{ backgroundColor: '#eeefe9', border: '1px solid #bfc1b7', color: '#65675e' }}
        title="Disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={() => open()}
      className="h-9 px-4 sm:px-10 rounded-sm text-[13px] sm:text-[14px] font-semibold transition-all shrink-0"
      style={{ backgroundColor: '#F54E00', color: '#ffffff', border: 'none' }}
    >
      Connect
    </button>
  )
}
