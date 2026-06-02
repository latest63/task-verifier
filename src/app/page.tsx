'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { http, defineChain } from 'viem'
import { createClient } from 'genlayer-js'
import { testnetBradbury } from 'genlayer-js/chains'
import ConnectWallet from '../../components/ConnectWallet'

const bradbury = defineChain({
  id: 4221, name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } },
  blockExplorers: { default: { name: 'Bradbury Explorer', url: 'https://explorer-bradbury.genlayer.com' } },
  testnet: true,
})

// GenLayer JS client for reads (uses gen_call RPC, not eth_call)
const glReadClient = createClient({ chain: testnetBradbury })

const taskAbi = [
  { type: 'function', name: 'submit_task', inputs: [
    { type: 'string', name: 'tweet_url' }, { type: 'string', name: 'screenshot_url' },
    { type: 'string', name: 'expected_handle' }, { type: 'string', name: 'action_type' },
  ], stateMutability: 'write' },
  { type: 'function', name: 'verify', inputs: [{ type: 'string', name: 'task_id' }], stateMutability: 'write' },
  { type: 'function', name: 'get_task', inputs: [{ type: 'string', name: 'task_id' }], stateMutability: 'view' },
  { type: 'function', name: 'get_all_tasks', inputs: [], stateMutability: 'view' },
  { type: 'function', name: 'get_task_count', inputs: [], stateMutability: 'view' },
  { type: 'function', name: 'get_verified_handle', inputs: [{ type: 'string', name: 'handle' }], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'is_screenshot_used', inputs: [{ type: 'string', name: 'url' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const

type TaskData = { submitter: string; tweet_url: string; screenshot_url: string; expected_handle: string; action_type: string; status: string; verdict_reason: string; timestamp: string }
type TaskMap = Record<string, TaskData>
type View = 'task' | 'dashboard' | 'submit'

const ACTIONS = ['like', 'retweet'] as const
const sc: Record<string, { label: string; style: string }> = {
  pending:  { label: 'Pending',  style: 'border-amber-300/60 bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', style: 'border-emerald-300/60 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'Rejected', style: 'border-red-300/60 bg-red-50 text-red-800' },
}
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const actionEmoji: Record<string, string> = { like: '❤️', retweet: '🔄', reply: '💬', post: '📝' }
const GENLAYER_PINNED_POST = 'https://x.com/GenLayer/status/2033575658165867008'

export default function Home() {
  const contractAddr = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { open } = useWeb3Modal()

  const [view, setView] = useState<View>('task')

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
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

  const fetchTasks = useCallback(async () => {
    if (!contractAddr) return
    setLoading(true)
    try {
      const raw = await glReadClient.readContract({
        address: contractAddr as `0x${string}`,
        functionName: 'get_all_tasks',
        args: [],
      })
      if (raw && typeof raw === 'object') setTasks(raw as unknown as TaskMap)
      setError(null)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [contractAddr])

  useEffect(() => { fetchTasks(); const i = setInterval(fetchTasks, 8000); return () => clearInterval(i) }, [fetchTasks])

  const waitForTx = async (hash: string) => {
    // Poll via genlayer-js compatible read until finalized
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const receipt = await fetch('https://rpc-bradbury.genlayer.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [hash],
            id: 1,
          }),
        }).then(r => r.json())
        if (receipt?.result) return receipt.result
      } catch {}
    }
  }

  const verifyOne = async (taskId: string) => {
    if (!address || !walletClient) return
    setVerifying(taskId)
    try {
      const hash = await walletClient.writeContract({
        account: address, address: contractAddr as `0x${string}`, abi: taskAbi,
        functionName: 'verify', args: [taskId], chain: bradbury,
      } as any)
      await waitForTx(hash); await fetchTasks()
    } catch (e: any) { setError(e?.message ?? 'Verification failed') } finally { setVerifying(null) }
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
      const controller = new AbortController()
      const to = setTimeout(() => controller.abort(), 25000)
      const up = await fetch('/api/upload', { method: 'POST', body: fd, signal: controller.signal })
      clearTimeout(to)
      if (!up.ok) { const err = await up.json(); throw new Error(err.error || 'Upload failed') }
      const { url } = await up.json(); setUploading(false)

      // Use pinned post for like, manual URL for retweet
      const finalUrl = action === 'like' ? GENLAYER_PINNED_POST : tweetUrl

      const hash = await walletClient.writeContract({
        account: address, address: contractAddr as `0x${string}`, abi: taskAbi,
        functionName: 'submit_task', args: [finalUrl, url, handle, action], chain: bradbury,
      } as any)
      await waitForTx(hash)
      setScreenshot(null); setPreview(null); setTweetUrl(''); setHandle(''); setAction('like')
      setSubmitted(true); setTimeout(() => setSubmitted(false), 5000)
    } catch (e: any) { setError(e?.message ?? 'Submission failed') } finally { setSubmitting(false); setUploading(false) }
  }
  const handleFile = (file: File | undefined) => { if (!file) { setScreenshot(null); setPreview(null); return }; setScreenshot(file); setPreview(URL.createObjectURL(file)) }

  const total = Object.keys(tasks).length
  const verifiedN = Object.values(tasks).filter(t => t.status === 'verified').length
  const pendingN = Object.values(tasks).filter(t => t.status === 'pending').length
  const taskList = Object.entries(tasks).reverse()

  // Leaderboard
  const leaderboard = Object.values(tasks)
    .filter(t => t.status === 'verified')
    .reduce((acc: Record<string, { addr: string; count: number; handle: string }>, t) => {
      const key = t.submitter
      if (!acc[key]) acc[key] = { addr: key, count: 0, handle: t.expected_handle }
      acc[key].count++
      return acc
    }, {})
  const ranked = Object.values(leaderboard).sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <main className="min-h-screen font-sans bg-canvas">
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src="/tv_logo-removebg-preview.png" alt="Task Verifier" className="w-8 h-8 sm:w-10 sm:h-10 rounded-sm object-contain" />
            <span className="hidden sm:inline text-[15px] font-semibold text-ink-deep tracking-tight">Task Verifier</span>
          </div>

          <div className="flex bg-canvas-surface rounded-sm border border-border p-0.5 shrink-0">
              {(['task', 'dashboard', 'submit'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 sm:px-4 py-1 text-[12px] sm:text-[14px] font-semibold rounded-sm transition-colors ${
                    view === v ? 'bg-brand-dark text-white' : 'text-ink-muted hover:text-brand'
                  }`}>
                  {v === 'task' ? 'Task' : v === 'dashboard' ? 'Activity' : 'Submit'}
                </button>
              ))}
            </div>

          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-8 sm:py-12 md:py-16">
        {!contractAddr && view !== 'task' && (
          <div className="py-20 text-center border border-border rounded-sm bg-canvas">
            <p className="text-[16px] font-semibold text-ink-muted mb-1.5">Contract not configured</p>
            <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
              Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT</code> in your environment variables, then redeploy.
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-3 sm:p-4 border border-red-300/70 bg-red-50 rounded-sm flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <span className="text-red-500 text-[15px] mt-0.5 shrink-0">⚠</span>
              <p className="text-[13px] sm:text-[14px] text-red-800 leading-[1.5]">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-[16px] leading-none shrink-0 font-bold">&times;</button>
          </div>
        )}

        {/* ═══ TASK INFO ═══════════════════════════════════ */}
        {view === 'task' && (
          <>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">GenLayer Community Tasks</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                Support the <a href="https://x.com/GenLayer" target="_blank" rel="noopener" className="font-bold text-brand hover:underline">@GenLayer</a> community by engaging with our pinned post. Complete the actions below, submit proof, and get verified by GenLayer AI consensus.
              </p>
            </div>

            {/* Pinned post card */}
            <div className="mb-8 p-4 sm:p-5 border-2 border-brand/20 rounded-sm bg-orange-50/50">
              <div className="flex items-start gap-3">
                <img src="/genlayer-logo.jpeg" alt="GenLayer" className="shrink-0 w-10 h-10 rounded-full object-cover" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-bold text-ink-deep">GenLayer</span>
                    <span className="text-[12px] text-ink-faint">@GenLayer · Pinned</span>
                  </div>
                  <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6] mb-2">
                    The future of AI-powered consensus is here. Like, Retweet, and follow to stay updated.
                  </p>
                  <a href={GENLAYER_PINNED_POST} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline">
                    🔗 View post on X
                  </a>
                </div>
              </div>
            </div>

            <h2 className="text-[16px] sm:text-[18px] font-bold text-ink-deep mb-4">Steps to earn</h2>

            {/* Wallet proof note */}
            <div className="mb-6 p-3 sm:p-4 bg-canvas-surface border border-border rounded-sm">
              <div className="flex items-start gap-2.5">
                <span className="text-lg shrink-0">🛡️</span>
                <div>
                  <p className="text-[13px] sm:text-[14px] font-semibold text-ink-deep">Prove you own your X account</p>
                  <p className="text-[12px] sm:text-[13px] text-ink leading-[1.5] mt-0.5">
                    Before submitting, reply to the pinned post with your wallet address from the Submit tab. The AI checks the reply matches your handle — only the real account owner can reply from that handle.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {[
                { num: '1', icon: '❤️', title: 'Like the pinned post', desc: 'Go to the GenLayer pinned post on X and click the Like button. This shows community support.' },
                { num: '2', icon: '🔄', title: 'Retweet to your followers', desc: 'Retweet the pinned post to share it with your audience. The more reach, the stronger the community.' },
                { num: '3', icon: '🛡️', title: 'Reply with your wallet address', desc: 'Reply to the pinned post with your wallet address (copy it from the Submit tab). This proves you own the X account — only the real account holder can post from that handle.' },
                { num: '4', icon: '📸', title: 'Capture your proof', desc: 'Take a screenshot showing your Like or Retweet on the pinned post. Make sure your handle and the interaction are clearly visible.' },
                { num: '5', icon: '🔗', title: 'Submit with your X handle', desc: 'Enter your X handle, upload the screenshot, and submit. For Like the URL is auto-set. For Retweet, paste your unique retweet URL.' },
                { num: '6', icon: '🤖', title: 'AI verification', desc: 'GenLayer validators cross-check your screenshot against the live post AND verify the reply proves you own the handle. Multiple AI models independently confirm.' },
                { num: '7', icon: '🏆', title: 'Get verified & climb', desc: 'If genuine, your task is marked Verified. Each verified task earns you a spot on the community leaderboard.' },
              ].map(step => (
                <div key={step.num} className="flex gap-4 sm:gap-5 p-4 sm:p-5 border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors">
                  <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-sm font-bold text-[15px] text-white"
                    style={{ backgroundColor: '#F54E00' }}>
                    {step.num}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{step.icon}</span>
                      <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-deep">{step.title}</h3>
                    </div>
                    <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══ DASHBOARD ═══════════════════════════════════ */}
        {contractAddr && view === 'dashboard' && (
          <>
            {/* Hero */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Community Activity</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                AI-verified community contributions. Complete tasks, submit proof, and earn your spot on the leaderboard.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-8">
              <div className="p-2.5 sm:p-4 border border-border rounded-sm bg-canvas text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">Tasks</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-ink-deep leading-tight">{total}</div>
              </div>
              <div className="p-2.5 sm:p-4 border border-emerald-200 rounded-sm bg-emerald-50/50 text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Verified ✓</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-emerald-700 leading-tight">{verifiedN}</div>
              </div>
              <div className="col-span-2 p-2.5 sm:p-4 border border-brand/20 rounded-sm bg-orange-50/40 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">Ready to earn?</div>
                  <div className="text-[13px] sm:text-[14px] font-semibold text-ink leading-[1.4]">Like & Retweet the GenLayer pinned post</div>
                </div>
                <button onClick={() => setView('submit')}
                  className="shrink-0 h-9 px-4 sm:px-6 rounded-md text-[12px] sm:text-[13px] font-semibold text-white transition-all"
                  style={{ backgroundColor: '#F54E00', border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(245,78,0,0.25)' }}>
                  Submit proof →
                </button>
              </div>
            </div>

            {/* Leaderboard */}
            {ranked.length > 0 && (
              <section className="mb-8">
                <h2 className="text-[14px] sm:text-[16px] font-bold text-ink-deep mb-3 flex items-center gap-2">
                  🏆 Top Contributors
                </h2>
                <div className="border border-border rounded-sm bg-canvas overflow-hidden">
                  {ranked.map((p, i) => (
                    <div key={p.addr} className={`flex items-center justify-between px-3 sm:px-4 py-2.5 ${i < ranked.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <span className={`text-[13px] sm:text-[14px] font-bold w-5 sm:w-6 text-center shrink-0 ${i === 0 ? 'text-brand' : i === 1 ? 'text-ink-muted' : i === 2 ? 'text-ink-faint' : 'text-ink-faint/50'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                        <span className="text-[13px] sm:text-[14px] font-semibold text-ink-deep truncate">@{p.handle}</span>
                        <span className="hidden sm:inline text-[11px] text-ink-faint font-mono truncate">{fmtAddr(p.addr)}</span>
                      </div>
                      <span className="text-[12px] sm:text-[13px] font-bold text-brand shrink-0">{p.count} verified</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Admin verify */}
            {pendingN > 0 && isConnected && (
              <button onClick={verifyAll}
                className="mb-6 px-5 py-2 bg-brand-dark hover:opacity-70 text-white text-[14px] font-semibold rounded-sm transition-all">
                Verify all pending ({pendingN})
              </button>
            )}

            {/* Activity Feed */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Recent Activity</h2>
                <button onClick={fetchTasks} disabled={loading}
                  className="text-[13px] font-semibold text-ink-muted hover:text-brand transition-colors">
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {total === 0 ? (
                <div className="py-12 sm:py-16 text-center border border-border rounded-sm bg-canvas">
                  <div className="text-3xl mb-3">🚀</div>
                  <p className="text-[15px] sm:text-[16px] font-semibold text-ink-muted mb-1">No community activity yet</p>
                  <p className="text-[13px] sm:text-[14px] text-ink-faint max-w-sm mx-auto leading-[1.5] px-3">
                    Be the first to Like & Retweet the GenLayer pinned post and submit your proof.
                  </p>
                  {!isConnected && (
                    <button onClick={() => open()}
                      className="mt-4 h-9 px-5 rounded-md text-[13px] font-semibold text-white transition-all"
                      style={{ backgroundColor: '#F54E00', border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(245,78,0,0.25)' }}>
                      Connect to start
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {taskList.map(([id, task]) => {
                    const cfg = sc[task.status] ?? sc.pending
                    const emoji = actionEmoji[task.action_type] || '📋'
                    const isVerified = task.status === 'verified'
                    return (
                      <article key={id} className={`p-3 sm:p-4 border rounded-sm bg-canvas group transition-colors ${isVerified ? 'border-emerald-200 bg-emerald-50/30' : 'border-border'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${cfg.style}`}>
                                {isVerified ? '✓ Verified' : cfg.label}
                              </span>
                              <span className="text-[10px] sm:text-[11px] font-semibold text-ink-faint font-mono truncate max-w-[120px] sm:max-w-none">{id}</span>
                            </div>
                            <p className="text-[14px] sm:text-[15px] text-ink leading-[1.5]">
                              {emoji} <span className="font-bold text-ink-deep">@{task.expected_handle}</span>
                              <span className="text-ink-muted"> — {task.action_type}d a tweet</span>
                            </p>
                            <p className="text-[11px] sm:text-[12px] text-ink-faint mt-0.5 font-mono">submitted by {fmtAddr(task.submitter)}</p>
                            {task.verdict_reason && (
                              <p className={`text-[12px] sm:text-[13px] italic mt-2 leading-[1.5] ${isVerified ? 'text-emerald-700' : 'text-ink-muted'}`}>
                                &ldquo;{task.verdict_reason}&rdquo;
                              </p>
                            )}
                          </div>
                          {task.status === 'pending' && (
                            <button onClick={() => verifyOne(id)} disabled={verifying === id}
                              className="sm:shrink-0 w-full sm:w-auto px-3 py-1.5 bg-canvas-surface hover:bg-canvas-raised disabled:opacity-40 border border-border rounded-sm text-[12px] font-semibold text-ink-muted hover:text-brand transition-colors text-center">
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
            <div className="mb-6 sm:mb-10">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Submit proof</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                Liked or retweeted the <a href={GENLAYER_PINNED_POST} target="_blank" rel="noopener" className="font-bold text-brand hover:underline">GenLayer pinned post</a>? Upload your screenshot and submit. GenLayer AI will verify your proof on-chain.
              </p>
            </div>

            {submitted && (
              <div className="mb-6 p-4 border border-emerald-300/60 bg-emerald-50 rounded-sm">
                <p className="text-[14px] font-semibold text-emerald-800">✓ Submitted! Your proof is now pending verification.</p>
              </div>
            )}

            {!isConnected ? (
              <button
                onClick={() => open()}
                className="w-full py-12 sm:py-16 text-center border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors cursor-pointer"
              >
                <p className="text-[15px] sm:text-[16px] font-semibold text-ink-muted mb-1">Connect your wallet</p>
                <p className="text-[13px] sm:text-[14px] text-ink-faint px-3">Connect to submit proof of completed tasks.</p>
              </button>
            ) : (
              <form onSubmit={submitProof} className="p-3 sm:p-5 border border-border rounded-sm bg-canvas">
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
                          <span className="text-[14px] font-semibold text-ink-muted">Screenshot showing your Like & Retweet</span>
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
                    <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">
                      Tweet URL
                      {action === 'like' && <span className="text-brand ml-1 text-[11px]">(auto-set for Like)</span>}
                      {action === 'retweet' && <span className="text-ink-faint ml-1 text-[11px]">(your retweet URL)</span>}
                    </label>
                    {action === 'like' ? (
                      <input value={GENLAYER_PINNED_POST} readOnly
                        className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-mono opacity-60 cursor-not-allowed" />
                    ) : (
                      <input value={tweetUrl} onChange={e => setTweetUrl(e.target.value)}
                        placeholder="https://x.com/yourhandle/status/…"
                        className="w-full bg-canvas-surface border border-border-light rounded-sm px-3 py-2 text-[14px] text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus/50" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  {isConnected && address && (
                    <div className="p-3 bg-orange-50/50 border border-brand/20 rounded-sm">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">Your wallet address</div>
                      <div className="flex items-center gap-2">
                        <code className="text-[12px] font-mono text-ink-deep bg-white px-2 py-1 rounded-sm border border-border flex-1 truncate">{address}</code>
                        <button type="button" onClick={() => navigator.clipboard.writeText(address)}
                          className="shrink-0 text-[11px] font-semibold text-brand hover:underline">Copy</button>
                      </div>
                      <p className="text-[11px] text-ink-faint mt-1.5 leading-[1.4]">
                        Reply to the pinned post with this address to prove you own your X account. The AI will verify the reply.
                      </p>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={submitting || !screenshot || !handle || (action === 'retweet' && !tweetUrl)}
                  className="mt-5 w-full py-2.5 bg-brand-dark hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[15px] font-bold rounded-sm transition-all">
                  {uploading ? 'Uploading…' : submitting ? 'Confirming on-chain…' : 'Submit proof'}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-border bg-canvas mt-16">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="text-[11px] sm:text-[12px] font-semibold text-ink-faint text-center sm:text-left">
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-3 text-[11px] sm:text-[12px] font-semibold text-ink-faint">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GenLayer</a>
            <span className="text-border">·</span>
            <a href="https://github.com/latest63/task-verifier" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
