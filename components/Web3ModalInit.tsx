'use client'

import { createWeb3Modal } from '@web3modal/wagmi/react'
import { config } from '../lib/wagmi-config'

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

export default function Web3ModalInit() {
  return null
}
