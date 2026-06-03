'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { defineChain } from 'viem'
import { createClient } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'
import ConnectWallet from '../../../components/ConnectWallet'

// ── Provider helper — OKX Wallet uses window.okxwallet, not window.ethereum ──

const getProvider = () => {
  if (typeof window !== 'undefined' && (window as any).okxwallet) {
    return (window as any).okxwallet
  }
  return window.ethereum
}

// ── Networks ───────────────────────────────────────────────────────

const BRADBURY = defineChain({
  id: 4221, name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer-bradbury.genlayer.com' } },
  testnet: true,
})

// ── ABI ────────────────────────────────────────────────────────────

type NetworkId = 'bradbury' | 'studionet'
type View = 'task' | 'dashboard' | 'submit'

const NETWORKS: Record<NetworkId, {
  label: string; color: string; chain: typeof BRADBURY;
  explorer: string
}> = {
  bradbury: {
    label: 'Bradbury', color: '#1e3a5f', chain: BRADBURY,
    explorer: 'https://explorer-bradbury.genlayer.com',
  },
  studionet: {
    label: 'Studio', color: '#6366f1', chain: studionet as any,
    explorer: '#',
  },
}

type SubData = {
  submitter: string; img_size: number;
  status: string; verdict: string; timestamp: string
}

const fmtAddr = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
const fmtBytes = (b: number) =>
  b < 1024 ? `${b}B` : b < 10240 ? `${(b / 1024).toFixed(1)}KB` : `${Math.round(b / 1024)}KB`

export default function Home() {
  const contractBradbury = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  const contractStudio = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_STUDIO || ''
  const hasBradbury = !!contractBradbury
  const hasStudio = !!contractStudio

  const [network, setNetwork] = useState<NetworkId>(
    hasBradbury ? 'bradbury' : hasStudio ? 'studionet' : 'bradbury'
  )

  const contractAddr = network === 'bradbury' ? contractBradbury : contractStudio
  const netCfg = NETWORKS[network]

  // Lazy read client — created on demand inside try-catch
  const glClient = useMemo(() => {
    try {
      if (network === 'bradbury') return createClient({ chain: testnetBradbury })
      // Studio: extend Bradbury chain with Studio RPC
      return createClient({
        chain: { ...testnetBradbury, rpcUrls: { default: { http: ['https://studio.genlayer.com/api'] } } } as any,
      })
    } catch (e) {
      console.error('Failed to create read client:', e)
      return null
    }
  }, [network])

  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { open } = useWeb3Modal()

  const [view, setView] = useState<View>('task')

  // Dashboard
  const [subs, setSubs] = useState<Record<string, SubData>>({})
  const [loading, setLoading] = useState(false)

  // Submit
  const [file, setFile] = useState<File | null>(null)
  const [rawPreview, setRawPreview] = useState<string | null>(null)
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null)
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null)
  const [compressedBytes, setCompressedBytes] = useState<Uint8Array | null>(null)
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number; compressedSize: number; ratio: number; width: number; height: number
  } | null>(null)
  const [compressWarn, setCompressWarn] = useState<string | null>(null)

  const [txHash, setTxHash] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: string; reason: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [verifying, setVerifying] = useState<string | null>(null)
  const verifyingRef = useRef(false)

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

  // ── Fetch submissions ────────────────────────────────────────────

  const fetchSubs = useCallback(async () => {
    if (!contractAddr || !glClient) return
    setLoading(true)
    try {
      const raw = await glClient.readContract({
        address: contractAddr as `0x${string}`,
        functionName: 'get_all',
        args: [],
      })
      const data = raw && typeof raw === 'object' ? raw as unknown as Record<string, SubData> : {}
      setSubs(data)
      return data
    } catch (e) { console.error('fetch error:', e); return {} } finally { setLoading(false) }
  }, [contractAddr, glClient])

  useEffect(() => { fetchSubs(); const i = setInterval(fetchSubs, 10000); return () => clearInterval(i) }, [fetchSubs])

  // ── Image compression ────────────────────────────────────────────

  const compressFile = useCallback(async (f: File) => {
    const originalSize = f.size

    // Load image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Failed to load image'))
      i.src = URL.createObjectURL(f)
    })

    let w = img.naturalWidth
    let h = img.naturalHeight
    const MAX = 640
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX }
      else { w = Math.round(w * MAX / h); h = MAX }
    }

    // Try different qualities to get under 50KB
    let quality = 0.7
    let blob: Blob | null = null
    let attempts = 0
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    while (attempts < 10) {
      blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), 'image/jpeg', quality))
      if (!blob || blob.size <= 48000) break
      quality -= 0.1
      attempts++
    }

    if (!blob) { setCompressWarn('Compression failed'); return }

    const finalSize = blob.size
    setCompressionInfo({
      originalSize,
      compressedSize: finalSize,
      ratio: Math.round((1 - finalSize / originalSize) * 100),
      width: w,
      height: h,
    })

    if (finalSize > 50000) {
      setCompressWarn(`⚠ Image is ${fmtBytes(finalSize)} — exceeds 50KB limit. Try a smaller screenshot.`)
    } else {
      setCompressWarn(null)
    }

    const buf = await blob.arrayBuffer()
    setCompressedBlob(blob)
    setCompressedBytes(new Uint8Array(buf))
    setCompressedPreview(URL.createObjectURL(blob))
  }, [])

  // ── Submit ───────────────────────────────────────────────────────

  const submitProof = async () => {
    if (!address || !walletClient || !compressedBytes || !contractAddr) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true); setTxHash(null); setTaskId(null); setResult(null)
    try {
      // Detect wallet's actual chain — don't rely on toggle state
      const walletChainHex: string = await getProvider().request({ method: 'eth_chainId' })
      const walletChainId = parseInt(walletChainHex, 16)
      const isWalletOnStudio = walletChainId === 61999
      const activeChain = isWalletOnStudio ? studionet : testnetBradbury
      const activeContract = isWalletOnStudio ? contractStudio : contractBradbury

      // Sync UI to wallet's actual chain
      if (isWalletOnStudio ? network !== 'studionet' : network !== 'bradbury') {
        setNetwork(isWalletOnStudio ? 'studionet' : 'bradbury')
      }

      if (!activeContract) {
        throw new Error(`No contract configured for ${isWalletOnStudio ? 'Studio' : 'Bradbury'}. Set the env var and redeploy.`)
      }

      // Use genlayer-js write client with MetaMask for signing (not wagmi — GenLayer has own ABI encoding)
      const glWriteClient = createClient({
        chain: activeChain as any,
        account: address as `0x${string}`,
        provider: getProvider(),
      })

      const hash = await glWriteClient.writeContract({
        address: activeContract as `0x${string}`,
        functionName: 'submit',
        args: [compressedBytes],  // genlayer-js expects Uint8Array for bytes type
        value: 0n,
      })
      setTxHash(hash as string)

      // genlayer-js handles receipt internally (Bradbury waits, Studio returns immediately).
      // Just poll for the new submission to appear.
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 6000)

      // Poll fetchSubs up to 30s for the new submission
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const fresh = await fetchSubs()
        const entries = Object.entries(fresh || {}).filter(([, s]) => s.submitter.toLowerCase() === address.toLowerCase())
        if (entries.length > 0) {
          const latest = entries[entries.length - 1]
          if (latest) setTaskId(latest[0])
          break
        }
      }

      setFile(null); setRawPreview(null); setCompressedPreview(null); setCompressedBlob(null); setCompressedBytes(null); setCompressionInfo(null); setCompressWarn(null)
    } catch (e: any) {
      console.error('submit error:', e)
      setError(e?.cause?.message || e?.shortMessage || e?.message || e?.toString() || 'Submission failed')
    } finally { submittingRef.current = false; setSubmitting(false) }
  }

  // ── Verify ───────────────────────────────────────────────────────

  const verifyOne = async (id: string) => {
    if (!address || !walletClient) return
    if (verifyingRef.current) return
    verifyingRef.current = true
    setVerifying(id)
    try {
      // Detect wallet's chain — don't rely on toggle state
      const walletChainHexVerify: string = await getProvider().request({ method: 'eth_chainId' })
      const walletChainIdVerify = parseInt(walletChainHexVerify, 16)
      const isWalletOnStudioVerify = walletChainIdVerify === 61999
      const activeChainVerify = isWalletOnStudioVerify ? studionet : testnetBradbury
      const activeContractVerify = isWalletOnStudioVerify ? contractStudio : contractBradbury

      // Sync UI to wallet's actual chain
      if (isWalletOnStudioVerify ? network !== 'studionet' : network !== 'bradbury') {
        setNetwork(isWalletOnStudioVerify ? 'studionet' : 'bradbury')
      }

      if (!activeContractVerify) {
        throw new Error(`No contract configured for ${isWalletOnStudioVerify ? 'Studio' : 'Bradbury'}.`)
      }

      const glWriteClient = createClient({
        chain: activeChainVerify as any,
        account: address as `0x${string}`,
        provider: getProvider(),
      })

      await glWriteClient.writeContract({
        address: activeContractVerify as `0x${string}`,
        functionName: 'verify',
        args: [id],
        value: 0n,
      })

      // genlayer-js handles receipt internally. Poll for updated status.
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const fresh = await fetchSubs()
        const entry = (fresh || {})[id]
        if (entry?.status !== 'pending') break
      }
    } catch (e: any) {
      setError(e?.cause?.message || e?.shortMessage || e?.message || 'Verification failed')
    } finally { verifyingRef.current = false; setVerifying(null) }
  }

  const verifyAll = async () => {
    for (const [id, s] of Object.entries(subs).filter(([, s]) => s.status === 'pending')) {
      await verifyOne(id)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  const handleFile = (f: File | undefined) => {
    setError(null); setCompressWarn(null); setCompressionInfo(null)
    setCompressedBlob(null); setCompressedBytes(null)
    setCompressedPreview(null); setTaskId(null); setTxHash(null); setResult(null)
    if (!f) { setFile(null); setRawPreview(null); return }
    if (!f.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (f.size > 20 * 1024 * 1024) { setError('File too large (max 20MB)'); return }
    setFile(f)
    setRawPreview(URL.createObjectURL(f))
    compressFile(f)
  }

  const copyText = async (text: string) => { try { await navigator.clipboard.writeText(text) } catch {} }

  const allEntries = Object.entries(subs).sort(([, a], [, b]) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const total = allEntries.length
  const verifiedN = allEntries.filter(([, s]) => s.status === 'verified').length
  const pendingN = allEntries.filter(([, s]) => s.status === 'pending').length
  const rejectedN = allEntries.filter(([, s]) => s.status === 'rejected').length

  const viewAbbr: Record<View, string> = { task: 'Task', dashboard: 'Activity', submit: 'Submit' }

  return (
    <main className="min-h-screen font-sans bg-canvas">
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src="/tv1.png" alt="Task Verifier" className="w-8 h-8 sm:w-10 sm:h-10 rounded-sm object-contain" />
            <span className="hidden sm:inline text-[15px] font-semibold text-ink-deep tracking-tight">Task Verifier</span>
          </div>

          <div className="flex bg-canvas-surface rounded-sm border border-border p-0.5 shrink-0">
            {(['task', 'dashboard', 'submit'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 sm:px-4 py-1 text-[12px] sm:text-[14px] font-semibold rounded-sm transition-colors ${
                  view === v ? 'bg-brand-dark text-white' : 'text-ink-muted hover:text-brand'
                }`}>
                {viewAbbr[v]}
              </button>
            ))}
          </div>

          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-8 sm:py-12 md:py-16">

        {/* ── Network selector (hidden on landing page) ── */}
        {view !== 'task' && (hasBradbury || hasStudio) && (
          <div className="mb-8 flex items-center gap-3 flex-wrap">
            {hasBradbury && (
              <button onClick={async () => {
                try {
                  await getProvider().request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${BRADBURY.id.toString(16)}` }],
                  })
                  setNetwork('bradbury')
                } catch {}
              }}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-sm border transition-all ${
                  network === 'bradbury'
                    ? 'border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f]'
                    : 'border-border text-ink-faint hover:text-ink-muted'
                }`}>
                ⚡ Bradbury {contractBradbury.slice(0, 6)}…{contractBradbury.slice(-4)}
              </button>
            )}
            {hasStudio && (
              <button onClick={async () => {
                const hexId = `0x${studionet.id.toString(16)}`
                try {
                  await getProvider().request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: hexId }],
                  })
                  setNetwork('studionet')
                } catch (e: any) {
                  if (e.code === 4902) {
                    await getProvider().request({
                      method: 'wallet_addEthereumChain',
                      params: [{
                        chainId: hexId,
                        chainName: 'GenLayer Studio',
                        rpcUrls: ['https://studio.genlayer.com/api'],
                        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
                      }],
                    })
                    setNetwork('studionet')
                  }
                }
              }}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-sm border transition-all ${
                  network === 'studionet'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-border text-ink-faint hover:text-ink-muted'
                }`}>
                🧪 Studio {contractStudio.slice(0, 6)}…{contractStudio.slice(-4)}
              </button>
            )}
          </div>
        )}

        {/* ── Missing contract banner ── */}
        {!contractAddr && view !== 'task' && (
          <div className="py-20 text-center border border-border rounded-sm bg-canvas">
            <p className="text-[16px] font-semibold text-ink-muted mb-1.5">No contract configured</p>
            <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
              Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT</code> and/or<br />
              <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT_STUDIO</code>
              {' '}in your environment variables.
            </p>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 p-3 sm:p-4 border border-red-300/70 bg-red-50 rounded-sm flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <span className="text-red-500 text-[15px] mt-0.5 shrink-0">⚠</span>
              <p className="text-[13px] sm:text-[14px] text-red-800 leading-[1.5]">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-[16px] leading-none shrink-0 font-bold">&times;</button>
          </div>
        )}

        {/* ════════ TASK INFO ════════ */}
        {view === 'task' && (
          <>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">GenLayer Post Verifier</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                Take a screenshot of a <a href="https://x.com/GenLayer" target="_blank" rel="noopener" className="font-bold text-brand hover:underline">@GenLayer</a> post on X, upload it here, and our AI will check it&rsquo;s the real deal. Results live on the blockchain forever.
              </p>
            </div>

            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
              <img src="/genlayer-logo.jpeg" alt="GenLayer" className="h-8 w-auto object-contain" />
              <span className="text-[13px] text-ink-faint font-medium">Powered by GenLayer AI consensus</span>
            </div>

            <div className="space-y-6">
              {[
                { num: '1', icon: '📸', title: 'Screenshot a post', desc: 'Find any post from @GenLayer on X and take a screenshot.' },
                { num: '2', icon: '📤', title: 'Upload it here', desc: 'Drop the screenshot. The app shrinks it down automatically so it fits.' },
                { num: '3', icon: '🔗', title: 'Submit', desc: 'Connect your wallet and submit. Your screenshot goes straight to the blockchain.' },
                { num: '4', icon: '🤖', title: 'AI checks it', desc: 'Our AI validators look at the screenshot and check if it really is a GenLayer post.' },
                { num: '5', icon: '✅', title: 'Get the result', desc: 'The answer (verified or rejected) is stored permanently. Check the Activity tab.' },
              ].map(step => (
                <div key={step.num} className="flex gap-4 sm:gap-5 p-4 sm:p-5 border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors">
                  <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-sm font-bold text-[15px] text-white"
                    style={{ backgroundColor: '#1e3a5f' }}>
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

        {/* ════════ DASHBOARD ════════ */}
        {contractAddr && view === 'dashboard' && (
          <>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Activity</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                All submissions verified by GenLayer AI consensus.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-8">
              <div className="p-2.5 sm:p-4 border border-border rounded-sm bg-canvas text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1">Total</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-ink-deep leading-tight">{total}</div>
              </div>
              <div className="p-2.5 sm:p-4 border border-emerald-200 rounded-sm bg-emerald-50/50 text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Verified ✓</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-emerald-700 leading-tight">{verifiedN}</div>
              </div>
              <div className="p-2.5 sm:p-4 border border-amber-200 rounded-sm bg-amber-50/50 text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-amber-600 mb-1">Pending</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-amber-700 leading-tight">{pendingN}</div>
              </div>
              <div className="p-2.5 sm:p-4 border border-red-200 rounded-sm bg-red-50/50 text-center">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-red-600 mb-1">Rejected</div>
                <div className="text-[22px] sm:text-[28px] font-bold text-red-700 leading-tight">{rejectedN}</div>
              </div>
            </div>

            {/* Verify all */}
            {pendingN > 0 && isConnected && (
              <button onClick={verifyAll} disabled={!!verifying}
                className="mb-6 px-5 py-2 bg-brand-dark hover:opacity-70 disabled:opacity-40 text-white text-[14px] font-semibold rounded-sm transition-all">
                {verifying ? 'Verifying…' : `Verify all pending (${pendingN})`}
              </button>
            )}

            {/* Activity Feed */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Recent Submissions</h2>
                <button onClick={fetchSubs} disabled={loading}
                  className="text-[13px] font-semibold text-ink-muted hover:text-brand transition-colors">
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {total === 0 ? (
                <div className="py-12 sm:py-16 text-center border border-border rounded-sm bg-canvas">
                  <div className="text-3xl mb-3">📸</div>
                  <p className="text-[15px] sm:text-[16px] font-semibold text-ink-muted mb-1">No submissions yet</p>
                  <p className="text-[13px] sm:text-[14px] text-ink-faint max-w-sm mx-auto leading-[1.5] px-3">
                    Be the first to upload a GenLayer post screenshot for verification.
                  </p>
                  {!isConnected && (
                    <button onClick={() => open()}
                      className="mt-4 h-9 px-5 rounded-md text-[13px] font-semibold text-white transition-all"
                      style={{ backgroundColor: '#1e3a5f', border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(30,58,95,0.3)' }}>
                      Connect to start
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {allEntries.map(([id, s]) => {
                    const isVer = s.status === 'verified'
                    const isRej = s.status === 'rejected'
                    const isPen = s.status === 'pending'
                    const borderCls = isVer ? 'border-emerald-200 bg-emerald-50/30'
                      : isRej ? 'border-red-200 bg-red-50/30'
                      : 'border-border'
                    const badgeCls = isVer
                      ? 'border-emerald-300/60 bg-emerald-50 text-emerald-800'
                      : isRej
                      ? 'border-red-300/60 bg-red-50 text-red-800'
                      : 'border-amber-300/60 bg-amber-50 text-amber-800'
                    const badgeLabel = isVer ? '✓ Verified' : isRej ? '✗ Rejected' : 'Pending'
                    return (
                      <article key={id} className={`p-3 sm:p-4 border rounded-sm bg-canvas group transition-colors ${borderCls}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${badgeCls}`}>
                                {badgeLabel}
                              </span>
                              <span className="text-[10px] sm:text-[11px] font-semibold text-ink-faint font-mono truncate max-w-[120px] sm:max-w-none">{id}</span>
                              <span className="text-[10px] text-ink-faint font-mono">{fmtBytes(s.img_size)}</span>
                            </div>
                            <p className="text-[11px] sm:text-[12px] text-ink-faint mt-0.5 font-mono">
                              submitted by {fmtAddr(s.submitter)} · {new Date(s.timestamp).toLocaleString()}
                            </p>
                            {s.verdict && (
                              <p className={`text-[12px] sm:text-[13px] italic mt-2 leading-[1.5] ${isVer ? 'text-emerald-700' : 'text-ink-muted'}`}>
                                &ldquo;{s.verdict}&rdquo;
                              </p>
                            )}
                          </div>
                          {isPen && (
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

        {/* ════════ SUBMIT ════════ */}
        {contractAddr && view === 'submit' && (
          <>
            <div className="mb-6 sm:mb-10">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Verify a GenLayer Post</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                Upload a screenshot of a <a href="https://x.com/GenLayer" target="_blank" rel="noopener" className="font-bold text-brand hover:underline">@GenLayer</a> post. The app auto-compresses it and submits to GenLayer AI for on-chain verification.
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint font-mono">
                <span className={`inline-block w-2 h-2 rounded-full ${network === 'bradbury' ? 'bg-[#1e3a5f]' : 'bg-indigo-500'}`} />
                {netCfg.label} · {contractAddr.slice(0, 10)}…{contractAddr.slice(-6)}
              </div>
            </div>

            {submitted && (
              <div className="mb-6 p-4 border border-emerald-300/60 bg-emerald-50 rounded-sm">
                <p className="text-[14px] font-semibold text-emerald-800">✓ Submitted! Your screenshot is pending AI verification.</p>
              </div>
            )}

            {!isConnected ? (
              <button onClick={() => open()}
                className="w-full py-12 sm:py-16 text-center border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors cursor-pointer">
                <p className="text-[15px] sm:text-[16px] font-semibold text-ink-muted mb-1">Connect your wallet</p>
                <p className="text-[13px] sm:text-[14px] text-ink-faint px-3">Connect to submit screenshots for verification.</p>
              </button>
            ) : (
              <div className="p-3 sm:p-5 border border-border rounded-sm bg-canvas">
                <div className="grid gap-4">

                  {/* Upload */}
                  <div>
                    <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Screenshot</label>
                    <label className={`relative flex flex-col items-center justify-center w-full h-40 rounded-sm border border-dashed cursor-pointer transition-colors ${
                      rawPreview ? 'border-brand/30 bg-blue-50/50' : 'border-border hover:border-brand/40 bg-canvas-surface'
                    }`}>
                      {rawPreview ? (
                        <img src={rawPreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-sm p-2" />
                      ) : (
                        <div className="text-center">
                          <div className="text-2xl mb-1">📸</div>
                          <span className="text-[14px] font-semibold text-ink-muted">Drop your GenLayer post screenshot</span>
                          <span className="block text-[12px] text-ink-faint mt-0.5">PNG, JPEG, WebP · max 20MB</span>
                        </div>
                      )}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleFile(e.target.files?.[0])}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                    {rawPreview && (
                      <button type="button" onClick={() => { setFile(null); setRawPreview(null); setCompressedPreview(null); setCompressedBlob(null); setCompressedBytes(null); setCompressionInfo(null); setCompressWarn(null); setTaskId(null); setTxHash(null); setResult(null) }}
                        className="mt-1.5 text-[12px] font-semibold text-ink-faint hover:text-brand transition-colors">Remove</button>
                    )}
                  </div>

                  {/* Compression info / Debug panel */}
                  {compressionInfo && (
                    <div className="border border-border rounded-sm overflow-hidden">
                      <div className="px-3 py-2 bg-canvas-surface border-b border-border flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Debug: Image</span>
                        <span className="text-[10px] text-ink-faint ml-auto font-mono">w:{compressionInfo.width} × h:{compressionInfo.height}</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 text-[12px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-ink-faint">Original:</span>
                          <span className="font-bold text-ink">{fmtBytes(compressionInfo.originalSize)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-ink-faint">Compressed:</span>
                          <span className={`font-bold ${compressedBytes && compressedBytes.length > 50000 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {fmtBytes(compressionInfo.compressedSize)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-ink-faint">Ratio:</span>
                          <span className="font-bold text-brand">-{compressionInfo.ratio}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-ink-faint">Limit:</span>
                          <span className={compressedBytes && compressedBytes.length > 50000 ? 'text-red-600 font-bold' : 'text-ink-faint'}>
                            50KB (Bradbury)
                          </span>
                        </div>
                      </div>
                      {compressWarn && (
                        <div className="px-3 py-2 bg-red-50 border-t border-red-200 text-[12px] text-red-700 font-medium">{compressWarn}</div>
                      )}
                    </div>
                  )}

                  {/* Side-by-side preview */}
                  {rawPreview && compressedPreview && (
                    <div className="grid grid-cols-2 gap-3 border border-border rounded-sm p-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">Original</div>
                        <img src={rawPreview} alt="Original" className="w-full h-28 object-contain rounded-sm border border-border" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1">Compressed ({fmtBytes(compressionInfo?.compressedSize || 0)})</div>
                        <img src={compressedPreview} alt="Compressed" className="w-full h-28 object-contain rounded-sm border border-border" />
                      </div>
                    </div>
                  )}

                  {/* TX Debug Panel */}
                  {(txHash || taskId || result) && (
                    <div className="border border-indigo-200 bg-indigo-50/30 rounded-sm overflow-hidden">
                      <div className="px-3 py-2 bg-indigo-100/50 border-b border-indigo-200 flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Debug: Transaction</span>
                      </div>
                      <div className="p-3 space-y-1.5 text-[12px] font-mono">
                        {txHash && (
                          <div className="flex items-center gap-2">
                            <span className="text-ink-faint shrink-0">TX:</span>
                            <span className="text-ink break-all">{txHash}</span>
                          </div>
                        )}
                        {taskId && (
                          <div className="flex items-center gap-2">
                            <span className="text-ink-faint shrink-0">ID:</span>
                            <span className="font-bold text-ink-deep">{taskId}</span>
                          </div>
                        )}
                        {result && (
                          <div className="flex items-center gap-2">
                            <span className="text-ink-faint shrink-0">Result:</span>
                            <span className={`font-bold ${result.status === 'verified' ? 'text-emerald-600' : result.status === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                              {result.status} — {result.reason}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Submit */}
                  <button onClick={submitProof}
                    disabled={submitting || !compressedBytes || (!!compressedBytes && compressedBytes.length > 55000)}
                    className={`w-full py-2.5 text-white text-[15px] font-bold rounded-sm transition-all ${
                      !compressedBytes || (!!compressedBytes && compressedBytes.length > 55000)
                        ? 'bg-ink-faint/40 cursor-not-allowed'
                        : submitting
                        ? 'bg-brand/70 cursor-wait'
                        : 'bg-brand-dark hover:opacity-70'
                    }`}>
                    {!compressedBytes ? 'Select an image first'
                      : submitting ? 'Submitting to GenLayer…'
                      : compressedBytes.length > 50000 ? `Image too large (${fmtBytes(compressedBytes.length)})`
                      : `Submit ${(compressedBytes && compressedBytes.length) ? fmtBytes(compressedBytes.length) : ''} →`}
                  </button>

                  {submitting && (
                    <div className="text-center text-[12px] text-ink-muted font-mono animate-pulse">
                      Waiting for transaction confirmation… this may take 1-2 minutes
                    </div>
                  )}
                </div>
              </div>
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
