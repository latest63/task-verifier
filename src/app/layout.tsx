import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
})

export const metadata: Metadata = {
  title: 'Task Verifier — GenLayer',
  description: 'Verify social media actions with AI consensus on GenLayer',
  openGraph: {
    title: 'Task Verifier',
    description: 'Verify social actions with AI consensus on GenLayer',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlex.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
