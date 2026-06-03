import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const HOSTS = ['https://temp.sh/upload', 'https://0x0.st']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = file.name?.split('.').pop() || 'png'
    const filename = `${randomUUID()}.${ext}`

    // Always save locally as fallback
    const dir = join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), new Uint8Array(bytes))

    const localUrl = `/uploads/${filename}`

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

    // Return external URL if available, otherwise local
    return NextResponse.json({ url: externalUrl || localUrl })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
