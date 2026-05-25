'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { createPublicClient, http, defineChain } from 'viem'
import ConnectWallet from '../../components/ConnectWallet'

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

const sc: Record<string, { label: string; style: string }> = {
  pending:  { label: 'Pending',  style: 'border-amber-300/60 bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', style: 'border-emerald-300/60 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'Rejected', style: 'border-red-300/60 bg-red-50 text-red-800' },
}

const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function Home() {
  const envContract = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  const [role, setRole] = useState<Role>('project')
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
    if (!address || !projContract || !walletClient) return
    setVerifying(taskId)
    try {
      const hash = await walletClient.writeContract({
        account: address, address: projContract as `0x${string}`, abi: taskAbi, functionName: 'verify', args: [taskId], chain: bradbury,
      } as any)
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
    if (!address || !commContract || !screenshot || !walletClient) return
    setSubmitting(true)
    try {
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await up.json(); setUploading(false)
      const hash = await walletClient.writeContract({
        account: address, address: commContract as `0x${string}`, abi: taskAbi,
        functionName: 'submit_task', args: [tweetUrl, url, handle, action], chain: bradbury,
      } as any)
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
    <main className="min-h-screen font-sans bg-canvas">
      {/* ═══════ HEADER ══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-brand flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-ink-deep tracking-tight">Task Verifier</span>
          </div>

          <div className="flex bg-canvas-surface rounded-sm border border-border p-0.5">
            {(['project', 'community'] as const).map(r => (
              <button key={r} onClick={() => switchRole(r)}
                className={`px-4 py-1 text-[14px] font-semibold rounded-sm transition-colors ${
                  role === r
                    ? 'bg-brand-dark text-white'
                    : 'text-ink-muted hover:text-brand'
                }`}>
                {r === 'project' ? 'Project' : 'Community'}
              </button>
            ))}
          </div>

          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
        {/* ═══ PROJECT ═══════════════════════════════════════ */}
        {role === 'project' && (
          <div key={viewKey} className="animate-fade-in">
            <div className="mb-10">
              <div className="text-[13px] font-bold uppercase tracking-wide text-ink-faint mb-4">For Projects</div>
              <h1 className="text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">
                Manage verifications
              </h1>
              <p className="mt-2 text-[16px] text-ink leading-[1.5] max-w-xl">
                Deploy a task-verification contract on GenLayer. Your community submits proof, and AI validators reach consensus on-chain.
              </p>
            </div>

            {/* Contract input */}
            <div className="mb-10 p-5 border border-border rounded-sm bg-canvas">
              <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-3">Contract address</label>
              <div className="flex gap-2">
                <input value={projContract} onChange={e => setProjContract(e.target.value)}
                  placeholder={envContract || '0x…'}
                  className="flex-1 bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus/50" />
                <button onClick={fetchProj}
                  className="px-4 py-2 bg-canvas-surface hover:bg-canvas-raised border border-border rounded-sm text-[14px] font-semibold text-ink-muted hover:text-brand transition-colors">
                  Load
                </button>
              </div>
            </div>

            {projContract.startsWith('0x') && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Submissions', value: total },
                    { label: 'Verified', value: verifiedN },
                    { label: 'Pending', value: pendingN },
                  ].map(s => (
                    <div key={s.label} className="p-4 border border-border rounded-sm bg-canvas">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">{s.label}</div>
                      <div className="text-[28px] font-bold text-ink-deep leading-tight">{s.value}</div>
                    </div>
                  ))}
                </div>

                {pendingN > 0 && isConnected && (
                  <button onClick={verifyAll}
                    className="mb-8 px-5 py-2 bg-brand-dark hover:opacity-70 text-white text-[14px] font-semibold rounded-sm transition-all">
                    Verify all pending ({pendingN})
                  </button>
                )}

                {/* Tasks */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[18px] font-bold text-ink-deep">Submissions</h2>
                    <button onClick={fetchProj} disabled={projLoading}
                      className="text-[13px] font-semibold text-ink-muted hover:text-brand transition-colors">
                      {projLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {total === 0 ? (
                    <div className="py-16 text-center border border-border rounded-sm bg-canvas">
                      <p className="text-[16px] font-semibold text-ink-muted mb-1">Waiting for submissions</p>
                      <p className="text-[14px] text-ink-faint max-w-sm mx-auto leading-[1.5]">
                        Share your contract with your community. Submissions appear in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {taskList.map(([id, task]) => {
                        const cfg = sc[task.status] ?? sc.pending
                        return (
                          <article key={id} className="p-4 border border-border rounded-sm bg-canvas group">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${cfg.style}`}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-[11px] font-semibold text-ink-faint font-mono">{id}</span>
                                </div>
                                <p className="text-[15px] text-ink leading-[1.5]">
                                  <span className="font-bold text-ink-deep capitalize">{task.action_type}</span>
                                  <span className="text-ink-muted"> by </span>
                                  <span className="font-bold text-ink-deep">@{task.expected_handle}</span>
                                </p>
                                <p className="text-[12px] text-ink-faint mt-0.5 font-mono">by {fmtAddr(task.submitter)}</p>
                                <p className="text-[12px] text-ink-faint/70 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                {task.verdict_reason && (
                                  <p className="text-[13px] text-ink-muted italic mt-2 leading-[1.5]">
                                    &ldquo;{task.verdict_reason}&rdquo;
                                  </p>
                                )}
                              </div>
                              {task.status === 'pending' && (
                                <button onClick={() => verifyOne(id)} disabled={verifying === id}
                                  className="shrink-0 px-3 py-1.5 bg-canvas-surface hover:bg-canvas-raised disabled:opacity-40 border border-border rounded-sm text-[12px] font-semibold text-ink-muted hover:text-brand transition-colors">
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
            <div className="mb-10">
              <div className="text-[13px] font-bold uppercase tracking-wide text-ink-faint mb-4">For Community</div>
              <h1 className="text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">
                Get verified on-chain
              </h1>
              <p className="mt-2 text-[16px] text-ink leading-[1.5] max-w-xl">
                Complete social tasks, submit proof, and earn verified status powered by AI consensus on GenLayer.
              </p>
            </div>

            {/* Contract input */}
            <div className="mb-10 p-5 border border-border rounded-sm bg-canvas">
              <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-3">Project contract</label>
              <input value={commContract} onChange={e => setCommContract(e.target.value)}
                placeholder="Paste the contract address shared by the project…"
                className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus/50" />
            </div>

            {commContract.startsWith('0x') && (
              !isConnected ? (
                <div className="py-16 text-center border border-border rounded-sm bg-canvas">
                  <p className="text-[16px] font-semibold text-ink-muted mb-1">Connect your wallet</p>
                  <p className="text-[14px] text-ink-faint">Connect to start submitting proof and earning verifications.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                      { label: 'Submitted', value: total },
                      { label: 'Verified', value: verifiedN },
                      { label: 'Pending', value: pendingN },
                    ].map(s => (
                      <div key={s.label} className="p-4 border border-border rounded-sm bg-canvas">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">{s.label}</div>
                        <div className="text-[28px] font-bold text-ink-deep leading-tight">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Submit form */}
                  <form onSubmit={submitProof} className="mb-12 p-5 border border-border rounded-sm bg-canvas">
                    <h2 className="text-[18px] font-bold text-ink-deep mb-5">Submit proof</h2>

                    <div className="grid gap-4">
                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Screenshot</label>
                        <label className={`relative flex flex-col items-center justify-center w-full h-40 rounded-sm border border-dashed cursor-pointer transition-colors ${
                          preview ? 'border-brand/30 bg-orange-50/50' : 'border-border hover:border-brand/40 bg-canvas-surface'
                        }`}>
                          {preview ? (
                            <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-sm p-2" />
                          ) : (
                            <div className="text-center">
                              <div className="text-2xl mb-1">📸</div>
                              <span className="text-[14px] font-semibold text-ink-muted">Drop screenshot or click</span>
                              <span className="block text-[12px] text-ink-faint mt-0.5">PNG, JPEG, WebP</span>
                            </div>
                          )}
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleFile(e.target.files?.[0])}
                            className="absolute inset-0 opacity-0 cursor-pointer" />
                        </label>
                        {preview && (
                          <button type="button" onClick={() => handleFile(undefined)}
                            className="mt-1.5 text-[12px] font-semibold text-ink-faint hover:text-brand transition-colors">Remove</button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Tweet URL</label>
                        <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                          placeholder="https://x.com/username/status/…"
                          className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus/50" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Your handle</label>
                          <input value={handle} onChange={e => setHandle(e.target.value.replace('@',''))}
                            placeholder="@username"
                            className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus/50" />
                        </div>
                        <div>
                          <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Action</label>
                          <select value={action} onChange={e => setAction(e.target.value)}
                            className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-focus/50 appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2365675e' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                            {ACTIONS.map(a => (
                              <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={submitting || !screenshot || !tweetUrl || !handle}
                      className="mt-5 w-full py-2.5 bg-brand-dark hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[15px] font-bold rounded-sm transition-all">
                      {uploading ? 'Uploading…' : submitting ? 'Confirming on-chain…' : 'Submit proof'}
                    </button>
                  </form>

                  {/* My tasks */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-[18px] font-bold text-ink-deep">My submissions</h2>
                      <button onClick={fetchMy} disabled={myLoading}
                        className="text-[13px] font-semibold text-ink-muted hover:text-brand transition-colors">
                        {myLoading ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>

                    {total === 0 ? (
                      <div className="py-16 text-center border border-border rounded-sm bg-canvas">
                        <p className="text-[16px] font-semibold text-ink-muted mb-1">No submissions yet</p>
                        <p className="text-[14px] text-ink-faint">Complete a task and submit your proof above.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {taskList.map(([id, task]) => {
                          const cfg = sc[task.status] ?? sc.pending
                          return (
                            <article key={id} className="p-4 border border-border rounded-sm bg-canvas group">
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${cfg.style}`}>
                                      {cfg.label}
                                    </span>
                                    <span className="text-[11px] font-semibold text-ink-faint font-mono">{id}</span>
                                  </div>
                                  <p className="text-[15px] text-ink leading-[1.5]">
                                    <span className="font-bold text-ink-deep capitalize">{task.action_type}</span>
                                    <span className="text-ink-muted"> by </span>
                                    <span className="font-bold text-ink-deep">@{task.expected_handle}</span>
                                  </p>
                                  <p className="text-[12px] text-ink-faint/70 truncate font-mono mt-0.5">{task.tweet_url}</p>
                                  {task.verdict_reason && (
                                    <p className="text-[13px] text-ink-muted italic mt-2 leading-[1.5]">
                                      &ldquo;{task.verdict_reason}&rdquo;
                                    </p>
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
      <footer className="border-t border-border bg-canvas">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink-faint">
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold text-ink-faint">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GenLayer</a>
            <span className="text-border">·</span>
            <a href="https://docs.genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
