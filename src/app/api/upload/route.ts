import { NextRequest, NextResponse } from 'next/server'

const HOSTS = [
  'https://temp.sh/upload',
  'https://0x0.st',
]

export async function POST(req: NextRequest) {
  const start = Date.now()
  console.log(`[upload] received request at ${start}`)
  try {
    const formData = await req.formData()
    console.log(`[upload] formData parsed in ${Date.now() - start}ms`)

    const file = formData.get('file') as File | null
    if (!file) {
      console.log(`[upload] no file found`)
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    console.log(`[upload] file: ${file.name}, size: ${file.size}, type: ${file.type}`)

    const bytes = Buffer.from(await file.arrayBuffer())
    const filename = file.name || 'screenshot.png'
    console.log(`[upload] read ${bytes.length} bytes in ${Date.now() - start}ms`)

    for (const host of HOSTS) {
      console.log(`[upload] trying ${host}`)
      try {
        const body = new FormData()
        body.set('file', new Blob([bytes]), filename)

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        const res = await fetch(host, { method: 'POST', body, signal: controller.signal })
        clearTimeout(timeout)

        console.log(`[upload] ${host} -> HTTP ${res.status} in ${Date.now() - start}ms`)

        if (res.ok) {
          const url = (await res.text()).trim()
          console.log(`[upload] success: ${url}`)
          return NextResponse.json({ url })
        }
      } catch (e: any) {
        console.log(`[upload] ${host} failed: ${e?.message}`)
        continue
      }
    }

    console.log(`[upload] all hosts failed after ${Date.now() - start}ms`)
    return NextResponse.json({ error: 'All image hosts unreachable' }, { status: 502 })
  } catch (err: any) {
    console.error(`[upload] error: ${err?.message}`)
    return NextResponse.json({ error: 'Upload error' }, { status: 500 })
  }
}
