'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  createPublicClient, createWalletClient, custom, http, defineChain,
} from 'viem'

const bradbury = defineChain({
  id: 4221, name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } },
  blockExplorers: { default: { name: 'Bradbury Explorer', url: 'https://explorer-bradbury.genlayer.com' } },
  testnet: true,
})
const publicClient = createPublicClient({ chain: bradbury, transport: http() })

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

type TaskData = { submitter: string; tweet_url: string; screenshot_url: string; expected_handle: string; action_type: string; status: string; verdict_reason: string; timestamp: string }
type TaskMap = Record<string, TaskData>
type Role = 'project' | 'community'
const ACTIONS = ['like', 'retweet', 'reply', 'post'] as const

const sc: Record<string, { label: string; dot: string; badge: string; icon: string }> = {
  pending:  { label: 'Pending',  dot: 'bg-warning',          badge: 'text-amber-700 bg-warning-soft border-warning-border', icon: '⏳' },
  verified: { label: 'Verified', dot: 'bg-success',          badge: 'text-emerald-700 bg-success-soft border-success-border', icon: '✅' },
  rejected: { label: 'Rejected', dot: 'bg-danger',           badge: 'text-red-700 bg-danger-soft border-danger-border', icon: '❌' },
}

const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ── Inline icons ───────────────────────────────────────────────
const Sparkle = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="M19 16l-.5 2L21 19l-2.5.5L18 22l-.5-2.5L15 19l2.5-.5z"/>
  </svg>
)
const Zap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)
const ShieldCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
  </svg>
)
const FileSearch = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-brand/30">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="14.5" r="2.5"/><line x1="13.5" y1="16.5" x2="16" y2="19"/>
  </svg>
)
const Trophy = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-brand/30">
    <path d="M6 9H4.5A2.5 2.5 0 0 1 2 6.5v0A2.5 2.5 0 0 1 4.5 4H6"/><path d="M18 9h1.5A2.5 2.5 0 0 0 22 6.5v0A2.5 2.5 0 0 0 19.5 4H18"/><path d="M6 4h12v3a6 6 0 0 1-12 0V4z"/><path d="M12 4v7"/><path d="M9 20h6"/><path d="M12 17v3"/>
  </svg>
)

// ── Component ──────────────────────────────────────────────────
export default function Home() {
  const envContract = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''

  const [role, setRole] = useState<Role>('project')
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [viewKey, setViewKey] = useState(0)

  const [projContract, setProjContract] = useState(envContract)
  const [projTasks, setProjTasks] = useState<TaskMap>({})
  const [projLoading, setProjLoading] = useState(false)

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

  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) { alert('Install MetaMask'); return }
    setConnecting(true)
    try {
      const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAddress(accounts[0])
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x107d' }] }) } catch {
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

  const readAll = async (addr: string) => {
    const raw = await publicClient.readContract({ address: addr as `0x${string}`, abi: taskAbi, functionName: 'get_all_tasks' })
    return (raw && typeof raw === 'object') ? (raw as unknown as TaskMap) : {}
  }

  const fetchProj = useCallback(async () => {
    if (!projContract.startsWith('0x')) return
    setProjLoading(true)
    try { setProjTasks(await readAll(projContract)) } catch (e) { console.error(e) } finally { setProjLoading(false) }
  }, [projContract])
  useEffect(() => { if (role === 'project') { fetchProj(); const i = setInterval(fetchProj, 8000); return () => clearInterval(i) } }, [role, fetchProj])

  const verifyOne = async (taskId: string) => {
    if (!address || !projContract) return
    setVerifying(taskId)
    try {
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({ account: address as `0x${string}`, address: projContract as `0x${string}`, abi: taskAbi, functionName: 'verify', args: [taskId] })
      await publicClient.waitForTransactionReceipt({ hash }); await fetchProj()
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setVerifying(null) }
  }
  const verifyAll = async () => { for (const [id] of Object.entries(projTasks).filter(([, t]) => t.status === 'pending')) await verifyOne(id) }

  const fetchMy = useCallback(async () => {
    if (!commContract.startsWith('0x') || !address) return
    setMyLoading(true)
    try {
      const all = await readAll(commContract)
      const mine: TaskMap = {}
      for (const [id, t] of Object.entries(all)) { if (t.submitter.toLowerCase() === address.toLowerCase()) mine[id] = t }
      setMyTasks(mine)
    } catch (e) { console.error(e) } finally { setMyLoading(false) }
  }, [commContract, address])
  useEffect(() => { if (role === 'community') { fetchMy(); const i = setInterval(fetchMy, 8000); return () => clearInterval(i) } }, [role, fetchMy])

  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !commContract || !screenshot) return
    setSubmitting(true)
    try {
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await up.json(); setUploading(false)
      const wc = createWalletClient({ chain: bradbury, transport: custom(window.ethereum!) })
      const hash = await wc.writeContract({ account: address as `0x${string}`, address: commContract as `0x${string}`, abi: taskAbi, functionName: 'submit_task', args: [tweetUrl, url, handle, action] })
      await publicClient.waitForTransactionReceipt({ hash }); await fetchMy()
      setScreenshot(null); setPreview(null); setTweetUrl(''); setHandle(''); setAction('like')
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }
  const handleFile = (file: File | undefined) => { if (!file) { setScreenshot(null); setPreview(null); return }; setScreenshot(file); setPreview(URL.createObjectURL(file)) }

  const tasks = role === 'project' ? projTasks : myTasks
  const total = Object.keys(tasks).length
  const verifiedN = Object.values(tasks).filter(t => t.status === 'verified').length
  const pendingN = Object.values(tasks).filter(t => t.status === 'pending').length
  const taskList = Object.entries(tasks).reverse()

  return (
    <main className="min-h-screen bg-canvas">
      {/* ═══════ HEADER ══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center text-white shadow-glow">
              <Zap />
            </div>
            <span className="text-[16px] font-semibold text-ink tracking-tight">Task Verifier</span>
          </div>

          <div className="flex bg-canvas-raised rounded-xl border border-black/[0.06] p-1">
            {(['project', 'community'] as const).map(r => (
              <button key={r} onClick={() => switchRole(r)}
                className={`relative px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                  role === r ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
                }`}>
                {role === r && <span className="absolute inset-1 bg-white rounded-md shadow-sm border border-black/[0.06]" />}
                <span className="relative z-10">{r === 'project' ? 'Project' : 'Community'}</span>
              </button>
            ))}
          </div>

          <button onClick={connectWallet} disabled={connecting}
            className={`h-9 px-4 rounded-xl text-[13px] font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              address
                ? 'bg-success-soft text-emerald-700 border border-success-border shadow-sm'
                : 'bg-brand-gradient text-white shadow-glow hover:shadow-xl hover:scale-[1.02]'
            }`}>
            {connecting ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : address ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />{fmtAddr(address)}</>
            ) : (
              <>Connect</>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
        {/* ═══ PROJECT ═══════════════════════════════════════ */}
        {role === 'project' && (
          <div key={viewKey} className="animate-fade-in">
            <div className="relative mb-10 p-8 rounded-3xl bg-white border border-black/[0.05] shadow-card overflow-hidden">
              <div className="absolute inset-0 bg-hero-glow" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-soft border border-brand/15 text-brand text-[12px] font-semibold mb-4">
                  <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />For Projects
                </div>
                <h1 className="text-[34px] font-bold text-ink leading-[1.1] tracking-[-0.68px]">
                  Manage verifications
                </h1>
                <p className="mt-2 text-[16px] text-ink-faint leading-relaxed max-w-lg">
                  Deploy a contract, share it with your community, and let <span className="text-brand font-semibold">GenLayer AI</span> validate every submission on-chain.
                </p>
              </div>
            </div>

            <div className="mb-10 p-6 rounded-2xl bg-white border border-black/[0.05] shadow-card">
              <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-3">Contract address</label>
              <div className="flex gap-2">
                <input value={projContract} onChange={e => setProjContract(e.target.value)}
                  placeholder={envContract || '0x…'}
                  className="flex-1 bg-canvas border border-black/[0.08] rounded-xl px-4 py-3 text-[14px] text-ink-muted placeholder:text-ink-subtle font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
                <button onClick={fetchProj}
                  className="px-5 py-3 bg-brand-soft hover:bg-brand/10 border border-brand/15 rounded-xl text-[13px] font-semibold text-brand transition-all duration-200">
                  Load
                </button>
              </div>
            </div>

            {projContract.startsWith('0x') && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Submissions', value: total, color: 'text-brand', bg: 'bg-brand-soft' },
                    { label: 'Verified', value: verifiedN, color: 'text-emerald-600', bg: 'bg-success-soft' },
                    { label: 'Pending', value: pendingN, color: 'text-amber-600', bg: 'bg-warning-soft' },
                  ].map(s => (
                    <div key={s.label} className="p-5 rounded-2xl bg-white border border-black/[0.05] shadow-card">
                      <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                        <div className={`w-2 h-2 rounded-full ${s.color.replace('text-', 'bg-')}`} />
                      </div>
                      <div className="text-[11px] font-semibold text-ink-subtle uppercase tracking-widest">{s.label}</div>
                      <div className={`text-[30px] font-bold ${s.color} tracking-[-0.6px] mt-0.5`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {pendingN > 0 && address && (
                  <button onClick={verifyAll}
                    className="mb-8 px-6 py-3 bg-brand-gradient hover:opacity-90 text-white text-[13px] font-semibold rounded-xl shadow-glow transition-all duration-200">
                    ⚡ Verify all pending ({pendingN})
                  </button>
                )}

                <section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[18px] font-bold text-ink">Submissions</h2>
                    <button onClick={fetchProj} disabled={projLoading}
                      className="text-[12px] font-semibold text-ink-subtle hover:text-ink-faint transition-colors">
                      {projLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {total === 0 ? (
                    <div className="py-20 text-center rounded-3xl bg-white border border-black/[0.04] shadow-card">
                      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-soft flex items-center justify-center">
                        <FileSearch />
                      </div>
                      <h3 className="text-[17px] font-bold text-ink mb-1.5">Waiting for submissions</h3>
                      <p className="text-[14px] text-ink-faint max-w-sm mx-auto leading-relaxed">
                        Share your contract with your community. Submissions appear here in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {taskList.map(([id, task]) => {
                        const cfg = sc[task.status] ?? sc.pending
                        return (
                          <article key={id} className="group p-5 rounded-2xl bg-white border border-black/[0.04] shadow-card hover:shadow-card-hover transition-all duration-300">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 text-xl">{cfg.icon}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                                  <span className="text-[11px] font-semibold text-ink-subtle font-mono">{id}</span>
                                </div>
                                <p className="text-[14px] text-ink-muted">
                                  <span className="font-semibold text-ink capitalize">{task.action_type}</span>
                                  <span className="text-ink-faint"> by </span>
                                  <span className="font-semibold text-ink">@{task.expected_handle}</span>
                                </p>
                                <p className="text-[11px] text-ink-subtle mt-1 font-mono">by {fmtAddr(task.submitter)}</p>
                                <p className="text-[12px] text-ink-subtle/70 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                {task.verdict_reason && (
                                  <div className="mt-3 p-3 rounded-xl bg-canvas border border-black/[0.04]">
                                    <p className="text-[13px] text-ink-faint italic leading-relaxed">&ldquo;{task.verdict_reason}&rdquo;</p>
                                  </div>
                                )}
                              </div>
                              {task.status === 'pending' && (
                                <button onClick={() => verifyOne(id)} disabled={verifying === id}
                                  className="shrink-0 h-9 px-4 rounded-xl text-[12px] font-semibold bg-brand-soft hover:bg-brand/10 disabled:bg-gray-100 disabled:text-ink-subtle/40 text-brand border border-brand/15 transition-all duration-200">
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

        {/* ═══ COMMUNITY ════════════════════════════════════ */}
        {role === 'community' && (
          <div key={viewKey} className="animate-fade-in">
            <div className="relative mb-10 p-8 rounded-3xl bg-white border border-black/[0.05] shadow-card overflow-hidden">
              <div className="absolute inset-0 bg-hero-glow" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-soft border border-success/20 text-emerald-700 text-[12px] font-semibold mb-4">
                  <ShieldCheck />For Community
                </div>
                <h1 className="text-[34px] font-bold text-ink leading-[1.1] tracking-[-0.68px]">
                  Get verified on-chain
                </h1>
                <p className="mt-2 text-[16px] text-ink-faint leading-relaxed max-w-lg">
                  Complete social tasks, submit proof, and earn <span className="text-brand font-semibold">verified status</span> powered by AI consensus.
                </p>
              </div>
            </div>

            <div className="mb-10 p-6 rounded-2xl bg-white border border-black/[0.05] shadow-card">
              <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-3">Project contract</label>
              <input value={commContract} onChange={e => setCommContract(e.target.value)}
                placeholder="Paste the contract address shared by the project…"
                className="w-full bg-canvas border border-black/[0.08] rounded-xl px-4 py-3 text-[14px] text-ink-muted placeholder:text-ink-subtle font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
            </div>

            {commContract.startsWith('0x') && (
              !address ? (
                <div className="py-20 text-center rounded-3xl bg-white border border-black/[0.04] shadow-card">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-soft flex items-center justify-center">
                    <Trophy />
                  </div>
                  <h3 className="text-[17px] font-bold text-ink mb-1.5">Connect your wallet</h3>
                  <p className="text-[14px] text-ink-faint">Connect to start submitting proof and earning verifications.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                      { label: 'Submitted', value: total, color: 'text-brand', bg: 'bg-brand-soft' },
                      { label: 'Verified', value: verifiedN, color: 'text-emerald-600', bg: 'bg-success-soft' },
                      { label: 'Pending', value: pendingN, color: 'text-amber-600', bg: 'bg-warning-soft' },
                    ].map(s => (
                      <div key={s.label} className="p-5 rounded-2xl bg-white border border-black/[0.05] shadow-card">
                        <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                          <div className={`w-2 h-2 rounded-full ${s.color.replace('text-', 'bg-')}`} />
                        </div>
                        <div className="text-[11px] font-semibold text-ink-subtle uppercase tracking-widest">{s.label}</div>
                        <div className={`text-[30px] font-bold ${s.color} tracking-[-0.6px] mt-0.5`}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={submitProof} className="mb-12 p-6 rounded-2xl bg-white border border-black/[0.05] shadow-card">
                    <h2 className="text-[18px] font-bold text-ink mb-6">Submit proof</h2>

                    <div className="grid gap-5">
                      <div>
                        <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-2.5">Screenshot</label>
                        <label className={`relative flex flex-col items-center justify-center w-full h-44 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                          preview ? 'border-brand/30 bg-brand-soft/30' : 'border-black/[0.06] hover:border-brand/30 bg-canvas'
                        }`}>
                          {preview ? (
                            <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-2xl p-3" />
                          ) : (
                            <div className="text-center">
                              <div className="text-3xl mb-2">📸</div>
                              <span className="text-[14px] font-semibold text-ink-muted">Drop screenshot or click</span>
                              <span className="block text-[12px] text-ink-subtle mt-1">PNG, JPEG, WebP</span>
                            </div>
                          )}
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleFile(e.target.files?.[0])}
                            className="absolute inset-0 opacity-0 cursor-pointer" />
                        </label>
                        {preview && (
                          <button type="button" onClick={() => handleFile(undefined)}
                            className="mt-2 text-[12px] font-semibold text-ink-subtle hover:text-ink-faint transition-colors">Remove</button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-2.5">Tweet URL</label>
                        <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                          placeholder="https://x.com/username/status/…"
                          className="w-full bg-canvas border border-black/[0.08] rounded-xl px-4 py-3 text-[14px] text-ink-muted placeholder:text-ink-subtle font-mono focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-2.5">Your handle</label>
                          <input value={handle} onChange={e => setHandle(e.target.value.replace('@',''))}
                            placeholder="@username"
                            className="w-full bg-canvas border border-black/[0.08] rounded-xl px-4 py-3 text-[14px] text-ink-muted placeholder:text-ink-subtle focus:border-brand/40 focus:shadow-ring transition-all duration-200" />
                        </div>
                        <div>
                          <label className="block text-[12px] font-semibold text-ink-faint uppercase tracking-wider mb-2.5">Action</label>
                          <select value={action} onChange={e => setAction(e.target.value)}
                            className="w-full bg-canvas border border-black/[0.08] rounded-xl px-4 py-3 text-[14px] text-ink-muted font-semibold focus:border-brand/40 focus:shadow-ring transition-all duration-200 appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b6785' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                            {ACTIONS.map(a => (
                              <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={submitting || !screenshot || !tweetUrl || !handle}
                      className="mt-6 w-full h-12 bg-brand-gradient hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[15px] font-bold rounded-xl shadow-glow transition-all duration-200">
                      {uploading ? '📤 Uploading…' : submitting ? '⛓️ Confirming on-chain…' : '✨ Submit proof'}
                    </button>
                  </form>

                  <section>
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-[18px] font-bold text-ink">My submissions</h2>
                      <button onClick={fetchMy} disabled={myLoading}
                        className="text-[12px] font-semibold text-ink-subtle hover:text-ink-faint transition-colors">
                        {myLoading ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>

                    {total === 0 ? (
                      <div className="py-16 text-center rounded-3xl bg-white border border-black/[0.04] shadow-card">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-soft flex items-center justify-center">
                          <FileSearch />
                        </div>
                        <h3 className="text-[17px] font-bold text-ink mb-1.5">No submissions yet</h3>
                        <p className="text-[14px] text-ink-faint">Complete a task and submit your proof above.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {taskList.map(([id, task]) => {
                          const cfg = sc[task.status] ?? sc.pending
                          return (
                            <article key={id} className="group p-5 rounded-2xl bg-white border border-black/[0.04] shadow-card hover:shadow-card-hover transition-all duration-300">
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 text-xl">{cfg.icon}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                                    <span className="text-[11px] font-semibold text-ink-subtle font-mono">{id}</span>
                                  </div>
                                  <p className="text-[14px] text-ink-muted">
                                    <span className="font-semibold text-ink capitalize">{task.action_type}</span>
                                    <span className="text-ink-faint"> by </span>
                                    <span className="font-semibold text-ink">@{task.expected_handle}</span>
                                  </p>
                                  <p className="text-[12px] text-ink-subtle/70 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                  {task.verdict_reason && (
                                    <div className="mt-3 p-3 rounded-xl bg-canvas border border-black/[0.04]">
                                      <p className="text-[13px] text-ink-faint italic leading-relaxed">&ldquo;{task.verdict_reason}&rdquo;</p>
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
              )
            )}
          </div>
        )}
      </div>

      {/* ═══════ FOOTER ══════════════════════════════════════ */}
      <footer className="border-t border-black/[0.04] bg-white/50">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-subtle">
            <Sparkle size={12} />
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-4 text-[12px] font-semibold text-ink-subtle">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GenLayer</a>
            <span className="text-black/[0.1]">·</span>
            <a href="https://docs.genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
