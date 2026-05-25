'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
} from 'viem'

// ── GenLayer Bradbury chain ───────────────────────────────────
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

// ── Contract ABI ───────────────────────────────────────────────
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
type Role = 'project' | 'community'

const ACTION_TYPES = ['like', 'retweet', 'reply', 'post'] as const

const sc: Record<string, { label: string; cls: string; dot: string }> = {
  pending:  { label: 'Pending',  cls: 'text-amber-300/90 border-amber-500/20 bg-amber-500/8',   dot: 'bg-amber-400' },
  verified: { label: 'Verified', cls: 'text-emerald-300/90 border-emerald-500/20 bg-emerald-500/8', dot: 'bg-emerald-400' },
  rejected: { label: 'Rejected', cls: 'text-red-300/90 border-red-500/20 bg-red-500/8',      dot: 'bg-red-400' },
}

// ── Helpers ────────────────────────────────────────────────────
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ── SVG icons (inline for zero deps) ───────────────────────────
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)
const DocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const ImageIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-30">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
)
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

// ── Component ──────────────────────────────────────────────────
export default function Home() {
  const envContract = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''

  const [role, setRole] = useState<Role>('project')
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Project state
  const [projectContract, setProjectContract] = useState(envContract)
  const [projectTasks, setProjectTasks] = useState<TaskMap>({})
  const [projectLoading, setProjectLoading] = useState(false)

  // Community state
  const [communityContract, setCommunityContract] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [tweetUrl, setTweetUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [action, setAction] = useState<string>('like')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [myTasks, setMyTasks] = useState<TaskMap>({})
  const [myTasksLoading, setMyTasksLoading] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)

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

  // ── Project: fetch tasks ─────────────────────────────────────
  const fetchProjectTasks = useCallback(async () => {
    if (!projectContract || !projectContract.startsWith('0x')) return
    setProjectLoading(true)
    try {
      const raw = await publicClient.readContract({
        address: projectContract as `0x${string}`,
        abi: taskAbi, functionName: 'get_all_tasks',
      })
      if (raw && typeof raw === 'object') setProjectTasks(raw as unknown as TaskMap)
    } catch (e) { console.error(e) } finally { setProjectLoading(false) }
  }, [projectContract])

  useEffect(() => {
    if (role !== 'project') return
    fetchProjectTasks()
    const i = setInterval(fetchProjectTasks, 8000)
    return () => clearInterval(i)
  }, [role, fetchProjectTasks])

  // ── Project: verify pending ──────────────────────────────────
  const projectVerify = async (taskId: string) => {
    if (!address || !projectContract) return
    setVerifying(taskId)
    try {
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({
        account: address as `0x${string}`,
        address: projectContract as `0x${string}`,
        abi: taskAbi, functionName: 'verify', args: [taskId],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchProjectTasks()
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setVerifying(null) }
  }

  const projectVerifyAll = async () => {
    const pending = Object.entries(projectTasks).filter(([, t]) => t.status === 'pending')
    for (const [id] of pending) {
      await projectVerify(id)
    }
  }

  // ── Community: fetch my tasks ────────────────────────────────
  const fetchMyTasks = useCallback(async () => {
    if (!communityContract || !communityContract.startsWith('0x') || !address) return
    setMyTasksLoading(true)
    try {
      const raw = await publicClient.readContract({
        address: communityContract as `0x${string}`,
        abi: taskAbi, functionName: 'get_all_tasks',
      })
      if (raw && typeof raw === 'object') {
        const all = raw as unknown as TaskMap
        const mine: TaskMap = {}
        for (const [id, t] of Object.entries(all)) {
          if (t.submitter.toLowerCase() === address.toLowerCase()) mine[id] = t
        }
        setMyTasks(mine)
      }
    } catch (e) { console.error(e) } finally { setMyTasksLoading(false) }
  }, [communityContract, address])

  useEffect(() => {
    if (role !== 'community') return
    fetchMyTasks()
    const i = setInterval(fetchMyTasks, 8000)
    return () => clearInterval(i)
  }, [role, fetchMyTasks])

  // ── Community: submit proof ──────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !communityContract || !screenshot) return
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
        address: communityContract as `0x${string}`,
        abi: taskAbi, functionName: 'submit_task',
        args: [tweetUrl, screenshotUrl, handle, action],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchMyTasks()
      setScreenshot(null); setScreenshotPreview(null); setTweetUrl(''); setHandle(''); setAction('like')
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }

  const handleScreenshot = (file: File | undefined) => {
    if (!file) { setScreenshot(null); setScreenshotPreview(null); return }
    setScreenshot(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }

  // ── Stats ────────────────────────────────────────────────────
  const allTasks = role === 'project' ? projectTasks : myTasks
  const taskCount = Object.keys(allTasks).length
  const verifiedCount = Object.values(allTasks).filter(t => t.status === 'verified').length
  const pendingCount = Object.values(allTasks).filter(t => t.status === 'pending').length
  const taskList = Object.entries(allTasks).reverse()

  // ── Is contract valid? ───────────────────────────────────────
  const projValid = projectContract.startsWith('0x')
  const commValid = communityContract.startsWith('0x')
  const currentValid = role === 'project' ? projValid : commValid

  // ── Render ───────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-canvas">
      {/* ─── Header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-canvas-panel/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
              <ShieldIcon />
            </div>
            <span className="text-[15px] font-medium text-ink tracking-[-0.165px]">Task Verifier</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Role toggle */}
            <div className="flex bg-canvas-surface rounded-md border border-border p-0.5">
              <button
                onClick={() => setRole('project')}
                className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                  role === 'project'
                    ? 'bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
                    : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                Project
              </button>
              <button
                onClick={() => setRole('community')}
                className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                  role === 'community'
                    ? 'bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
                    : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                Community
              </button>
            </div>

            <button
              onClick={connectWallet}
              disabled={connecting}
              className={`h-8 px-4 rounded-md text-[13px] font-medium transition-all duration-150 ${
                address
                  ? 'bg-accent-emerald/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {connecting ? 'Connecting…' : address ? fmtAddr(address) : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ─── PROJECT VIEW ─────────────────────────── */}
        {role === 'project' && (
          <>
            {/* Hero */}
            <div className="mb-8">
              <h1 className="text-[28px] font-semibold text-ink leading-[1.15] tracking-[-0.616px]">
                Project dashboard
              </h1>
              <p className="mt-2 text-[15px] text-ink-faint leading-relaxed max-w-xl">
                Deploy your task-verification contract on GenLayer. Your community submits proof, AI validators verify on-chain.
              </p>
            </div>

            {/* Contract setup */}
            <div className="mb-8 p-5 rounded-xl bg-ink-subtle/[0.02] border border-border">
              <label className="block text-[13px] font-medium text-ink-faint mb-2">
                Contract address
              </label>
              <div className="flex gap-2">
                <input
                  value={projectContract}
                  onChange={e => setProjectContract(e.target.value)}
                  placeholder={envContract ? envContract : '0x…'}
                  className="flex-1 bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors font-mono"
                />
                <button
                  onClick={fetchProjectTasks}
                  className="px-4 py-2 bg-ink-subtle/[0.06] hover:bg-ink-subtle/[0.10] border border-border rounded-md text-[13px] font-medium text-ink-muted transition-colors"
                >
                  Load
                </button>
              </div>
              {!envContract && !projectContract && (
                <p className="mt-2 text-[11px] text-ink-subtle/50">
                  Deploy the contract on GenLayer Bradbury, then paste the address here.{' '}
                  <a href="https://docs.genlayer.com" target="_blank" rel="noopener" className="text-accent-violet/70 hover:text-accent-violet underline underline-offset-2">
                    Docs →
                  </a>
                </p>
              )}
            </div>

            {/* Stats */}
            {projValid && (
              <>
                <div className="flex gap-8 mb-8">
                  {[
                    { label: 'Total', value: taskCount },
                    { label: 'Verified', value: verifiedCount },
                    { label: 'Pending', value: pendingCount },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">{s.label}</div>
                      <div className="text-[24px] font-semibold text-ink leading-tight tracking-[-0.288px]">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Verify all */}
                {pendingCount > 0 && address && (
                  <button
                    onClick={projectVerifyAll}
                    className="mb-6 px-4 py-2 bg-accent-lavender/15 hover:bg-accent-lavender/25 border border-accent-lavender/20 rounded-md text-[13px] font-medium text-accent-lavender transition-colors"
                  >
                    Verify all pending ({pendingCount})
                  </button>
                )}

                {/* Tasks list */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[15px] font-semibold text-ink">Submissions</h2>
                    <button onClick={fetchProjectTasks} disabled={projectLoading}
                      className="text-[12px] font-medium text-ink-faint/60 hover:text-ink-faint transition-colors">
                      {projectLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  {taskCount === 0 ? (
                    <div className="py-16 text-center rounded-xl border border-border-subtle bg-ink-subtle/[0.01]">
                      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-ink-subtle/[0.04] flex items-center justify-center">
                        <DocIcon />
                      </div>
                      <p className="text-[14px] text-ink-faint/50">No submissions yet</p>
                      <p className="text-[12px] text-ink-subtle/40 mt-1">
                        Share your contract address with your community to start receiving submissions.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {taskList.map(([id, task]) => {
                        const cfg = sc[task.status] ?? sc.pending
                        return (
                          <div key={id} className="group p-4 rounded-xl bg-ink-subtle/[0.02] border border-border-subtle hover:border-border transition-colors">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 shrink-0"><div className={`w-2 h-2 rounded-full ${cfg.dot}`} /></div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                                  <span className="text-[11px] font-medium text-ink-subtle/50 font-mono">{id}</span>
                                </div>
                                <p className="text-[14px] text-ink-muted">
                                  <span className="font-medium text-ink">{task.action_type}</span>
                                  <span className="text-ink-faint/60"> by </span>
                                  <span className="font-medium text-ink">@{task.expected_handle}</span>
                                </p>
                                <p className="text-[11px] text-ink-faint/50 mt-0.5 font-mono">
                                  Submitter: {fmtAddr(task.submitter)}
                                </p>
                                <p className="text-[12px] text-ink-faint/50 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                {task.verdict_reason && (
                                  <p className="text-[12px] text-ink-faint/60 mt-1.5 italic leading-relaxed">
                                    &ldquo;{task.verdict_reason}&rdquo;
                                  </p>
                                )}
                              </div>
                              {task.status === 'pending' && (
                                <button onClick={() => projectVerify(id)} disabled={verifying === id}
                                  className="shrink-0 h-8 px-3.5 rounded-md text-[12px] font-medium bg-accent-lavender/15 hover:bg-accent-lavender/25 disabled:bg-ink-subtle/[0.06] disabled:text-ink-subtle/30 text-accent-lavender border border-accent-lavender/20 transition-colors">
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
              </>
            )}
          </>
        )}

        {/* ─── COMMUNITY VIEW ────────────────────────── */}
        {role === 'community' && (
          <>
            {/* Hero */}
            <div className="mb-8">
              <h1 className="text-[28px] font-semibold text-ink leading-[1.15] tracking-[-0.616px]">
                Complete tasks
              </h1>
              <p className="mt-2 text-[15px] text-ink-faint leading-relaxed max-w-xl">
                Enter a project&apos;s contract address, submit proof of completed social tasks, and get verified on-chain.
              </p>
            </div>

            {/* Contract input */}
            <div className="mb-8 p-5 rounded-xl bg-ink-subtle/[0.02] border border-border">
              <label className="block text-[13px] font-medium text-ink-faint mb-2">
                Project contract
              </label>
              <input
                value={communityContract}
                onChange={e => setCommunityContract(e.target.value)}
                placeholder="0x…"
                className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors font-mono"
              />
              <p className="mt-2 text-[11px] text-ink-subtle/50">
                Paste the contract address shared by the project you want to participate in.
              </p>
            </div>

            {commValid && address && (
              <>
                {/* My stats */}
                <div className="flex gap-8 mb-8">
                  {[
                    { label: 'My submissions', value: taskCount },
                    { label: 'Verified', value: verifiedCount },
                    { label: 'Pending', value: pendingCount },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">{s.label}</div>
                      <div className="text-[24px] font-semibold text-ink leading-tight tracking-[-0.288px]">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Submit form */}
                <form onSubmit={handleSubmit} className="mb-10 p-6 rounded-xl bg-ink-subtle/[0.02] border border-border">
                  <h2 className="text-[15px] font-semibold text-ink mb-5">Submit proof</h2>

                  <div className="grid gap-5">
                    {/* Screenshot */}
                    <div>
                      <label className="block text-[13px] font-medium text-ink-faint mb-2">Screenshot</label>
                      <label className={`
                        relative flex flex-col items-center justify-center w-full h-40 rounded-lg border border-dashed cursor-pointer transition-colors
                        ${screenshotPreview ? 'border-border bg-canvas-surface' : 'border-border-subtle hover:border-border bg-ink-subtle/[0.01]'}
                      `}>
                        {screenshotPreview ? (
                          <img src={screenshotPreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-lg p-1" />
                        ) : (
                          <div className="text-center">
                            <div className="mb-2"><ImageIcon /></div>
                            <span className="text-[13px] text-ink-faint/60">Drop screenshot or click</span>
                          </div>
                        )}
                        <input type="file" accept="image/png,image/jpeg,image/webp"
                          onChange={e => handleScreenshot(e.target.files?.[0])}
                          className="absolute inset-0 opacity-0 cursor-pointer" />
                      </label>
                      {screenshotPreview && (
                        <button type="button" onClick={() => handleScreenshot(undefined)}
                          className="mt-2 text-[12px] text-ink-faint/60 hover:text-ink-faint transition-colors">Remove</button>
                      )}
                    </div>

                    {/* Tweet URL */}
                    <div>
                      <label className="block text-[13px] font-medium text-ink-faint mb-2">Tweet URL</label>
                      <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                        placeholder="https://x.com/username/status/..."
                        className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors font-mono" />
                    </div>

                    {/* Handle + Action */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-medium text-ink-faint mb-2">Your X handle</label>
                        <input value={handle} onChange={e => setHandle(e.target.value.replace('@',''))}
                          placeholder="username"
                          className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-subtle/40 focus:outline-none focus:border-accent-violet/40 transition-colors" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-ink-faint mb-2">Action</label>
                        <select value={action} onChange={e => setAction(e.target.value)}
                          className="w-full bg-ink-subtle/[0.04] border border-border rounded-md px-3.5 py-2.5 text-[14px] text-ink-muted focus:outline-none focus:border-accent-violet/40 transition-colors appearance-none cursor-pointer"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a8f98' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                          {ACTION_TYPES.map(a => (
                            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={submitting || !screenshot || !tweetUrl || !handle}
                    className="mt-6 w-full h-10 bg-accent hover:bg-accent-hover disabled:bg-ink-subtle/[0.06] disabled:text-ink-subtle/30 disabled:cursor-not-allowed text-white text-[14px] font-medium rounded-md transition-colors duration-150">
                    {uploading ? 'Uploading…' : submitting ? 'Submitting…' : 'Submit proof'}
                  </button>
                </form>

                {/* My tasks */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[15px] font-semibold text-ink">My submissions</h2>
                    <button onClick={fetchMyTasks} disabled={myTasksLoading}
                      className="text-[12px] font-medium text-ink-faint/60 hover:text-ink-faint transition-colors">
                      {myTasksLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  {taskCount === 0 ? (
                    <div className="py-12 text-center rounded-xl border border-border-subtle bg-ink-subtle/[0.01]">
                      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-ink-subtle/[0.04] flex items-center justify-center">
                        <DocIcon />
                      </div>
                      <p className="text-[14px] text-ink-faint/50">No submissions yet</p>
                      <p className="text-[12px] text-ink-subtle/40 mt-1">Complete a task and submit your proof above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {taskList.map(([id, task]) => {
                        const cfg = sc[task.status] ?? sc.pending
                        return (
                          <div key={id} className="group p-4 rounded-xl bg-ink-subtle/[0.02] border border-border-subtle hover:border-border transition-colors">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 shrink-0"><div className={`w-2 h-2 rounded-full ${cfg.dot}`} /></div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                                  <span className="text-[11px] font-medium text-ink-subtle/50 font-mono">{id}</span>
                                </div>
                                <p className="text-[14px] text-ink-muted">
                                  <span className="font-medium text-ink">{task.action_type}</span>
                                  <span className="text-ink-faint/60"> by </span>
                                  <span className="font-medium text-ink">@{task.expected_handle}</span>
                                </p>
                                <p className="text-[12px] text-ink-faint/50 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                {task.verdict_reason && (
                                  <p className="text-[12px] text-ink-faint/60 mt-1.5 italic leading-relaxed">
                                    &ldquo;{task.verdict_reason}&rdquo;
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            {commValid && !address && (
              <div className="py-16 text-center rounded-xl border border-border-subtle bg-ink-subtle/[0.01]">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-ink-subtle/[0.04] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-faint/30">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <p className="text-[15px] text-ink-faint/60 font-medium">Connect your wallet</p>
                <p className="text-[12px] text-ink-subtle/40 mt-1">You need to connect to submit proof and track your tasks.</p>
              </div>
            )}
          </>
        )}

        {/* ─── Footer ─────────────────────────────────── */}
        <div className="mt-16 pt-8 border-t border-border-subtle text-center">
          <p className="text-[11px] text-ink-subtle/40">
            Built on <a href="https://genlayer.com" target="_blank" rel="noopener" className="text-accent-violet/60 hover:text-accent-violet underline underline-offset-2">GenLayer</a>
            <span className="mx-2">·</span>
            AI-powered verification
          </p>
        </div>
      </div>
    </main>
  )
}
