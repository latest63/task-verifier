import { NextRequest, NextResponse } from 'next/server'

const HOSTS = [
  'https://temp.sh/upload',
  'https://0x0.st',
]

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const filename = file.name || 'screenshot.png'

    for (const host of HOSTS) {
      try {
        const body = new FormData()
        body.set('file', new Blob([bytes]), filename)

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(host, { method: 'POST', body, signal: controller.signal })
        clearTimeout(timeout)

        if (res.ok) {
          const url = (await res.text()).trim()
          return NextResponse.json({ url })
        }
      } catch {
        continue
      }
    }

    return NextResponse.json({ error: 'All image hosts unreachable' }, { status: 502 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload error' }, { status: 500 })
  }
}
