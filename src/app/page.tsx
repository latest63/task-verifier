'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
} from 'viem'

// ── GenLayer Bradbury chain (viem) ────────────────────────────
const bradbury = defineChain({
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } },
  blockExplorers: {
    default: { name: 'Bradbury Explorer', url: 'https://explorer-bradbury.genlayer.com' },
  },
  testnet: true,
})

const publicClient = createPublicClient({ chain: bradbury, transport: http() })

// ── Minimal ABI (strings in, dynamic out) ─────────────────────
const taskAbi = [
  {
    type: 'function',
    name: 'submit_task',
    inputs: [
      { type: 'string', name: 'tweet_url' },
      { type: 'string', name: 'screenshot_url' },
      { type: 'string', name: 'expected_handle' },
      { type: 'string', name: 'action_type' },
    ],
    stateMutability: 'write',
  },
  {
    type: 'function',
    name: 'verify',
    inputs: [{ type: 'string', name: 'task_id' }],
    stateMutability: 'write',
  },
  {
    type: 'function',
    name: 'get_task',
    inputs: [{ type: 'string', name: 'task_id' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_all_tasks',
    inputs: [],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_task_count',
    inputs: [],
    stateMutability: 'view',
  },
] as const

// ── Types ──────────────────────────────────────────────────────
type TaskData = {
  submitter: string
  tweet_url: string
  screenshot_url: string
  expected_handle: string
  action_type: string
  status: string
  verdict_reason: string
  timestamp: string
}
type TaskMap = Record<string, TaskData>

const ACTION_TYPES = ['like', 'retweet', 'reply', 'post'] as const
const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 border-yellow-600/30 bg-yellow-950/30',
  verified: 'text-green-400 border-green-600/30 bg-green-950/30',
  rejected: 'text-red-400 border-red-600/30 bg-red-950/30',
}

// ── Component ──────────────────────────────────────────────────
export default function Home() {
  // Wallet
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  // Contract — from env var, works locally (.env.local) and on Vercel
  const contractAddr = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  // Form
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [tweetUrl, setTweetUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [action, setAction] = useState<string>('like')
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  // Tasks
  const [tasks, setTasks] = useState<TaskMap>({})
  const [loadingTasks, setLoadingTasks] = useState(false)

  // ── Wallet connection ───────────────────────────────────────
  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!window.ethereum) { alert('Install MetaMask'); return }
    setConnecting(true)
    try {
      const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAddress(accounts[0])
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x107d' }] })
      } catch {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: '0x107d', chainName: 'GenLayer Bradbury Testnet',
          nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
          rpcUrls: ['https://rpc-bradbury.genlayer.com'],
          blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
        }] })
      }
    } catch (e) { console.error(e) } finally { setConnecting(false) }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return
    const h = (a: string[]) => setAddress(a[0] ?? null)
    window.ethereum.on?.('accountsChanged', h)
    return () => { window.ethereum?.removeListener?.('accountsChanged', h) }
  }, [])

  // ── Read tasks ──────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!contractAddr) return
    setLoadingTasks(true)
    try {
      const raw = await publicClient.readContract({
        address: contractAddr as `0x${string}`,
        abi: taskAbi,
        functionName: 'get_all_tasks',
      })
      // GenLayer returns a dict, normalize it
      if (raw && typeof raw === 'object') setTasks(raw as unknown as TaskMap)
    } catch (e) { console.error(e) } finally { setLoadingTasks(false) }
  }, [contractAddr])

  useEffect(() => {
    if (!contractAddr) return
    fetchTasks()
    const i = setInterval(fetchTasks, 8000)
    return () => clearInterval(i)
  }, [contractAddr, fetchTasks])

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !contractAddr || !screenshot) return
    setSubmitting(true)
    try {
      // Upload screenshot
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url: screenshotUrl } = await up.json()
      setUploading(false)

      // Write via MetaMask
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({
        account: address as `0x${string}`,
        address: contractAddr as `0x${string}`,
        abi: taskAbi,
        functionName: 'submit_task',
        args: [tweetUrl, screenshotUrl, handle, action],
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchTasks()
      setScreenshot(null); setTweetUrl(''); setHandle(''); setAction('like')
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }

  // ── Verify ──────────────────────────────────────────────────
  const handleVerify = async (taskId: string) => {
    if (!address || !contractAddr) return
    setVerifying(taskId)
    try {
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({
        account: address as `0x${string}`,
        address: contractAddr as `0x${string}`,
        abi: taskAbi,
        functionName: 'verify',
        args: [taskId],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchTasks()
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setVerifying(null) }
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Verifier</h1>
          <p className="text-sm text-gray-400 mt-1">Verify social actions with AI consensus on GenLayer</p>
        </div>
        <button
          onClick={connectWallet}
          disabled={connecting}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${address ? 'bg-green-900/40 text-green-300 border border-green-700/50' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          {connecting ? 'Connecting...' : address ? `${address.slice(0,6)}...${address.slice(-4)}` : 'Connect Wallet'}
        </button>
      </div>

      {/* Contract not configured warning */}
      {!contractAddr && (
        <div className="mb-6 p-4 bg-red-950/30 border border-red-800/50 rounded-xl">
          <p className="text-red-300 text-sm font-medium">Contract not configured</p>
          <p className="text-red-400/70 text-xs mt-1">
            Set <code className="bg-red-950/50 px-1.5 py-0.5 rounded text-red-300 text-xs">NEXT_PUBLIC_VERIFIER_CONTRACT</code> in
            <code className="bg-red-950/50 px-1.5 py-0.5 rounded text-red-300 text-xs ml-1">.env.local</code> (local) or Vercel Environment Variables (production).
          </p>
        </div>
      )}

      {/* Submit Form */}
      {address && contractAddr && (
        <form onSubmit={handleSubmit} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">New Task</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Screenshot</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setScreenshot(e.target.files?.[0]??null)}
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tweet URL</label>
              <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)} placeholder="https://x.com/username/status/..."
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">X Handle</label>
                <input value={handle} onChange={e => setHandle(e.target.value.replace('@',''))} placeholder="username"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select value={action} onChange={e => setAction(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
                  {ACTION_TYPES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button type="submit" disabled={submitting||!screenshot||!tweetUrl||!handle}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition text-sm">
            {uploading ? 'Uploading...' : submitting ? 'Submitting...' : 'Submit Task'}
          </button>
          {txHash && <p className="mt-2 text-xs text-gray-500 break-all font-mono">Tx: {txHash}</p>}
        </form>
      )}

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Tasks</h2>
          <button onClick={fetchTasks} disabled={loadingTasks}
            className="text-xs text-gray-400 hover:text-gray-200">{loadingTasks?'Loading...':'Refresh'}</button>
        </div>
        {Object.keys(tasks).length===0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No tasks yet. Connect wallet, deploy the contract, and submit one.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(tasks).reverse().map(([id, task]) => (
              <div key={id} className="bg-gray-900/30 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-gray-500">{id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[task.status]??'text-gray-400'}`}>{task.status}</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-300"><span className="text-gray-500">Action: </span><span className="font-medium">{task.action_type}</span><span className="text-gray-500"> by </span><span className="font-medium">@{task.expected_handle}</span></p>
                      <p className="text-gray-400 truncate text-xs">{task.tweet_url}</p>
                      {task.verdict_reason && <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{task.verdict_reason}&rdquo;</p>}
                    </div>
                  </div>
                  {task.status==='pending' && (
                    <button onClick={()=>handleVerify(id)} disabled={verifying===id}
                      className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 text-white text-xs rounded-lg transition font-medium">
                      {verifying===id?'Verifying...':'Verify'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
