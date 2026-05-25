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

// ── Minimal ABI ────────────────────────────────────────────────
const taskAbi = [
  {
    type: 'function', name: 'submit_task',
    inputs: [
      { type: 'string', name: 'tweet_url' },
      { type: 'string', name: 'screenshot_url' },
      { type: 'string', name: 'expected_handle' },
      { type: 'string', name: 'action_type' },
    ],
    stateMutability: 'write',
  },
  {
    type: 'function', name: 'verify',
    inputs: [{ type: 'string', name: 'task_id' }],
    stateMutability: 'write',
  },
  {
    type: 'function', name: 'get_task',
    inputs: [{ type: 'string', name: 'task_id' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'get_all_tasks',
    inputs: [], stateMutability: 'view',
  },
  {
    type: 'function', name: 'get_task_count',
    inputs: [], stateMutability: 'view',
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

const statusConfig: Record<string, { label: string; style: string; dot: string }> = {
  pending:  { label: 'Pending',  style: 'text-amber-300/90 border-amber-500/20 bg-amber-500/8', dot: 'bg-amber-400' },
  verified: { label: 'Verified', style: 'text-emerald-300/90 border-emerald-500/20 bg-emerald-500/8', dot: 'bg-emerald-400' },
  rejected: { label: 'Rejected', style: 'text-red-300/90 border-red-500/20 bg-red-500/8', dot: 'bg-red-400' },
}

// ── Component ──────────────────────────────────────────────────
export default function Home() {
  const contractAddr = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''

  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [tweetUrl, setTweetUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [action, setAction] = useState<string>('like')
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskMap>({})
  const [loadingTasks, setLoadingTasks] = useState(false)

  // ── Wallet ───────────────────────────────────────────────────
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

  // ── Tasks ────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!contractAddr) return
    setLoadingTasks(true)
    try {
      const raw = await publicClient.readContract({
        address: contractAddr as `0x${string}`,
        abi: taskAbi,
        functionName: 'get_all_tasks',
      })
      if (raw && typeof raw === 'object') setTasks(raw as unknown as TaskMap)
    } catch (e) { console.error(e) } finally { setLoadingTasks(false) }
  }, [contractAddr])

  useEffect(() => {
    if (!contractAddr) return
    fetchTasks()
    const i = setInterval(fetchTasks, 8000)
    return () => clearInterval(i)
  }, [contractAddr, fetchTasks])

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !contractAddr || !screenshot) return
    setSubmitting(true)
    try {
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url: screenshotUrl } = await up.json()
      setUploading(false)

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
      setScreenshot(null); setScreenshotPreview(null); setTweetUrl(''); setHandle(''); setAction('like'); setTxHash(null)
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }

  // ── Verify ───────────────────────────────────────────────────
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

  const handleScreenshot = (file: File | undefined) => {
    if (!file) { setScreenshot(null); setScreenshotPreview(null); return }
    setScreenshot(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }

  // ── Total tasks ──────────────────────────────────────────────
  const taskCount = Object.keys(tasks).length

  // ── Render ───────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-canvas">
      {/* ─── Header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-canvas-panel/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <span className="text-[15px] font-medium text-ink tracking-[-0.165px]">Task Verifier</span>
            {contractAddr && (
              <span className="hidden sm:inline text-[11px] font-medium text-ink-faint bg-ink-subtle/10 px-2 py-0.5 rounded-full tracking-normal">
                GenLayer
              </span>
            )}
          </div>
          <button
            onClick={connectWallet}
            disabled={connecting}
            className={`h-8 px-4 rounded-md text-[13px] font-medium transition-all duration-150 ${
              address
                ? 'bg-accent-emerald/10 text-emerald-300 border border-emerald-500/20'
                : 'bg-accent hover:bg-accent-hover text-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.1)]'
            }`}
          >
            {connecting ? 'Connecting…' : address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Connect Wallet'}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* ─── Contract Warning ──────────────────────── */}
        {!contractAddr && (
          <div className="mb-8 p-5 rounded-xl bg-red-500/5 border border-red-500/15">
            <p className="text-[14px] font-medium text-red-300/90">Contract not configured</p>
            <p className="text-[13px] text-red-400/60 mt-1.5 leading-relaxed">
              Set <code className="text-[12px] bg-red-500/10 px-1.5 py-0.5 rounded font-mono text-red-300/80">
              NEXT_PUBLIC_VERIFIER_CONTRACT</code> in <code className="text-[12px] bg-red-500/10 px-1.5 py-0.5 rounded font-mono text-red-300/80">
              .env.local</code> (local) or Vercel Environment Variables.
            </p>
          </div>
        )}

        {/* ─── Hero ──────────────────────────────────── */}
        <div className="mb-10">
          <h1 className="text-[32px] font-normal text-ink leading-[1.13] tracking-[-0.704px]">
            Verify social actions
          </h1>
          <p className="mt-2 text-[16px] text-ink-faint leading-relaxed">
            Submit screenshots of social media tasks. GenLayer&apos;s AI validators cross-reference them against live tweet content to reach consensus.
          </p>
        </div>

        {/* ─── Stats Bar ─────────────────────────────── */}
        {contractAddr && (
          <div className="flex gap-6 mb-8">
            <div>
              <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">Tasks</div>
              <div className="text-[24px] font-normal text-ink leading-tight tracking-[-0.288px]">{taskCount}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">Verified</div>
              <div className="text-[24px] font-normal text-ink leading-tight tracking-[-0.288px]">
                {Object.values(tasks).filter(t => t.status === 'verified').length}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">Pending</div>
              <div className="text-[24px] font-normal text-ink leading-tight tracking-[-0.288px]">
                {Object.values(tasks).filter(t => t.status === 'pending').length}
              </div>
            </div>
          </div>
        )}

        {/* ─── New Task Form ─────────────────────────── */}
        {address && contractAddr && (
          <form onSubmit={handleSubmit} className="mb-10 p-6 rounded-xl bg-ink-subtle/[0.02] border border-border">
            <h2 className="text-[16px] font-semibold text-ink mb-5">New task</h2>

            <div className="grid gap-5">
              {/* Screenshot */}
              <div>
                <label className="block text-[13px] font-medium text-ink-faint mb-2">Screenshot</label>
                <label className={`
                  relative flex flex-col items-center justify-center w-full h-40 rounded-lg border border-dashed cursor-pointer transition-colors
                  ${screenshotPreview
                    ? 'border-border bg-canvas-surface'
                    : 'border-border-subtle hover:border-border bg-ink-subtle/[0.01]'
                  }
                `}>
                  {screenshotPreview ? (
                    <img src={screenshotPreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-lg p-1" />
                  ) : (
                    <div className="text-center">
                      <svg className="mx-auto mb-2 opacity-30" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span className="text-[13px] text-ink-faint/60">Drop screenshot or click to browse</span>
                    </div>
                  )}
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={e => handleScreenshot(e.target.files?.[0])}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
                {screenshotPreview && (
                  <button type="button" onClick={() => handleScreenshot(undefined)}
                    className="mt-2 text-[12px] text-ink-faint/60 hover:text-ink-faint transition-colors">
                    Remove
                  </button>
                )}
              </div>

              {/* Tweet URL */}
              <div>
                <label className="block text-[13px] font-medium text-ink-faint mb-2">Tweet URL</label>
                <input
                  value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                  placeholder="https://x.com/username/status/..."
                  className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors font-mono"
                />
              </div>

              {/* Handle + Action */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-ink-faint mb-2">X Handle</label>
                  <input
                    value={handle} onChange={e => setHandle(e.target.value.replace('@',''))}
                    placeholder="username"
                    className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-ink-faint mb-2">Action</label>
                  <select
                    value={action} onChange={e => setAction(e.target.value)}
                    className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted focus:outline-none focus:border-accent-violet/40 transition-colors appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a8f98' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    {ACTION_TYPES.map(a => (
                      <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting || !screenshot || !tweetUrl || !handle}
              className="mt-6 w-full h-10 bg-accent hover:bg-accent-hover disabled:bg-ink-subtle/[0.06] disabled:text-ink-subtle/30 disabled:cursor-not-allowed text-white text-[14px] font-medium rounded-md transition-colors duration-150 shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.1)]"
            >
              {uploading ? 'Uploading…' : submitting ? 'Submitting…' : 'Submit task'}
            </button>

            {txHash && (
              <p className="mt-3 text-[12px] text-ink-subtle/60 font-mono break-all">
                Tx: {txHash}
              </p>
            )}
          </form>
        )}

        {/* ─── Tasks List ─────────────────────────────── */}
        {contractAddr && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-ink">Tasks</h2>
              <button
                onClick={fetchTasks}
                disabled={loadingTasks}
                className="text-[12px] font-medium text-ink-faint/60 hover:text-ink-faint transition-colors"
              >
                {loadingTasks ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {taskCount === 0 ? (
              <div className="py-16 text-center rounded-xl border border-border-subtle bg-ink-subtle/[0.01]">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-ink-subtle/[0.04] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-faint/30">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <p className="text-[14px] text-ink-faint/50">No tasks yet</p>
                <p className="text-[12px] text-ink-subtle/40 mt-1">Connect your wallet and submit one above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(tasks).reverse().map(([id, task]) => {
                  const sc = statusConfig[task.status] ?? statusConfig.pending
                  return (
                    <div key={id} className="group p-4 rounded-xl bg-ink-subtle/[0.02] border border-border-subtle hover:border-border transition-colors duration-150">
                      <div className="flex items-start gap-4">
                        {/* Status dot */}
                        <div className="mt-0.5 shrink-0">
                          <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Top row */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc.style}`}>
                              {sc.label}
                            </span>
                            <span className="text-[11px] font-medium text-ink-subtle/50 font-mono">{id}</span>
                          </div>

                          {/* Details */}
                          <div className="space-y-1">
                            <p className="text-[14px] text-ink-muted">
                              <span className="font-medium text-ink">{task.action_type}</span>
                              <span className="text-ink-faint/60"> by </span>
                              <span className="font-medium text-ink">@{task.expected_handle}</span>
                            </p>
                            <p className="text-[12px] text-ink-faint/50 truncate font-mono">{task.tweet_url}</p>
                            {task.verdict_reason && (
                              <p className="text-[12px] text-ink-faint/60 mt-1.5 italic leading-relaxed">
                                &ldquo;{task.verdict_reason}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Verify button */}
                        {task.status === 'pending' && (
                          <button
                            onClick={() => handleVerify(id)}
                            disabled={verifying === id}
                            className="shrink-0 h-8 px-3.5 rounded-md text-[12px] font-medium bg-accent-lavender/15 hover:bg-accent-lavender/25 disabled:bg-ink-subtle/[0.06] disabled:text-ink-subtle/30 text-accent-lavender border border-accent-lavender/20 transition-colors"
                          >
                            {verifying === id ? 'Verifying…' : 'Verify'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
