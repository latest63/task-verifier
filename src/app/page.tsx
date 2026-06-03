import Link from 'next/link'
import { IBM_Plex_Sans } from 'next/font/google'

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
})

export default function LandingPage() {
  return (
    <main className="min-h-screen font-sans bg-canvas">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src="/tv1.png" alt="Task Verifier" className="w-8 h-8 sm:w-10 sm:h-10 rounded-sm object-contain" />
            <span className="hidden sm:inline text-[15px] font-semibold text-ink-deep tracking-tight">Task Verifier</span>
          </div>
          <Link href="/app"
            className="px-4 py-1.5 bg-brand-dark text-white text-[13px] font-semibold rounded-sm hover:opacity-80 transition-all">
            Launch App →
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-3 sm:px-6">
        <div className="py-16 sm:py-20 md:py-28">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 sm:mb-6 bg-brand-dark/5 border border-brand-dark/20 rounded-full text-[11px] sm:text-[12px] font-bold text-brand-dark uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Zero API Fees · On-Chain AI
          </div>

          <h1 className="text-[32px] sm:text-[42px] md:text-[52px] font-extrabold text-ink-deep leading-[1.05] tracking-[-1.5px] max-w-2xl">
            Verify GenLayer Posts<br />
            <span className="text-brand-dark">with AI Consensus</span>
          </h1>

          <p className="mt-4 sm:mt-5 text-[15px] sm:text-[18px] text-ink leading-[1.6] max-w-xl">
            Upload a screenshot of any <strong className="text-ink-deep">@GenLayer</strong> X post —
            our AI validators check it on-chain. <strong className="text-ink-deep">$0 in API fees</strong>,
            just the gas to submit.
          </p>

          <div className="flex flex-wrap gap-3 mt-6 sm:mt-8">
            <Link href="/app"
              className="px-6 py-2.5 bg-brand-dark text-white text-[14px] font-bold rounded-sm hover:opacity-80 transition-all shadow-sm">
              Start Verifying →
            </Link>
            <Link href="/app"
              className="px-6 py-2.5 border border-border text-ink-muted text-[14px] font-semibold rounded-sm hover:border-brand-dark/30 hover:text-ink-deep transition-all">
              View Activity
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-3 sm:px-6 pb-16 sm:pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[
            { icon: '💰', title: 'Zero API Fees', desc: 'No API keys, no credits, no subscriptions. Just connect your wallet and pay the gas — the AI verification itself costs $0.' },
            { icon: '🤖', title: '4 AI Validators', desc: 'Your screenshot is checked by multiple AI models running on GenLayer. They reach consensus before the result is final.' },
            { icon: '🔗', title: 'On-Chain Forever', desc: 'Every verdict is stored on the GenLayer blockchain. Tamper-proof, transparent, and always verifiable by anyone.' },
            { icon: '⚡', title: 'Under 2 Minutes', desc: 'Upload, submit, and get your result in roughly 90 seconds. No waiting around.' },
          ].map(f => (
            <div key={f.title} className="p-4 sm:p-5 border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{f.icon}</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-deep">{f.title}</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-5xl mx-auto px-3 sm:px-6 pb-16 sm:pb-20">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-[20px] sm:text-[24px] font-extrabold text-ink-deep tracking-[-0.5px]">How It Works</h2>
          <p className="mt-1.5 text-[14px] sm:text-[15px] text-ink">Five simple steps to verify any GenLayer post.</p>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {[
            { num: '01', icon: '📸', title: 'Screenshot a post', desc: 'Find any post from @GenLayer on X and take a clean screenshot.' },
            { num: '02', icon: '📤', title: 'Upload it here', desc: 'Drop the screenshot. The app auto-compresses it to fit the 50KB chain limit.' },
            { num: '03', icon: '🔗', title: 'Submit to GenLayer', desc: 'Connect your wallet and submit. Only gas fees — no API costs.' },
            { num: '04', icon: '🤖', title: 'AI validators check it', desc: '4 AI models analyze the screenshot and vote. Consensus = final answer.' },
            { num: '05', icon: '✅', title: 'Result on-chain', desc: 'The verdict is stored forever on GenLayer. Check the Activity tab anytime.' },
          ].map(step => (
            <div key={step.num} className="flex gap-4 sm:gap-5 p-4 sm:p-5 border border-border rounded-sm bg-canvas hover:bg-canvas-surface transition-colors group">
              <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-sm font-bold text-[14px] text-white bg-brand-dark group-hover:opacity-80 transition-opacity">
                {step.num}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{step.icon}</span>
                  <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-deep">{step.title}</h3>
                </div>
                <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-8 pt-6 border-t border-border">
          <img src="/genlayer-logo.jpeg" alt="GenLayer" className="h-8 w-auto object-contain" />
          <span className="text-[13px] text-ink-faint font-medium">Powered by GenLayer AI consensus</span>
        </div>
      </section>

      {/* ── Roadmap ── */}
      <section className="border-t border-border bg-canvas">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-12 sm:py-16">
          <div className="mb-8 sm:mb-10">
            <h2 className="text-[20px] sm:text-[24px] font-extrabold text-ink-deep tracking-[-0.5px]">Roadmap</h2>
            <p className="mt-1.5 text-[14px] sm:text-[15px] text-ink">More X/Twitter action types coming soon after Post Verification.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 border border-emerald-300/60 bg-emerald-50/40 rounded-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[12px] font-bold shrink-0">✓</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-deep">Post Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify screenshots of GenLayer X posts. Live now — the first action on our roadmap.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-sm">Live</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Comment Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify that GenLayer commented on a specific post. Coming soon.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-canvas-surface px-2 py-0.5 rounded-sm">Upcoming</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Like Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify that GenLayer liked a specific post. Coming soon.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-canvas-surface px-2 py-0.5 rounded-sm">Upcoming</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Retweet Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify that GenLayer retweeted a specific post. Coming soon.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-canvas-surface px-2 py-0.5 rounded-sm">Upcoming</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-canvas-surface/50">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="text-[11px] sm:text-[12px] font-semibold text-ink-faint text-center sm:text-left">
            Powered by GenLayer AI consensus
          </div>
          <div className="flex items-center gap-3 text-[11px] sm:text-[12px] font-semibold text-ink-faint">
            <a href="https://genlayer.com" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GenLayer</a>
            <span className="text-border">·</span>
            <a href="https://github.com/latest63/task-verifier" target="_blank" rel="noopener" className="hover:text-brand transition-colors">GitHub</a>
            <span className="text-border">·</span>
            <Link href="/app" className="hover:text-brand transition-colors">App</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
