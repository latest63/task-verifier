import { NextRequest, NextResponse } from 'next/server'

const HOSTS = [
  'https://0x0.st',
  'https://envs.sh',
]

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const upload = new FormData()
    upload.append('file', file)

    for (const host of HOSTS) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(host, { method: 'POST', body: upload, signal: controller.signal })
        clearTimeout(timeout)
        if (res.ok) {
          const url = (await res.text()).trim()
          return NextResponse.json({ url })
        }
      } catch {
        continue // try next host
      }
    }

    return NextResponse.json({ error: 'All image hosts unreachable' }, { status: 502 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload error' }, { status: 500 })
  }
}
