import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen font-sans bg-canvas">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-2 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src="/logo-nav.png" alt="Task Verifier" className="w-[70px] h-[70px] sm:w-[150px] sm:h-[150px] rounded-sm object-contain" />
          </div>
          <Link href="/app"
            className="px-4 py-1.5 sm:px-5 sm:py-2 bg-brand-dark text-white text-[13px] sm:text-[14px] font-semibold rounded-sm hover:opacity-80 transition-all whitespace-nowrap">
            Launch App →
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-3 sm:px-6">
        <div className="py-16 sm:py-20 md:py-28">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 sm:mb-6 bg-brand-dark/5 border border-brand-dark/20 rounded-full text-[11px] sm:text-[12px] font-bold text-brand-dark uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Zero API Fees · On-Chain Verifications
          </div>

          <h1 className="text-[32px] sm:text-[42px] md:text-[52px] font-extrabold text-ink-deep leading-[1.05] tracking-[-1.5px] max-w-3xl">
            Verify X Social Tasks<br />
            <span className="text-brand-dark">with On-Chain AI Consensus</span>
          </h1>

          <p className="mt-4 sm:mt-5 text-[15px] sm:text-[18px] text-ink leading-[1.6] max-w-xl">
            Your users upload proof of X/Twitter actions — posts, comments, likes, retweets. 
            Our AI validators check each submission against GenLayer&rsquo;s on-chain consensus. 
            <strong className="text-ink-deep"> $0 in API fees</strong>, only gas costs.
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
            { icon: '💰', title: 'Zero API Fees', desc: 'No API keys, no credits, no subscriptions. Your users just connect a wallet and pay the gas — the AI verification costs $0.' },
            { icon: '🤖', title: 'Multi-Model AI Consensus', desc: 'Every submission is checked by 4 independent AI validators running on GenLayer. They vote — consensus decides the final verdict.' },
            { icon: '🔗', title: 'On-Chain Proof', desc: 'Every verdict lives on the GenLayer blockchain. Tamper-proof, transparent, and publicly verifiable by anyone, anytime.' },
            { icon: '⚡', title: 'Plug & Play Integration', desc: 'Deploy a contract, point your users to the app, and go. No complex setup, no hidden infrastructure.' },
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
          <p className="mt-1.5 text-[14px] sm:text-[15px] text-ink">From user submission to on-chain verdict in under 2 minutes.</p>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {[
            { num: '01', icon: '📸', title: 'User submits proof', desc: 'Your users upload a screenshot of their X/Twitter action — post, comment, like, or retweet.' },
            { num: '02', icon: '📤', title: 'Auto-compressed for chain', desc: 'The image is automatically compressed to fit the 50KB on-chain limit. No manual work needed.' },
            { num: '03', icon: '🔗', title: 'Submitted to GenLayer', desc: 'The proof is submitted to the blockchain. Only gas fees — no API costs, no recurring charges.' },
            { num: '04', icon: '🤖', title: 'AI validators reach consensus', desc: '4 AI models independently analyze the screenshot and vote. A majority decides the outcome.' },
            { num: '05', icon: '✅', title: 'Verdict stored on-chain', desc: 'The result is permanently stored on GenLayer. Anyone can verify it anytime in the Activity feed.' },
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
            <p className="mt-1.5 text-[14px] sm:text-[15px] text-ink">Verification types we support — live and upcoming.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 border border-emerald-300/60 bg-emerald-50/40 rounded-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[12px] font-bold shrink-0">✓</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-deep">Post Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify a screenshot of an X post.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-sm">Live</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Comment Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify a user&rsquo;s comment on a specific post.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-canvas-surface px-2 py-0.5 rounded-sm">Upcoming</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Like Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify a user&rsquo;s like on a specific post.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-canvas-surface px-2 py-0.5 rounded-sm">Upcoming</span>
            </div>

            <div className="p-4 sm:p-5 border border-border rounded-sm bg-canvas opacity-60">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-ink-faint/30 text-ink-faint text-[14px] font-bold shrink-0">+</span>
                <h3 className="text-[15px] sm:text-[16px] font-bold text-ink-muted">Retweet Verification</h3>
              </div>
              <p className="text-[13px] sm:text-[14px] text-ink leading-[1.6]">
                Verify a user&rsquo;s retweet of a specific post.
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
