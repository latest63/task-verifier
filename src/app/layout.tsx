import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Task Verifier — GenLayer',
  description: 'Verify social media actions with AI consensus on GenLayer. Projects deploy contracts, communities submit proof, AI validates on-chain.',
  openGraph: {
    title: 'Task Verifier',
    description: 'Verify social actions with AI consensus on GenLayer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Task Verifier — GenLayer',
    description: 'Verify social media actions with AI consensus',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
