import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Task Verifier — GenLayer',
  description: 'Verify social actions with AI consensus on GenLayer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
