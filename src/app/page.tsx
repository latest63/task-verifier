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
type View = 'dashboard' | 'submit'

const ACTIONS = ['like', 'retweet', 'reply', 'post'] as const
const sc: Record<string, { label: string; style: string }> = {
  pending:  { label: 'Pending',  style: 'border-amber-300/60 bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', style: 'border-emerald-300/60 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'Rejected', style: 'border-red-300/60 bg-red-50 text-red-800' },
}
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function Home() {
  const contractAddr = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  const [view, setView] = useState<View>('dashboard')

  // Dashboard
  const [tasks, setTasks] = useState<TaskMap>({})
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)

  // Submit
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tweetUrl, setTweetUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [action, setAction] = useState<string>('like')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const fetchTasks = useCallback(async () => {
    if (!contractAddr) return
    setLoading(true)
    try {
      const raw = await publicClient.readContract({
        address: contractAddr as `0x${string}`, abi: taskAbi, functionName: 'get_all_tasks',
      })
      if (raw && typeof raw === 'object') setTasks(raw as unknown as TaskMap)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [contractAddr])

  useEffect(() => { fetchTasks(); const i = setInterval(fetchTasks, 8000); return () => clearInterval(i) }, [fetchTasks])

  const verifyOne = async (taskId: string) => {
    if (!address || !walletClient) return
    setVerifying(taskId)
    try {
      const hash = await walletClient.writeContract({
        account: address, address: contractAddr as `0x${string}`, abi: taskAbi,
        functionName: 'verify', args: [taskId], chain: bradbury,
      } as any)
      await publicClient.waitForTransactionReceipt({ hash }); await fetchTasks()
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setVerifying(null) }
  }

  const verifyAll = async () => {
    for (const [id] of Object.entries(tasks).filter(([, t]) => t.status === 'pending')) await verifyOne(id)
  }

  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !walletClient || !screenshot) return
    setSubmitting(true)
    try {
      setUploading(true)
      const fd = new FormData(); fd.append('file', screenshot)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await up.json(); setUploading(false)

      const hash = await walletClient.writeContract({
        account: address, address: contractAddr as `0x${string}`, abi: taskAbi,
        functionName: 'submit_task', args: [tweetUrl, url, handle, action], chain: bradbury,
      } as any)
      await publicClient.waitForTransactionReceipt({ hash });
      setScreenshot(null); setPreview(null); setTweetUrl(''); setHandle(''); setAction('like')
      setSubmitted(true); setTimeout(() => setSubmitted(false), 5000)
    } catch (e: any) { alert(e?.message ?? 'Failed') } finally { setSubmitting(false); setUploading(false) }
  }
  const handleFile = (file: File | undefined) => { if (!file) { setScreenshot(null); setPreview(null); return }; setScreenshot(file); setPreview(URL.createObjectURL(file)) }

  const total = Object.keys(tasks).length
  const verifiedN = Object.values(tasks).filter(t => t.status === 'verified').length
  const pendingN = Object.values(tasks).filter(t => t.status === 'pending').length
  const taskList = Object.entries(tasks).reverse()

  return (
    <main className="min-h-screen font-sans bg-canvas">
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/tv 2.png" alt="Task Verifier" className="w-10 h-10 rounded-sm object-contain" />
            <span className="text-[15px] font-semibold text-ink-deep tracking-tight">Task Verifier</span>
          </div>

          {contractAddr && (
            <div className="flex bg-canvas-surface rounded-sm border border-border p-0.5">
              {(['dashboard', 'submit'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-4 py-1 text-[14px] font-semibold rounded-sm transition-colors ${
                    view === v ? 'bg-brand-dark text-white' : 'text-ink-muted hover:text-brand'
                  }`}>
                  {v === 'dashboard' ? 'Dashboard' : 'Submit'}
                </button>
              ))}
            </div>
          )}

          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
        {!contractAddr && (
          <div className="py-20 text-center border border-border rounded-sm bg-canvas">
            <p className="text-[16px] font-semibold text-ink-muted mb-1.5">Contract not configured</p>
            <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
              Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT</code> in your environment variables, then redeploy.
            </p>
          </div>
        )}

        {/* ═══ DASHBOARD ═══════════════════════════════════ */}
        {contractAddr && view === 'dashboard' && (
          <>
            <div className="mb-10">
              <h1 className="text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Dashboard</h1>
              <p className="mt-2 text-[16px] text-ink leading-[1.5] max-w-xl">
                Monitor submissions from your community. GenLayer AI validators cross-reference proof against live tweets.
              </p>
            </div>

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

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[18px] font-bold text-ink-deep">Submissions</h2>
                <button onClick={fetchTasks} disabled={loading}
                  className="text-[13px] font-semibold text-ink-muted hover:text-brand transition-colors">
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {total === 0 ? (
                <div className="py-16 text-center border border-border rounded-sm bg-canvas">
                  <p className="text-[16px] font-semibold text-ink-muted mb-1">No submissions yet</p>
                  <p className="text-[14px] text-ink-faint max-w-sm mx-auto leading-[1.5]">
                    Share this page with your community so they can submit proof.
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

        {/* ═══ SUBMIT ════════════════════════════════════ */}
        {contractAddr && view === 'submit' && (
          <>
            <div className="mb-10">
              <h1 className="text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Submit proof</h1>
              <p className="mt-2 text-[16px] text-ink leading-[1.5] max-w-xl">
                Complete the task, upload your screenshot, and submit. GenLayer AI will verify your proof on-chain.
              </p>
            </div>

            {submitted && (
              <div className="mb-6 p-4 border border-emerald-300/60 bg-emerald-50 rounded-sm">
                <p className="text-[14px] font-semibold text-emerald-800">✓ Submitted! Your proof is now pending verification.</p>
              </div>
            )}

            {!isConnected ? (
              <div className="py-16 text-center border border-border rounded-sm bg-canvas">
                <p className="text-[16px] font-semibold text-ink-muted mb-1">Connect your wallet</p>
                <p className="text-[14px] text-ink-faint">Connect to submit proof of completed tasks.</p>
              </div>
            ) : (
              <form onSubmit={submitProof} className="p-5 border border-border rounded-sm bg-canvas">
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
            )}
          </>
        )}
      </div>

      <footer className="border-t border-border bg-canvas mt-16">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink-faint">
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold text-ink-faint">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GenLayer</a>
            <span className="text-border">·</span>
            <a href="https://github.com/latest63/task-verifier" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
