import { NextRequest, NextResponse } from 'next/server'

const HOSTS = ['https://temp.sh/upload']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = file.name?.split('.').pop() || 'png'
    const filename = `${crypto.randomUUID()}.${ext}`

    // Try external hosts in parallel — first one wins
    const results = await Promise.allSettled(
      HOSTS.map(async (host) => {
        const body = new FormData()
        body.set('file', new Blob([bytes]), filename)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(new DOMException('External upload timed out', 'TimeoutError')), 15000)
        const res = await fetch(host, { method: 'POST', body, signal: controller.signal })
        clearTimeout(timeout)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.text()).trim()
      })
    )

    const externalUrl = results.find(
      (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
    )?.value

    if (!externalUrl) {
      const errors = results.map(r => r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : 'skipped')
      console.error('All upload hosts failed:', errors)
      return NextResponse.json({ error: 'All upload hosts unavailable' }, { status: 502 })
    }

    return NextResponse.json({ url: externalUrl })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
