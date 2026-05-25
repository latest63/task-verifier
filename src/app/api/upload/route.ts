import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const upload = new FormData()
    upload.append('file', file)
    const res = await fetch('https://0x0.st', { method: 'POST', body: upload })
    if (!res.ok) return NextResponse.json({ error: 'Upload failed' }, { status: 502 })

    const url = (await res.text()).trim()
    return NextResponse.json({ url })
  } catch (err) {
    return NextResponse.json({ error: 'Upload error' }, { status: 500 })
  }
}
