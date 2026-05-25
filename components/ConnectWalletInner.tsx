'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { useWeb3Modal, createWeb3Modal } from '@web3modal/wagmi/react'
import { config } from '../lib/wagmi-config'
import { useState, useEffect } from 'react'

// Idempotent init — runs once on first client import
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || ''
createWeb3Modal({
  wagmiConfig: config,
  projectId: projectId || 'TASK_VERIFIER_DEV',
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
        className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-success-soft text-emerald-700 border border-success-border shadow-sm hover:bg-success-border/30 transition-all duration-200"
        title="Disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={() => open()}
      className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-brand-gradient text-white shadow-glow hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
    >
      Connect
    </button>
  )
}
