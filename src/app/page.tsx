'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  blockExplorers: { default: { name: 'Bradbury Explorer', url: 'https://explorer-bradbury.genlayer.com' } },
  testnet: true,
})

const publicClient = createPublicClient({ chain: bradbury, transport: http() })

// ── Contract ABI ───────────────────────────────────────────────
const taskAbi = [
  { type: 'function', name: 'submit_task', inputs: [
    { type: 'string', name: 'tweet_url' }, { type: 'string', name: 'screenshot_url' },
    { type: 'string', name: 'expected_handle' }, { type: 'string', name: 'action_type' },
  ], stateMutability: 'write' },
  { type: 'function', name: 'verify', inputs: [{ type: 'string', name: 'task_id' }], stateMutability: 'write' },
  { type: 'function', name: 'get_task', inputs: [{ type: 'string', name: 'task_id' }], stateMutability: 'view' },
  { type: 'function', name: 'get_all_tasks', inputs: [], stateMutability: 'view' },
  { type: 'function', name: 'get_task_count', inputs: [], stateMutability: 'view' },
] as const

// ── Types ──────────────────────────────────────────────────────
type TaskData = { submitter: string; tweet_url: string; screenshot_url: string; expected_handle: string; action_type: string; status: string; verdict_reason: string; timestamp: string }
type TaskMap = Record<string, TaskData>
type Role = 'project' | 'community'
const ACTIONS = ['like', 'retweet', 'reply', 'post'] as const

const statusRing: Record<string, string> = {
  pending:  'ring-warning/20',
  verified: 'ring-success/20',
  rejected: 'ring-danger/20',
}

const statusCfg: Record<string, { label: string; dot: string; badge: string }> = {
  pending:  { label: 'Pending',  dot: 'bg-warning',          badge: 'text-warning border-warning-border/40 bg-warning-muted' },
  verified: { label: 'Verified', dot: 'bg-success',          badge: 'text-success border-success-border/40 bg-success-muted' },
  rejected: { label: 'Rejected', dot: 'bg-danger',           badge: 'text-danger border-danger-border/40 bg-danger-muted' },
}

const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ── Inline SVG icons ───────────────────────────────────────────
const Logo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
  </svg>
)
const WalletIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="16" y1="12" x2="16" y2="12.01" strokeWidth="3" strokeLinecap="round"/>
  </svg>
)
const FileSearch = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-dim">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <circle cx="11.5" cy="14.5" r="2.5"/><line x1="13.5" y1="16.5" x2="16" y2="19"/>
  </svg>
)
const UploadCloud = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-dim">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>
)
const CheckBadge = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
  </svg>
)

// ── Component ──────────────────────────────────────────────────
export default function Home() {
  const envContract = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''

  const [role, setRole] = useState<Role>('project')
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [viewKey, setViewKey] = useState(0) // triggers animation

  // Project
  const [projContract, setProjContract] = useState(envContract)
  const [projTasks, setProjTasks] = useState<TaskMap>({})
  const [projLoading, setProjLoading] = useState(false)

  // Community
  const [commContract, setCommContract] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tweetUrl, setTweetUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [action, setAction] = useState<string>('like')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [myTasks, setMyTasks] = useState<TaskMap>({})
  const [myLoading, setMyLoading] = useState(false)
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

  const switchRole = (r: Role) => { setRole(r); setViewKey(v => v + 1) }

  // ── Fetch helpers ────────────────────────────────────────────
  const readAllTasks = async (addr: string) => {
    const raw = await publicClient.readContract({
      address: addr as `0x${string}`, abi: taskAbi, functionName: 'get_all_tasks',
    })
    return (raw && typeof raw === 'object') ? (raw as unknown as TaskMap) : {}
  }

  // ── Project: fetch ───────────────────────────────────────────
  const fetchProj = useCallback(async () => {
    if (!projContract.startsWith('0x')) return
    setProjLoading(true)
    try { setProjTasks(await readAllTasks(projContract)) } catch (e) { console.error(e) } finally { setProjLoading(false) }
  }, [projContract])

  useEffect(() => { if (role === 'project') { fetchProj(); const i = setInterval(fetchProj, 8000); return () => clearInterval(i) } }, [role, fetchProj])

  // ── Project: verify ──────────────────────────────────────────
  const verifyOne = async (taskId: string) => {
    if (!address || !projContract) return
    setVerifying(taskId)
    try {
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({
        account: address as `0x${string}`, address: projContract as `0x${string}`, abi: taskAbi, functionName: 'verify', args: [taskId],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchProj()
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setVerifying(null) }
  }

  const verifyAll = async () => {
    const pending = Object.entries(projTasks).filter(([, t]) => t.status === 'pending')
    for (const [id] of pending) await verifyOne(id)
  }

  // ── Community: fetch my tasks ────────────────────────────────
  const fetchMy = useCallback(async () => {
    if (!commContract.startsWith('0x') || !address) return
    setMyLoading(true)
    try {
      const all = await readAllTasks(commContract)
      const mine: TaskMap = {}
      for (const [id, t] of Object.entries(all)) {
        if (t.submitter.toLowerCase() === address.toLowerCase()) mine[id] = t
      }
      setMyTasks(mine)
    } catch (e) { console.error(e) } finally { setMyLoading(false) }
  }, [commContract, address])

  useEffect(() => { if (role === 'community') { fetchMy(); const i = setInterval(fetchMy, 8000); return () => clearInterval(i) } }, [role, fetchMy])

  // ── Community: submit ────────────────────────────────────────
  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !commContract || !screenshot) return
    setSubmitting(true)
    try {
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await up.json()
      setUploading(false)

      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({
        account: address as `0x${string}`, address: commContract as `0x${string}`, abi: taskAbi,
        functionName: 'submit_task', args: [tweetUrl, url, handle, action],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchMy()
      setScreenshot(null); setPreview(null); setTweetUrl(''); setHandle(''); setAction('like')
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }

  const handleFile = (file: File | undefined) => {
    if (!file) { setScreenshot(null); setPreview(null); return }
    setScreenshot(file); setPreview(URL.createObjectURL(file))
  }

  // ── Data ─────────────────────────────────────────────────────
  const tasks = role === 'project' ? projTasks : myTasks
  const taskCount = Object.keys(tasks).length
  const verifiedN = Object.values(tasks).filter(t => t.status === 'verified').length
  const pendingN = Object.values(tasks).filter(t => t.status === 'pending').length
  const taskList = Object.entries(tasks).reverse()

  // ── Render ───────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-canvas selection:bg-brand-glow/30">
      {/* ═══════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-canvas-panel/70 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Left: brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-white">
              <Logo />
            </div>
            <span className="text-[15px] font-medium text-ink tracking-tight">Task Verifier</span>
          </div>

          {/* Center: role toggle */}
          <div className="flex bg-canvas-surface rounded-lg border border-white/[0.06] p-0.5 shadow-sm">
            {(['project', 'community'] as const).map(r => (
              <button key={r} onClick={() => switchRole(r)}
                className={`relative px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200 ${
                  role === r ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {role === r && (
                  <span className="absolute inset-1 bg-canvas-raised rounded shadow-sm border border-white/[0.06]" />
                )}
                <span className="relative z-10">{r === 'project' ? 'Project' : 'Community'}</span>
              </button>
            ))}
          </div>

          {/* Right: wallet */}
          <button onClick={connectWallet} disabled={connecting}
            className={`h-8 px-4 rounded-lg text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5 ${
              address
                ? 'bg-success-muted text-success border border-success-border/30 shadow-sm'
                : 'bg-brand hover:bg-brand-hover text-white shadow-glow'
            }`}
          >
            {connecting ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <WalletIcon />
            )}
            <span>{connecting ? 'Connecting…' : address ? fmtAddr(address) : 'Connect'}</span>
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          CONTENT
      ═══════════════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
        {/* ═══ PROJECT VIEW ═══════════════════════════════ */}
        {role === 'project' && (
          <div key={viewKey} className="animate-fade-in">
            {/* Hero */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-glow/20 border border-brand/15 text-brand text-[12px] font-medium mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                Project dashboard
              </div>
              <h1 className="text-[32px] font-light text-ink leading-[1.12] tracking-[-0.64px]">
                Manage your verifications
              </h1>
              <p className="mt-2.5 text-[15px] text-ink-faint leading-relaxed max-w-lg">
                Deploy a task-verification contract on GenLayer. Your community submits proof, and AI validators reach consensus on-chain.
              </p>
            </div>

            {/* Contract card */}
            <div className="mb-10 p-5 rounded-2xl bg-canvas-panel border border-white/[0.06] shadow-card">
              <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-3">
                Contract address
              </label>
              <div className="flex gap-2">
                <input
                  value={projContract} onChange={e => setProjContract(e.target.value)}
                  placeholder={envContract || '0x…'}
                  className="flex-1 bg-canvas border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-dim/50 font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200"
                />
                <button onClick={fetchProj}
                  className="px-5 py-2.5 bg-canvas-surface hover:bg-canvas-raised border border-white/[0.08] rounded-lg text-[13px] font-medium text-ink-muted transition-all duration-200">
                  Load
                </button>
              </div>
              {!envContract && !projContract && (
                <p className="mt-3 text-[12px] text-ink-dim">
                  Deploy on GenLayer Bradbury, then paste the address.{' '}
                  <a href="https://docs.genlayer.com" target="_blank" rel="noopener" className="text-brand/70 hover:text-brand underline underline-offset-2">Docs →</a>
                </p>
              )}
            </div>

            {/* Dashboard */}
            {projContract.startsWith('0x') && (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Submissions', value: taskCount },
                    { label: 'Verified', value: verifiedN },
                    { label: 'Pending', value: pendingN },
                  ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-canvas-panel border border-white/[0.05] shadow-sm">
                      <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-1">{s.label}</div>
                      <div className="text-[28px] font-light text-ink tracking-[-0.56px]">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Verify all */}
                {pendingN > 0 && address && (
                  <button onClick={verifyAll}
                    className="mb-8 px-5 py-2.5 bg-brand-glow/20 hover:bg-brand-glow/30 border border-brand/20 rounded-lg text-[13px] font-medium text-brand transition-all duration-200">
                    Verify all pending ({pendingN})
                  </button>
                )}

                {/* Tasks */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[16px] font-medium text-ink">Submissions</h2>
                    <button onClick={fetchProj} disabled={projLoading}
                      className="text-[12px] font-medium text-ink-dim hover:text-ink-faint transition-colors">
                      {projLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {taskCount === 0 ? (
                    <div className="py-20 text-center rounded-2xl border border-white/[0.04] bg-canvas-panel/50 shadow-sm">
                      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-canvas-surface flex items-center justify-center shadow-sm">
                        <FileSearch />
                      </div>
                      <h3 className="text-[16px] font-medium text-ink-muted mb-1">No submissions yet</h3>
                      <p className="text-[13px] text-ink-dim max-w-sm mx-auto leading-relaxed">
                        Share your contract address with your community. Submissions appear here in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {taskList.map(([id, task]) => {
                        const cfg = statusCfg[task.status] ?? statusCfg.pending
                        return (
                          <article key={id}
                            className="group p-5 rounded-2xl bg-canvas-panel border border-white/[0.05] shadow-card hover:shadow-card-hover transition-all duration-300"
                          >
                            <div className="flex items-start gap-4">
                              <div className="mt-1 shrink-0">
                                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ${statusRing[task.status]}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-[11px] font-medium text-ink-dim font-mono">{id}</span>
                                </div>
                                <p className="text-[14px] text-ink-muted leading-relaxed">
                                  <span className="font-medium text-ink capitalize">{task.action_type}</span>
                                  <span className="text-ink-faint/60"> by </span>
                                  <span className="font-medium text-ink">@{task.expected_handle}</span>
                                </p>
                                <p className="text-[11px] text-ink-dim mt-1 font-mono">
                                  Submitter: {fmtAddr(task.submitter)}
                                </p>
                                <p className="text-[12px] text-ink-dim truncate font-mono mt-0.5 opacity-60">
                                  {task.tweet_url}
                                </p>
                                {task.verdict_reason && (
                                  <div className="mt-3 p-3 rounded-lg bg-canvas border border-white/[0.04]">
                                    <p className="text-[12px] text-ink-faint/70 italic leading-relaxed">
                                      &ldquo;{task.verdict_reason}&rdquo;
                                    </p>
                                  </div>
                                )}
                              </div>
                              {task.status === 'pending' && (
                                <button onClick={() => verifyOne(id)} disabled={verifying === id}
                                  className="shrink-0 h-9 px-4 rounded-lg text-[12px] font-medium bg-brand-glow/15 hover:bg-brand-glow/25 disabled:bg-canvas-surface disabled:text-ink-dim/40 text-brand border border-brand/15 transition-all duration-200">
                                  {verifying === id ? 'Verifying…' : 'Verify'}
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* ═══ COMMUNITY VIEW ═══════════════════════════ */}
        {role === 'community' && (
          <div key={viewKey} className="animate-fade-in">
            {/* Hero */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success-muted/60 border border-success/20 text-success text-[12px] font-medium mb-5">
                <CheckBadge />
                Community
              </div>
              <h1 className="text-[32px] font-light text-ink leading-[1.12] tracking-[-0.64px]">
                Complete tasks, get verified
              </h1>
              <p className="mt-2.5 text-[15px] text-ink-faint leading-relaxed max-w-lg">
                Enter a project&apos;s contract address, submit proof of completed social tasks, and earn on-chain verification.
              </p>
            </div>

            {/* Contract input */}
            <div className="mb-10 p-5 rounded-2xl bg-canvas-panel border border-white/[0.06] shadow-card">
              <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-3">
                Project contract
              </label>
              <input
                value={commContract} onChange={e => setCommContract(e.target.value)}
                placeholder="Paste the contract address shared by the project…"
                className="w-full bg-canvas border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-dim/50 font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200"
              />
            </div>

            {commContract.startsWith('0x') && (
              <>
                {/* Connected + wallet guard */}
                {!address ? (
                  <div className="py-20 text-center rounded-2xl border border-white/[0.04] bg-canvas-panel/50 shadow-sm">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-canvas-surface flex items-center justify-center shadow-sm">
                      <WalletIcon />
                    </div>
                    <h3 className="text-[16px] font-medium text-ink-muted mb-1">Connect your wallet</h3>
                    <p className="text-[13px] text-ink-dim">Connect to submit proof and track your verifications.</p>
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      {[
                        { label: 'Submitted', value: taskCount },
                        { label: 'Verified', value: verifiedN },
                        { label: 'Pending', value: pendingN },
                      ].map(s => (
                        <div key={s.label} className="p-4 rounded-xl bg-canvas-panel border border-white/[0.05] shadow-sm">
                          <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-widest mb-1">{s.label}</div>
                          <div className="text-[28px] font-light text-ink tracking-[-0.56px]">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Submit form */}
                    <form onSubmit={submitProof} className="mb-12 p-6 rounded-2xl bg-canvas-panel border border-white/[0.06] shadow-card">
                      <h2 className="text-[16px] font-medium text-ink mb-6">Submit proof</h2>

                      <div className="grid gap-5">
                        {/* Screenshot */}
                        <div>
                          <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-2.5">
                            Screenshot
                          </label>
                          <label className={`
                            relative flex flex-col items-center justify-center w-full h-44 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200
                            ${preview
                              ? 'border-brand/20 bg-canvas-surface'
                              : 'border-white/[0.06] hover:border-white/[0.12] bg-canvas'
                            }
                          `}>
                            {preview ? (
                              <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-xl p-2" />
                            ) : (
                              <div className="text-center">
                                <div className="mb-2"><UploadCloud /></div>
                                <span className="text-[13px] text-ink-dim">Drop screenshot or click to browse</span>
                                <span className="block text-[11px] text-ink-dim/60 mt-1">PNG, JPEG, WebP</span>
                              </div>
                            )}
                            <input type="file" accept="image/png,image/jpeg,image/webp"
                              onChange={e => handleFile(e.target.files?.[0])}
                              className="absolute inset-0 opacity-0 cursor-pointer" />
                          </label>
                          {preview && (
                            <button type="button" onClick={() => handleFile(undefined)}
                              className="mt-2 text-[12px] text-ink-dim hover:text-ink-faint transition-colors">Remove</button>
                          )}
                        </div>

                        {/* Tweet URL */}
                        <div>
                          <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-2.5">Tweet URL</label>
                          <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                            placeholder="https://x.com/username/status/…"
                            className="w-full bg-canvas border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-dim/50 font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
                        </div>

                        {/* Handle + Action */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-2.5">Your handle</label>
                            <input value={handle} onChange={e => setHandle(e.target.value.replace('@',''))}
                              placeholder="username"
                              className="w-full bg-canvas border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-ink-muted placeholder:text-ink-dim/50 focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-ink-faint uppercase tracking-wider mb-2.5">Action</label>
                            <select value={action} onChange={e => setAction(e.target.value)}
                              className="w-full bg-canvas border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-ink-muted focus:border-brand/40 focus:shadow-ring transition-all duration-200 appearance-none cursor-pointer"
                              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238b8f9a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                            >
                              {ACTIONS.map(a => (
                                <option key={a} value={a} className="bg-canvas-panel text-ink-muted">{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <button type="submit" disabled={submitting || !screenshot || !tweetUrl || !handle}
                        className="mt-6 w-full h-11 bg-brand hover:bg-brand-hover disabled:bg-canvas-surface disabled:text-ink-dim/30 disabled:cursor-not-allowed disabled:shadow-none text-white text-[14px] font-medium rounded-lg shadow-glow transition-all duration-200">
                        {uploading ? 'Uploading screenshot…' : submitting ? 'Confirming on-chain…' : 'Submit proof'}
                      </button>
                    </form>

                    {/* My tasks */}
                    <section>
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-[16px] font-medium text-ink">My submissions</h2>
                        <button onClick={fetchMy} disabled={myLoading}
                          className="text-[12px] font-medium text-ink-dim hover:text-ink-faint transition-colors">
                          {myLoading ? 'Refreshing…' : 'Refresh'}
                        </button>
                      </div>

                      {taskCount === 0 ? (
                        <div className="py-16 text-center rounded-2xl border border-white/[0.04] bg-canvas-panel/50 shadow-sm">
                          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-canvas-surface flex items-center justify-center shadow-sm">
                            <FileSearch />
                          </div>
                          <h3 className="text-[16px] font-medium text-ink-muted mb-1">No submissions yet</h3>
                          <p className="text-[13px] text-ink-dim">Complete a task and submit your proof above.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {taskList.map(([id, task]) => {
                            const cfg = statusCfg[task.status] ?? statusCfg.pending
                            return (
                              <article key={id}
                                className="group p-5 rounded-2xl bg-canvas-panel border border-white/[0.05] shadow-card hover:shadow-card-hover transition-all duration-300"
                              >
                                <div className="flex items-start gap-4">
                                  <div className="mt-1 shrink-0">
                                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ${statusRing[task.status]}`} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>
                                        {cfg.label}
                                      </span>
                                      <span className="text-[11px] font-medium text-ink-dim font-mono">{id}</span>
                                    </div>
                                    <p className="text-[14px] text-ink-muted leading-relaxed">
                                      <span className="font-medium text-ink capitalize">{task.action_type}</span>
                                      <span className="text-ink-faint/60"> by </span>
                                      <span className="font-medium text-ink">@{task.expected_handle}</span>
                                    </p>
                                    <p className="text-[12px] text-ink-dim truncate font-mono mt-0.5 opacity-60">
                                      {task.tweet_url}
                                    </p>
                                    {task.verdict_reason && (
                                      <div className="mt-3 p-3 rounded-lg bg-canvas border border-white/[0.04]">
                                        <p className="text-[12px] text-ink-faint/70 italic leading-relaxed">
                                          &ldquo;{task.verdict_reason}&rdquo;
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-ink-dim">
            <span className="w-4 h-4 rounded bg-brand/20 flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-brand">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </span>
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-4 text-[12px] text-ink-dim">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-ink-faint transition-colors">GenLayer</a>
            <span className="text-white/[0.08]">·</span>
            <a href="https://docs.genlayer.com" target="_blank" rel="noopener" className="hover:text-ink-faint transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
