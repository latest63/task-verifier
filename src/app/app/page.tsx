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
type View = 'task' | 'dashboard' | 'submit' | 'profile'
type TaskType = 'post_screenshot' | 'liked_post_screenshot' | 'profile_verification'

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
  status: string; verdict: string; timestamp: string;
  _source?: 'post' | 'liked' | 'profile'
}

const fmtAddr = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
const fmtBytes = (b: number) =>
  b < 1024 ? `${b}B` : b < 10240 ? `${(b / 1024).toFixed(1)}KB` : `${Math.round(b / 1024)}KB`

export default function Home() {
  const contractBradbury = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT || ''
  const contractStudio = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_STUDIO || ''
  const likedContractBradbury = process.env.NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT || ''
  const likedContractStudio = process.env.NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT_STUDIO || ''
  const profileContract = process.env.NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT || ''
  const profileContractStudio = process.env.NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT_STUDIO || ''
  const hasBradbury = !!contractBradbury || !!likedContractBradbury || !!profileContract
  const hasStudio = !!contractStudio || !!likedContractStudio || !!profileContractStudio

  const [network, setNetwork] = useState<NetworkId>(
    hasBradbury ? 'bradbury' : hasStudio ? 'studionet' : 'bradbury'
  )

  const contractAddr = network === 'bradbury' ? contractBradbury : contractStudio
  const likedAddr = network === 'bradbury' ? likedContractBradbury : likedContractStudio
  const profileAddr = network === 'bradbury' ? profileContract : profileContractStudio
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

  const [taskType, setTaskType] = useState<TaskType>('post_screenshot')

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

  // Dropdown open states for custom selects
  const [netOpen, setNetOpen] = useState(false)
  const [actTaskOpen, setActTaskOpen] = useState(false)
  const [subTaskOpen, setSubTaskOpen] = useState(false)
  const netRef = useRef<HTMLDivElement>(null)
  const actTaskRef = useRef<HTMLDivElement>(null)
  const subTaskRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Profile verification state
  const CODE_STORAGE_KEY = 'profile_verify_code'
  const CODE_EXPIRY_KEY = 'profile_verify_expires'

  const [xHandle, setXHandle] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [profileRawPreview, setProfileRawPreview] = useState<string | null>(null)
  const [profileCompressedBlob, setProfileCompressedBlob] = useState<Blob | null>(null)
  const [profileCompressedPreview, setProfileCompressedPreview] = useState<string | null>(null)
  const [profileCompressedBytes, setProfileCompressedBytes] = useState<Uint8Array | null>(null)
  const [profileCompressionInfo, setProfileCompressionInfo] = useState<{ originalSize: number; compressedSize: number; ratio: number; width: number; height: number } | null>(null)
  const [profileCompressWarn, setProfileCompressWarn] = useState<string | null>(null)
  const [profileTxHash, setProfileTxHash] = useState<string | null>(null)
  const [profileTaskId, setProfileTaskId] = useState<string | null>(null)
  const [profileResult, setProfileResult] = useState<{ status: string; reason: string } | null>(null)
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileSubmitted, setProfileSubmitted] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileVerifying, setProfileVerifying] = useState(false)
  const [tweetUrl, setTweetUrl] = useState('')
  const [verifiedHandle, setVerifiedHandle] = useState<string | null>(null)
  const [checkingHandle, setCheckingHandle] = useState(false)
  const profileCanvasRef = useRef<HTMLCanvasElement>(null)

  // Restore code from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CODE_STORAGE_KEY)
      const expiry = localStorage.getItem(CODE_EXPIRY_KEY)
      if (saved && expiry) {
        const exp = parseInt(expiry, 10)
        if (Date.now() < exp) {
          setVerifyCode(saved)
          setCodeExpiresAt(exp)
        } else {
          localStorage.removeItem(CODE_STORAGE_KEY)
          localStorage.removeItem(CODE_EXPIRY_KEY)
        }
      }
    } catch {}
  }, [])

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let code = ''
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    for (let i = 0; i < 6; i++) code += chars[array[i] % chars.length]
    const expires = Date.now() + 5 * 60 * 1000
    setVerifyCode(code)
    setCodeExpiresAt(expires)
    setCountdown(300)
    // Persist to localStorage
    try {
      localStorage.setItem(CODE_STORAGE_KEY, code)
      localStorage.setItem(CODE_EXPIRY_KEY, String(expires))
    } catch {}
  }

  // 5-min countdown
  useEffect(() => {
    if (!codeExpiresAt) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((codeExpiresAt - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        setVerifyCode('')
        setCodeExpiresAt(null)
        try {
          localStorage.removeItem(CODE_STORAGE_KEY)
          localStorage.removeItem(CODE_EXPIRY_KEY)
        } catch {}
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [codeExpiresAt])

  // Check if wallet already has verified handle — always run when connected
  useEffect(() => {
    if (!isConnected || !address || !profileAddr || !glClient) {
      setVerifiedHandle(null)
      return
    }
    setCheckingHandle(true)
    glClient.readContract({
      address: profileAddr as `0x${string}`,
      functionName: 'get_x_handle',
      args: [address.toLowerCase()],
    }).then((handle: any) => {
      if (handle && typeof handle === 'string' && handle.length > 0) {
        setVerifiedHandle(handle)
      } else {
        setVerifiedHandle(null)
        // Redirect to profile verification if on a gated task
        if (taskType === 'liked_post_screenshot') {
          setTaskType('profile_verification')
        }
      }
    }).catch(() => {
      setVerifiedHandle(null)
    }).finally(() => setCheckingHandle(false))
  }, [isConnected, address, profileAddr, glClient, view, taskType])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (netRef.current && !netRef.current.contains(e.target as Node)) setNetOpen(false)
      if (actTaskRef.current && !actTaskRef.current.contains(e.target as Node)) setActTaskOpen(false)
      if (subTaskRef.current && !subTaskRef.current.contains(e.target as Node)) setSubTaskOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])
  useEffect(() => { if (profileError) { const t = setTimeout(() => setProfileError(null), 6000); return () => clearTimeout(t) } }, [profileError])

  // ── Fetch submissions ────────────────────────────────────────────

  const fetchSubs = useCallback(async (likedAddr?: string) => {
    if (!contractAddr || !glClient) return
    setLoading(true)
    try {
      // Fetch from post verifier
      const raw = await glClient.readContract({
        address: contractAddr as `0x${string}`,
        functionName: 'get_all',
        args: [],
      })
      const data = raw && typeof raw === 'object' ? raw as unknown as Record<string, SubData> : {}
      // Tag post verifier entries
      const tagged: Record<string, SubData> = {}
      for (const [k, v] of Object.entries(data)) {
        tagged[k] = { ...v as SubData, _source: 'post' as const }
      }

      // Also fetch from liked post verifier if available
      const likedAddrResolved = likedAddr || (network === 'bradbury' ? likedContractBradbury : likedContractStudio)
      if (likedAddrResolved) {
        try {
          const likedRaw = await glClient.readContract({
            address: likedAddrResolved as `0x${string}`,
            functionName: 'get_all',
            args: [],
          })
          const likedData = likedRaw && typeof likedRaw === 'object' ? likedRaw as unknown as Record<string, SubData> : {}
          for (const [k, v] of Object.entries(likedData)) {
            tagged[k] = { ...v as SubData, _source: 'liked' as const }
          }
        } catch {}
      }

      // Also fetch from profile verifier if available
      const profileAddrResolved = network === 'bradbury' ? profileContract : profileContractStudio
      if (profileAddrResolved) {
        try {
          const profRaw = await glClient.readContract({
            address: profileAddrResolved as `0x${string}`,
            functionName: 'get_all',
            args: [],
          })
          const profData = profRaw && typeof profRaw === 'object' ? profRaw as unknown as Record<string, SubData> : {}
          for (const [k, v] of Object.entries(profData)) {
            tagged[k] = { ...v as SubData, _source: 'profile' as const }
          }
        } catch {}
      }

      setSubs(tagged)
      return tagged
    } catch (e) { console.error('fetch error:', e); return {} } finally { setLoading(false) }
  }, [contractAddr, glClient, likedContractBradbury, likedContractStudio, network])

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
    if (!address || !compressedBytes || !contractAddr) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true); setTxHash(null); setTaskId(null); setResult(null)
    try {
      // Detect wallet's actual chain — don't rely on toggle state
      const walletChainHex: string = await getProvider().request({ method: 'eth_chainId' })
      const walletChainId = parseInt(walletChainHex, 16)
      const isWalletOnStudio = walletChainId === 61999
      const activeChain = isWalletOnStudio ? studionet : testnetBradbury
      // Pick the right contract based on task type
      const activeContract = taskType === 'profile_verification'
        ? (isWalletOnStudio ? profileContractStudio : profileContract)
        : taskType === 'liked_post_screenshot'
        ? (isWalletOnStudio ? likedContractStudio : likedContractBradbury)
        : (isWalletOnStudio ? contractStudio : contractBradbury)

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
    if (!address) return
    if (verifyingRef.current) return
    verifyingRef.current = true
    setVerifying(id)
    try {
      // Detect wallet's chain
      const walletChainHexVerify: string = await getProvider().request({ method: 'eth_chainId' })
      const walletChainIdVerify = parseInt(walletChainHexVerify, 16)
      const isWalletOnStudioVerify = walletChainIdVerify === 61999
      const activeChainVerify = isWalletOnStudioVerify ? studionet : testnetBradbury

      // Pick the right contract based on submission source
      const entry = subs[id]
      const isLiked = entry?._source === 'liked'
      const isProfile = entry?._source === 'profile'
      const activeContractVerify = isProfile
        ? (isWalletOnStudioVerify ? profileContractStudio : profileContract)
        : isLiked
        ? (isWalletOnStudioVerify ? likedContractStudio : likedContractBradbury)
        : (isWalletOnStudioVerify ? contractStudio : contractBradbury)

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

  const DEPLOYER = '0x823f5d1f084448091800fee6f0bbf5bbe98aa98e'
  const isDeployer = address?.toLowerCase() === DEPLOYER.toLowerCase()

  const allEntries = Object.entries(subs)
    .filter(([, s]) => view !== 'dashboard' || (taskType === 'post_screenshot' ? s._source === 'post' : taskType === 'profile_verification' ? s._source === 'profile' : s._source === 'liked'))
    .filter(([, s]) => view !== 'dashboard' || isDeployer || s.submitter?.toLowerCase() === address?.toLowerCase())
    .sort(([, a], [, b]) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const total = allEntries.length
  const verifiedN = allEntries.filter(([, s]) => s.status === 'verified').length
  const pendingN = allEntries.filter(([, s]) => s.status === 'pending').length
  const rejectedN = allEntries.filter(([, s]) => s.status === 'rejected').length

  const viewAbbr: Record<View, string> = { task: 'Task', dashboard: 'Campaign', submit: 'Submit', profile: 'Profile' }

  return (
    <main className="min-h-screen font-sans bg-canvas">
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-2 sm:px-8 py-0.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Logo */}
            <div className="flex items-center shrink-0">
              <img src="/logo-nav.png" alt="Task Verifier" className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px] rounded-sm object-contain" />
            </div>
            {/* Nav tabs — centered on mobile + desktop */}
            <div className="flex justify-center flex-1 min-w-0 mr-8 sm:mr-0">
              <div className="flex bg-canvas-surface rounded-lg border border-border p-[2px]">
                {(['task', 'dashboard', 'submit', 'profile'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-1.5 sm:px-5 py-1 sm:py-1.5 text-[11px] sm:text-[14px] font-semibold rounded-md transition-colors ${
                      view === v ? 'bg-brand-dark text-white shadow-sm' : 'text-ink-muted hover:text-brand'
                    }`}>
                    {viewAbbr[v]}
                  </button>
                ))}
              </div>
            </div>
            {/* Wallet — compact icon button */}
            <div className="shrink-0">
              <ConnectWallet />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 md:py-14">

        {/* ── Network + Task selectors (hidden on landing page) ── */}
        {view !== 'task' && (hasBradbury || hasStudio) && (
          <div className="mb-8 flex items-center gap-4 flex-wrap">
            {/* Network dropdown */}
            <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Network
              <div className="relative" ref={netRef}>
                <button onClick={() => setNetOpen(!netOpen)} onBlur={() => { dropRef.current = setTimeout(() => setNetOpen(false), 150) }} onFocus={() => { if (dropRef.current) clearTimeout(dropRef.current) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-sm border border-border bg-canvas-surface hover:border-brand/40 transition-colors">
                  <span>{network === 'bradbury' ? '⚡ Bradbury' : '🧪 Studio'}</span>
                  <svg className="w-3 h-3 text-ink-faint shrink-0" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {netOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] border border-border rounded-sm bg-canvas-surface shadow-lg overflow-hidden">
                    {hasBradbury && (
                      <button onMouseDown={async (e) => { e.preventDefault(); setNetOpen(false);
                        try { await getProvider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${BRADBURY.id.toString(16)}` }] }); setNetwork('bradbury') } catch {}
                      }} className="w-full text-left px-3 py-1.5 text-[12px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5">
                        ⚡ Bradbury
                      </button>
                    )}
                    {hasStudio && (
                      <button onMouseDown={async (e) => { e.preventDefault(); setNetOpen(false);
                        const hexId = `0x${studionet.id.toString(16)}`
                        try { await getProvider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] }); setNetwork('studionet') }
                        catch (e: any) { if (e.code === 4902) { await getProvider().request({ method: 'wallet_addEthereumChain', params: [{ chainId: hexId, chainName: 'GenLayer Studio', rpcUrls: ['https://studio.genlayer.com/api'], nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 } }] }); setNetwork('studionet') } }
                      }} className="w-full text-left px-3 py-1.5 text-[12px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5">
                        🧪 Studio
                      </button>
                    )}
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        {/* ── Missing contract banner ── */}
        {view !== 'task' && (
          <>
            {view === 'submit' && taskType === 'profile_verification' ? (
              !profileAddr && (
                <div className="py-20 text-center border border-border rounded-sm bg-canvas">
                  <p className="text-[16px] font-semibold text-ink-muted mb-1.5">Profile Verifier not deployed</p>
                  <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
                    Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT</code> in your environment variables.
                  </p>
                </div>
              )
            ) : view === 'submit' && taskType === 'liked_post_screenshot' ? (
              !likedAddr && (
                <div className="py-20 text-center border border-border rounded-sm bg-canvas">
                  <p className="text-[16px] font-semibold text-ink-muted mb-1.5">Liked Post Verifier not deployed</p>
                  <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
                    Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_LIKED_VERIFIER_CONTRACT</code> in your environment variables.
                  </p>
                </div>
              )
            ) : (
              !contractAddr && (
                <div className="py-20 text-center border border-border rounded-sm bg-canvas">
                  <p className="text-[16px] font-semibold text-ink-muted mb-1.5">No contract configured</p>
                  <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
                    Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT</code> and/or<br />
                    <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_VERIFIER_CONTRACT_STUDIO</code>
                    {' '}in your environment variables.
                  </p>
                </div>
              )
            )}
          </>
        )}

        {/* ── PROFILE ── */}
        {view === 'profile' && !profileAddr && (
          <div className="py-20 text-center border border-border rounded-sm bg-canvas">
            <p className="text-[16px] font-semibold text-ink-muted mb-1.5">Profile Verifier not deployed</p>
            <p className="text-[14px] text-ink-faint max-w-md mx-auto leading-[1.5]">
              Set <code className="text-[13px] bg-canvas-surface px-1.5 py-0.5 rounded-sm font-mono text-ink">NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT</code>{network === 'studionet' ? ' or NEXT_PUBLIC_PROFILE_VERIFIER_CONTRACT_STUDIO' : ''} in your environment variables.
            </p>
          </div>
        )}
        {view === 'profile' && profileAddr && (
          <>
            <div className="mb-6 sm:mb-10">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Your X Profile</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                See which X/Twitter handle is linked to your wallet on-chain.
              </p>
            </div>

            {checkingHandle && (
              <div className="mb-6 p-5 border border-border rounded-sm bg-canvas-surface flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                <span className="text-[13px] text-ink-muted">Checking verification status…</span>
              </div>
            )}

            {verifiedHandle ? (
              <div className="mb-6 p-5 border border-emerald-200 bg-emerald-50/60 rounded-sm flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center">
                  <img src={`https://unavatar.io/x/${verifiedHandle}`}
                       alt={`@${verifiedHandle}`}
                       className="w-full h-full object-cover"
                       onError={(e) => {
                         const target = e.currentTarget
                         target.style.display = 'none'
                         const fallback = target.nextElementSibling as HTMLElement | null
                         if (fallback) fallback.style.display = 'flex'
                       }} />
                  <div className="hidden w-full h-full items-center justify-center bg-emerald-100">
                    <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] font-bold text-emerald-800">@{verifiedHandle}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-700 border border-emerald-300">Verified</span>
                  </div>
                  <p className="text-[13px] text-emerald-700 mt-0.5">Your X handle is verified on-chain. Go to the Submit tab to verify new posts.</p>
                </div>
              </div>
            ) : (
              !checkingHandle && (
                <div className="mb-6 p-5 border border-border rounded-sm bg-canvas-surface text-center">
                  <p className="text-[15px] font-semibold text-ink-muted mb-1">No X profile linked</p>
                  <p className="text-[13px] text-ink-faint mb-4">Your wallet doesn&rsquo;t have a verified X handle yet.</p>
                  <button onClick={() => { setView('submit'); setTaskType('profile_verification') }}
                    className="px-5 py-2 bg-brand-dark text-white text-[14px] font-bold rounded-sm hover:opacity-80 transition-all">
                    Verify Your X Profile
                  </button>
                </div>
              )
            )}
          </>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 p-3 sm:p-4 border border-red-300/70 bg-red-50 rounded-sm flex items-start justify-between gap-2 shadow-sm">
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3.5M8 11v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-[13px] sm:text-[14px] text-red-800 leading-[1.5]">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors shrink-0 p-0.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* ════════ CAMPAIGN LANDING ════════ */}
        {view === 'task' && (
          <>
            {/* Campaign Hero */}
            <div className="mb-10 sm:mb-14">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand bg-brand/5 px-3 py-1 rounded-sm border border-brand/20">Sponsored Campaign</span>
              </div>
              <h1 className="text-[28px] sm:text-[38px] font-extrabold text-ink-deep leading-[1.1] tracking-[-0.02em] max-w-2xl">
                Verify. Earn. Prove.<br />
                <span className="text-brand">GenLayer x Task Verifier</span>
              </h1>
              <p className="mt-3 text-[15px] sm:text-[17px] text-ink leading-[1.6] max-w-xl">
                Task Verifier is running a verification campaign powered by GenLayer AI consensus. Complete tasks, prove your X profile, and help test the future of on-chain verification.
              </p>
              <div className="flex items-center gap-3 mt-5 pb-6 border-b border-border">
                <img src="/genlayer-logo.jpeg" alt="GenLayer" className="h-7 w-auto object-contain" />
                <span className="text-[13px] text-ink-faint font-medium">Powered by GenLayer AI consensus</span>
              </div>
            </div>

            {/* Campaign Steps */}
            <div className="space-y-4">
              {/* Step 1 — always accessible */}
              <div
                className="group p-5 sm:p-6 border border-border rounded-sm bg-canvas hover:bg-canvas-surface hover:border-brand/40 transition-all cursor-pointer"
                onClick={() => { setView('submit'); setTaskType('post_screenshot') }}>
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm font-bold text-lg text-white"
                    style={{ backgroundColor: '#1e3a5f' }}>
                    1
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Post Screenshot</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-300">Test</span>
                    </div>
                    <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                      Take a screenshot of any post from @GenLayer on X and verify its realness.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-brand group-hover:gap-2 transition-all">
                      Join Campaign →
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div
                className="group p-5 sm:p-6 border border-border rounded-sm bg-canvas hover:bg-canvas-surface hover:border-brand/40 transition-all cursor-pointer"
                onClick={() => { setView('submit'); setTaskType('profile_verification') }}>
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm font-bold text-lg text-white"
                    style={{ backgroundColor: '#1e3a5f' }}>
                    2
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Verify X Profile</h3>
                      {verifiedHandle && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">Done ✓</span>
                      )}
                    </div>
                    <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                      Prove you own your X/Twitter handle on-chain. Tweet a code, submit the tweet URL, and AI validators confirm it.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-brand group-hover:gap-2 transition-all">
                      Join Campaign →
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 — requires profile verification */}
              {(!isConnected || verifiedHandle) ? (
                <div
                  className="group p-5 sm:p-6 border border-border rounded-sm bg-canvas hover:bg-canvas-surface hover:border-brand/40 transition-all cursor-pointer"
                  onClick={() => { setView('submit'); setTaskType('liked_post_screenshot') }}>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm font-bold text-lg text-white"
                      style={{ backgroundColor: '#1e3a5f' }}>
                      3
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Liked Post Screenshot</h3>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                        Take a screenshot of a liked post from @GenLayer on X.
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-brand group-hover:gap-2 transition-all">
                        Join Campaign →
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="group p-5 sm:p-6 border border-dashed border-ink-faint/30 rounded-sm bg-canvas-surface/50 cursor-pointer"
                  onClick={() => { setView('submit'); setTaskType('profile_verification') }}>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm font-bold text-lg text-ink-faint/40 border-2 border-dashed border-ink-faint/20">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="3.5" y="6.5" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 6.5V4.5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[16px] sm:text-[18px] font-bold text-ink-faint/40">Liked Post Screenshot</h3>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-ink-faint/50 leading-[1.6]">
                        Verify your X/Twitter handle first — then you can submit liked post screenshots.
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-ink-faint/50">
                        Verify X Profile first →
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════ DASHBOARD ════════ */}
        {(contractAddr || likedAddr || profileAddr) && view === 'dashboard' && (
          <>
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">Campaign Dashboard</h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                All submissions verified by GenLayer AI consensus for the Task Verifier campaign.
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
                <div className="flex items-center gap-3">
                  <h2 className="text-[16px] sm:text-[18px] font-bold text-ink-deep">Recent Submissions</h2>
                  <div className="relative" ref={actTaskRef}>
                    <button onClick={() => setActTaskOpen(!actTaskOpen)} onBlur={() => { dropRef.current = setTimeout(() => setActTaskOpen(false), 150) }} onFocus={() => { if (dropRef.current) clearTimeout(dropRef.current) }}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-sm border border-border bg-canvas-surface hover:border-brand/40 transition-colors uppercase tracking-wider">
                      <span>{taskType === 'post_screenshot' ? '📸 Post' : taskType === 'profile_verification' ? '👤 Profile' : '❤️ Liked'}</span>
                      <svg className="w-3 h-3 text-ink-faint shrink-0" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {actTaskOpen && (
                      <div className="absolute left-0 top-full mt-1 z-50 min-w-[110px] border border-border rounded-sm bg-canvas-surface shadow-lg overflow-hidden">
                        <button onMouseDown={(e) => { e.preventDefault(); setActTaskOpen(false); setTaskType('post_screenshot') }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5 uppercase tracking-wider">📸 Post</button>
                        <button onMouseDown={(e) => { e.preventDefault(); setActTaskOpen(false); setTaskType('profile_verification') }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5 uppercase tracking-wider">👤 Profile</button>
                        {(!isConnected || verifiedHandle) ? (
                          <button onMouseDown={(e) => { e.preventDefault(); setActTaskOpen(false); setTaskType('liked_post_screenshot') }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5 uppercase tracking-wider">❤️ Liked</button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => fetchSubs()} disabled={loading}
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
        {(taskType === 'profile_verification' ? profileAddr : taskType === 'liked_post_screenshot' ? likedAddr : contractAddr) && view === 'submit' && (
          <>
            <div className="mb-6 sm:mb-10">
              <h1 className="text-[24px] sm:text-[30px] font-extrabold text-ink-deep leading-[1.2] tracking-[-0.75px]">
                {taskType === 'profile_verification' ? 'Verify Your X Profile'
                  : taskType === 'liked_post_screenshot' ? 'Verify a Liked GenLayer Post'
                  : 'Verify a GenLayer Post'}
              </h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-ink leading-[1.5] max-w-xl">
                {taskType === 'profile_verification'
                  ? 'Prove you own your X/Twitter handle. Tweet a one-time code, upload the screenshot of the tweet, and AI validators confirm it on-chain.'
                  : taskType === 'liked_post_screenshot'
                  ? 'Upload a screenshot of a liked post from @GenLayer on X. The AI checks if the post is real.'
                  : 'Upload a screenshot of a post from @GenLayer on X. The AI verifies it\'s a real GenLayer post.'}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint font-mono">
                <span className={`inline-block w-2 h-2 rounded-full ${network === 'bradbury' ? 'bg-[#1e3a5f]' : 'bg-indigo-500'}`} />
                {netCfg.label} · {taskType === 'profile_verification' ? 'Profile' : taskType === 'liked_post_screenshot' ? 'Liked Post' : 'Post'} Verifier
              </div>
            </div>

            {/* Task type dropdown */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">
                Task
                <div className="relative inline-block ml-2" ref={subTaskRef}>
                  <button onClick={() => setSubTaskOpen(!subTaskOpen)} onBlur={() => { dropRef.current = setTimeout(() => setSubTaskOpen(false), 150) }} onFocus={() => { if (dropRef.current) clearTimeout(dropRef.current) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-sm border border-border bg-canvas-surface hover:border-brand/40 transition-colors uppercase tracking-wider">
                    <span>{taskType === 'post_screenshot' ? '📸 Post Screenshot' : taskType === 'profile_verification' ? '👤 Verify X Profile' : '❤️ Liked Post Screenshot'}</span>
                    <svg className="w-3 h-3 text-ink-faint shrink-0" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {subTaskOpen && (
                    <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] border border-border rounded-sm bg-canvas-surface shadow-lg overflow-hidden">
                      <button onMouseDown={(e) => { e.preventDefault(); setSubTaskOpen(false); setTaskType('post_screenshot'); setFile(null); setRawPreview(null); setCompressedPreview(null); setCompressedBlob(null); setCompressedBytes(null); setCompressionInfo(null); setCompressWarn(null); setTaskId(null); setTxHash(null); setResult(null) }} className="w-full text-left px-3 py-1.5 text-[12px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5">📸 Post Screenshot</button>
                      <button onMouseDown={(e) => { e.preventDefault(); setSubTaskOpen(false); setTaskType('profile_verification'); setFile(null); setRawPreview(null); setCompressedPreview(null); setCompressedBlob(null); setCompressedBytes(null); setCompressionInfo(null); setCompressWarn(null); setTaskId(null); setTxHash(null); setResult(null); setXHandle(''); setVerifyCode(''); setCodeExpiresAt(null); setCountdown(0); setTweetUrl(''); setProfileFile(null); setProfileRawPreview(null); setProfileCompressedPreview(null); setProfileCompressedBlob(null); setProfileCompressedBytes(null); setProfileCompressionInfo(null); setProfileCompressWarn(null); setProfileTaskId(null); setProfileTxHash(null); setProfileResult(null) }} className="w-full text-left px-3 py-1.5 text-[12px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5">👤 Verify X Profile</button>
                      {(!isConnected || verifiedHandle) ? (
                        <button onMouseDown={(e) => { e.preventDefault(); setSubTaskOpen(false); setTaskType('liked_post_screenshot'); setFile(null); setRawPreview(null); setCompressedPreview(null); setCompressedBlob(null); setCompressedBytes(null); setCompressionInfo(null); setCompressWarn(null); setTaskId(null); setTxHash(null); setResult(null) }} className="w-full text-left px-3 py-1.5 text-[12px] font-bold hover:bg-canvas-raised transition-colors flex items-center gap-1.5">❤️ Liked Post Screenshot</button>
                      ) : null}
                    </div>
                  )}
                </div>
              </label>
            </div>

            {submitted && (
              <div className="mb-6 p-4 border border-emerald-300/60 bg-emerald-50 rounded-sm shadow-sm">
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5 text-emerald-600 shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="text-[14px] font-semibold text-emerald-800">Submitted! Your screenshot is pending AI verification.</p>
                </div>
              </div>
            )}

            {taskType === 'profile_verification' ? (
              <>
                {!isConnected ? (
                  <button onClick={() => open()}
                    className="w-full py-12 sm:py-16 text-center border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors cursor-pointer">
                    <p className="text-[15px] sm:text-[16px] font-semibold text-ink-muted mb-1">Connect your wallet</p>
                    <p className="text-[13px] sm:text-[14px] text-ink-faint px-3">Connect to verify your X profile on-chain.</p>
                  </button>
                ) : verifiedHandle ? (
                  <div className="mb-6 p-5 border border-emerald-200 bg-emerald-50/60 rounded-sm flex items-center gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center">
                      <img src={`https://unavatar.io/x/${verifiedHandle}`}
                           alt={`@${verifiedHandle}`}
                           className="w-full h-full object-cover"
                           onError={(e) => {
                             const target = e.currentTarget
                             target.style.display = 'none'
                             const fallback = target.nextElementSibling as HTMLElement | null
                             if (fallback) fallback.style.display = 'flex'
                           }} />
                      <div className="hidden w-full h-full items-center justify-center bg-emerald-100">
                        <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-emerald-800">@{verifiedHandle}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-700 border border-emerald-300">Verified</span>
                      </div>
                      <p className="text-[13px] text-emerald-700 mt-0.5">Your X handle is already verified on-chain. Each wallet can only link one handle.</p>
                    </div>
                  </div>
                ) : !verifyCode ? (
                  <div className="mb-6">
                    <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">X / Twitter Handle</label>
                    <div className="flex gap-2">
                      <input type="text" value={xHandle} onChange={(e) => setXHandle(e.target.value.replace('@', '').trim())}
                        placeholder="@yourhandle"
                        className="flex-1 px-3 py-2 text-[14px] border border-border rounded-sm bg-canvas-surface focus:outline-none focus:border-brand transition-colors placeholder:text-ink-faint" />
                      <button onClick={generateCode} disabled={!xHandle || xHandle.length < 2}
                        className="px-4 py-2 bg-brand-dark text-white text-[13px] font-bold rounded-sm hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                        Generate Code
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 border border-brand/30 bg-brand/5 rounded-sm mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Your Verification Code</h3>
                      <div className="relative w-11 h-11 shrink-0">
                        <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                          <circle cx="22" cy="22" r="19" fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
                          <circle cx="22" cy="22" r="19" fill="none"
                            stroke={countdown <= 60 ? '#dc2626' : '#1e3a5f'}
                            strokeWidth="3.5" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 19}`}
                            strokeDashoffset={`${2 * Math.PI * 19 * (1 - countdown / 300)}`}
                            className="transition-all duration-1000 ease-linear" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold font-mono"
                          style={{color: countdown <= 60 ? '#dc2626' : undefined}}>
                          {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                    <div className="text-center py-4 sm:py-5 bg-canvas-surface rounded-sm border border-border">
                      <span className="text-[30px] sm:text-[40px] font-bold tracking-[10px] font-mono text-brand-dark select-all">{verifyCode}</span>
                    </div>
                    <div className="mt-3 bg-canvas-surface border border-border rounded-sm p-3 sm:p-4">
                      <p className="text-[12px] text-ink-faint font-semibold mb-2">Tweet this exact message from <strong>@{xHandle}</strong>:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-[13px] sm:text-[14px] font-mono bg-canvas px-3 py-2 rounded-sm border border-border break-all">
                          Verifying @taskverifier: {verifyCode}
                        </code>
                        <button onClick={() => navigator.clipboard.writeText('Verifying @taskverifier: ' + verifyCode)}
                          className="px-3 py-2 text-[12px] font-bold rounded-sm border border-border bg-canvas-surface hover:bg-canvas-raised transition-colors shrink-0 whitespace-nowrap">
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {verifyCode && countdown > 0 && (
                  <div className="mb-6">
                    <label className="block text-[13px] font-bold uppercase tracking-wide text-ink-muted mb-2">Tweet URL</label>
                    <input type="text" value={tweetUrl} onChange={(e) => setTweetUrl(e.target.value.trim())}
                      placeholder="https://x.com/yourhandle/status/..."
                      className="w-full px-3 py-2 text-[14px] border border-border rounded-sm bg-canvas-surface focus:outline-none focus:border-brand transition-colors placeholder:text-ink-faint font-mono text-[13px]" />
                    <p className="text-[11px] text-ink-faint mt-1">Paste the full URL of your tweet. Must start with <code className="font-mono text-[11px] bg-canvas-raised px-1">https://x.com/</code> or <code className="font-mono text-[11px] bg-canvas-raised px-1">https://twitter.com/</code></p>
                  </div>
                )}
                    {profileError && (
                      <div className="mb-4 p-3 sm:p-4 border border-red-300/70 bg-red-50 rounded-sm flex items-start justify-between gap-2 shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8 5v3.5M8 11v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <p className="text-[13px] sm:text-[14px] text-red-800 leading-[1.5]">{profileError}</p>
                        </div>
                        <button onClick={() => setProfileError(null)} className="text-red-400 hover:text-red-600 transition-colors shrink-0 p-0.5">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                    {profileSubmitted && (
                      <div className="mb-4 p-4 border border-emerald-300/60 bg-emerald-50 rounded-sm shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <svg className="w-5 h-5 text-emerald-600 shrink-0" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          <p className="text-[14px] font-semibold text-emerald-800">Submitted! Your proof is pending AI verification.</p>
                        </div>
                      </div>
                    )}
                    {(profileTaskId || profileTxHash || profileResult) && (
                      <div className="mb-4 border border-indigo-200 bg-indigo-50/30 rounded-sm overflow-hidden">
                        <div className="px-3 py-2 bg-indigo-100/50 border-b border-indigo-200"><span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Transaction</span></div>
                        <div className="p-3 space-y-1.5 text-[12px] font-mono">
                          {profileTxHash && <div><span className="text-ink-faint">TX:</span> <span className="text-ink break-all">{profileTxHash}</span></div>}
                          {profileTaskId && <div><span className="text-ink-faint">ID:</span> <span className="font-bold text-ink-deep">{profileTaskId}</span></div>}
                          {profileResult && <div><span className="text-ink-faint">Result:</span> <span className="font-bold" style={{color: profileResult.status === 'verified' ? '#059669' : profileResult.status === 'rejected' ? '#dc2626' : undefined}}>{profileResult.status} &mdash; {profileResult.reason}</span></div>}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button onClick={async () => {
                        if (!address || !profileAddr || !tweetUrl) return
                        setProfileSubmitting(true); setProfileTxHash(null); setProfileTaskId(null); setProfileResult(null)
                        try {
                          // Strip tracking params from tweet URL
                          const cleanUrl = tweetUrl.split('?')[0]
                          // Fetch oEmbed data first
                          let oembedAuthorUrl = ''
                          let oembedTweetText = ''
                          try {
                            const oembedRes = await fetch(`/api/verify_tweet?url=${encodeURIComponent(cleanUrl)}`)
                            const oembedData = await oembedRes.json()
                            if (oembedData.valid && oembedData.handle) {
                              oembedAuthorUrl = `https://x.com/${oembedData.handle}`
                              oembedTweetText = oembedData.text || ''
                            }
                          } catch {}
                          const activeChain = network === 'bradbury' ? testnetBradbury : studionet as any
                          const glWrite = createClient({ chain: activeChain, account: address as `0x${string}`, provider: getProvider() })
                          const hash = await glWrite.writeContract({
                            address: profileAddr as `0x${string}`,
                            functionName: 'submit',
                            args: [xHandle, verifyCode, cleanUrl, oembedAuthorUrl, oembedTweetText],
                            value: 0n,
                          })
                          setProfileTxHash(hash as string); setProfileSubmitted(true)
                          setTimeout(() => setProfileSubmitted(false), 6000)
                          for (let i = 0; i < 15; i++) {
                            await new Promise(r => setTimeout(r, 2000))
                            try {
                              const glRead = createClient({ chain: activeChain })
                              const raw: any = await glRead.readContract({ address: profileAddr as `0x${string}`, functionName: 'get_all', args: [] })
                              if (raw && typeof raw === 'object') {
                                const entries = Object.entries(raw as Record<string, any>).filter(([, s]: any) => String(s.submitter).toLowerCase() === address.toLowerCase())
                                if (entries.length > 0) { setProfileTaskId(entries[entries.length - 1][0]); break }
                              }
                            } catch {}
                          }
                          setTweetUrl('')
                        } catch (e: any) { setProfileError(e?.cause?.message || e?.shortMessage || e?.message || 'Submission failed') }
                        finally { setProfileSubmitting(false) }
                      }}
                        disabled={profileSubmitting || !tweetUrl}
                        className="flex-1 py-2.5 text-white text-[15px] font-bold rounded-sm transition-all" style={{
                          backgroundColor: !tweetUrl ? 'rgba(0,0,0,0.25)' : profileSubmitting ? 'rgba(30,58,95,0.7)' : '#1e3a5f',
                          cursor: !tweetUrl ? 'not-allowed' : profileSubmitting ? 'wait' : undefined
                        }}>
                        {!tweetUrl ? 'Add tweet URL'
                          : profileSubmitting ? 'Submitting to GenLayer…' : 'Submit Proof →'}
                      </button>
                      {profileTaskId && !profileResult && (
                        <button onClick={async () => {
                          if (!address || !profileTaskId || !profileAddr) return
                          setProfileVerifying(true)
                          try {
                            const activeChain = network === 'bradbury' ? testnetBradbury : studionet as any
                            const glWrite = createClient({ chain: activeChain, account: address as `0x${string}`, provider: getProvider() })
                            const r: any = await glWrite.writeContract({ address: profileAddr as `0x${string}`, functionName: 'verify', args: [profileTaskId], value: 0n })
                            setProfileResult(r || { status: 'verified', reason: 'X profile verified on-chain' })
                          } catch (e: any) { setProfileError(e?.message || 'Verification failed') }
                          finally { setProfileVerifying(false) }
                        }}
                          className="px-5 py-2.5 text-white text-[15px] font-bold rounded-sm transition-all" style={{backgroundColor: '#059669'}}>
                          {profileVerifying ? 'Verifying…' : 'Verify Proof'}
                        </button>
                      )}
                      {profileResult && (
                        <div className={`px-4 py-3 border rounded-sm text-center ${
                          profileResult.status === 'verified'
                            ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
                            : 'border-red-200 bg-red-50/50 text-red-800'
                        }`}>
                          <p className="text-[13px] font-bold">
                            {profileResult.status === 'verified' ? '✅ Verified' : '❌ Rejected'}
                          </p>
                          <p className="text-[12px] mt-1 opacity-80">{profileResult.reason}</p>
                        </div>
                      )}
                    </div>
                    {profileSubmitting && (
                      <div className="mt-3 text-center text-[12px] text-ink-muted font-mono animate-pulse">Waiting for transaction confirmation… this may take 1-2 minutes</div>
                    )}
                    {countdown <= 0 && verifyCode && (
                      <div className="mt-4 text-center">
                        <p className="text-[13px] text-red-600 font-semibold mb-2">Code expired. Generate a new one.</p>
                        <button onClick={generateCode} className="px-4 py-2 bg-brand-dark text-white text-[13px] font-bold rounded-sm hover:opacity-80 transition-all">Generate New Code</button>
                      </div>
                    )}
              </>
            ) : (
              !isConnected ? (
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
            ))}

            {/* ══════ Task-specific instructions ══════ */}
            <div className="mt-8 sm:mt-12 border-t border-border pt-6 sm:pt-8">
              <h2 className="text-[16px] sm:text-[18px] font-bold text-ink-deep mb-4">How to complete this task</h2>

              {taskType === 'post_screenshot' ? (
                <div className="space-y-4">
                  {[
                    { num: '1', icon: '📸', title: 'Find a GenLayer post', desc: 'Go to X/Twitter and find any post from <strong>@GenLayer</strong>. It can be any post they\'ve made.' },
                    { num: '2', icon: '📱', title: 'Take a screenshot', desc: 'Capture the post clearly — the username "GenLayer" and the post content should be visible.' },
                    { num: '3', icon: '📤', title: 'Upload the image', desc: 'Drop the screenshot above. The app auto-compresses it to fit on-chain.' },
                    { num: '4', icon: '🔗', title: 'Submit to the blockchain', desc: 'Connect your wallet and submit. Your screenshot goes to the Post Verifier contract on GenLayer.' },
                    { num: '5', icon: '🤖', title: 'AI checks it', desc: 'GenLayer validators analyze the screenshot using AI consensus. Results are stored permanently on-chain.' },
                  ].map(step => (
                    <div key={step.num} className="flex gap-3 sm:gap-4 p-3 sm:p-4 border border-border rounded-sm bg-canvas">
                      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-sm font-bold text-[14px] text-white"
                        style={{ backgroundColor: '#1e3a5f' }}>
                        {step.num}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base">{step.icon}</span>
                          <h3 className="text-[14px] sm:text-[15px] font-bold text-ink-deep">{step.title}</h3>
                        </div>
                        <p className="text-[12px] sm:text-[13px] text-ink leading-[1.6]" dangerouslySetInnerHTML={{ __html: step.desc }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : taskType === 'profile_verification' ? (
                <div className="space-y-4">
                  {[
                    { num: '1', icon: '✏️', title: 'Generate a code', desc: 'Click <strong>Generate Code</strong> — a 6-character code appears. It expires in 5 minutes.' },
                    { num: '2', icon: '🐦', title: 'Tweet the code', desc: 'Go to X/Twitter and post a tweet containing the code. Example: <code class="text-[12px] bg-canvas-surface px-1 py-0.5 rounded-sm font-mono">Verifying @taskverifier: {code}</code>' },
                    { num: '3', icon: '🔗', title: 'Paste the tweet URL', desc: 'Copy your tweet\'s URL from X and paste it in the field above.' },
                    { num: '4', icon: '🔗', title: 'Submit to the blockchain', desc: 'Connect your wallet and submit. The tweet URL goes to the Profile Verifier contract on GenLayer.' },
                    { num: '5', icon: '🤖', title: 'AI checks the tweet', desc: 'GenLayer validators fetch the tweet page and confirm it contains the code.' },
                  ].map(step => (
                    <div key={step.num} className="flex gap-3 sm:gap-4 p-3 sm:p-4 border border-border rounded-sm bg-canvas">
                      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-sm font-bold text-[14px] text-white"
                        style={{ backgroundColor: '#1e3a5f' }}>
                        {step.num}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base">{step.icon}</span>
                          <h3 className="text-[14px] sm:text-[15px] font-bold text-ink-deep">{step.title}</h3>
                        </div>
                        <p className="text-[12px] sm:text-[13px] text-ink leading-[1.6]" dangerouslySetInnerHTML={{ __html: step.desc }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { num: '1', icon: '❤️', title: 'Find a GenLayer post', desc: 'Go to <a href="https://x.com/genlayer" target="_blank" rel="noopener" class="font-bold text-brand hover:underline">@GenLayer</a> profile on X and find a post you want to verify.' },
                    { num: '2', icon: '👍', title: 'Like the post', desc: 'Click the heart icon to like it.' },
                    { num: '3', icon: '📱', title: 'Take a screenshot', desc: 'Capture the post clearly. Make sure "GenLayer" is visible in frame.' },
                    { num: '4', icon: '📤', title: 'Upload the image', desc: 'Drop the screenshot above. The app auto-compresses it.' },
                    { num: '5', icon: '🔗', title: 'Submit to the blockchain', desc: 'Connect your wallet and submit. Your screenshot goes to the Liked Post Verifier contract.' },
                    { num: '6', icon: '🤖', title: 'AI checks it', desc: 'GenLayer validators check if the screenshot shows the liked post. Results are on-chain.' },
                  ].map(step => (
                    <div key={step.num} className="flex gap-3 sm:gap-4 p-3 sm:p-4 border border-border rounded-sm bg-canvas">
                      <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-sm font-bold text-[14px] text-white"
                        style={{ backgroundColor: '#1e3a5f' }}>
                        {step.num}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base">{step.icon}</span>
                          <h3 className="text-[14px] sm:text-[15px] font-bold text-ink-deep">{step.title}</h3>
                        </div>
                        <p className="text-[12px] sm:text-[13px] text-ink leading-[1.6]" dangerouslySetInnerHTML={{ __html: step.desc }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
