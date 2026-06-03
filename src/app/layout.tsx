import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { Providers } from './providers'
import Web3ModalInit from '../../components/Web3ModalInit'
import './globals.css'

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
})

export const metadata: Metadata = {
  title: 'Task Verifier — GenLayer Post Verifier',
  description: 'Upload a screenshot of a GenLayer X/Twitter post for AI-powered on-chain verification.',
  icons: {
    icon: [
      { url: '/fav-icon.ico', type: 'image/x-icon' },
      { url: '/logo-nav.png', type: 'image/png', sizes: '500x500' },
    ],
  },
  openGraph: {
    title: 'Task Verifier — GenLayer Post Verifier',
    description: 'Verify GenLayer X/Twitter post screenshots with AI consensus on GenLayer.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlex.variable}>
      <body>
        <Web3ModalInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
