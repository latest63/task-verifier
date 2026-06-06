import { NextRequest, NextResponse } from 'next/server'

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TIMEOUT_MS = 12_000

interface TweetResult {
  handle: string
  text: string
  valid: boolean
  error: string
  url?: string
  id?: string
}

function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/)
  return match?.[1] ?? null
}

export async function GET(req: NextRequest) {
  const tweetUrl = req.nextUrl.searchParams.get('url')

  if (!tweetUrl) {
    return NextResponse.json(
      { error: 'missing url parameter', handle: '', text: '', valid: false } satisfies TweetResult,
      { status: 400 }
    )
  }

  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) {
    return NextResponse.json(
      { error: 'invalid tweet URL — must contain /status/<id>', url: tweetUrl, handle: '', text: '', valid: false } satisfies TweetResult,
      { status: 400 }
    )
  }

  const apiUrl = `${SYNDICATION_URL}?id=${tweetId}&lang=en`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({
        handle: '', text: '', valid: false,
        error: `syndication HTTP ${res.status}`,
        url: tweetUrl, id: tweetId,
      } satisfies TweetResult)
    }

    const body = await res.text()

    if (!body || body.length < 10) {
      return NextResponse.json({
        handle: '', text: '', valid: false,
        error: 'empty response from syndication',
        url: tweetUrl, id: tweetId,
      } satisfies TweetResult)
    }

    const data = JSON.parse(body)

    if (!data || data.__typename !== 'Tweet') {
      return NextResponse.json({
        handle: '', text: '', valid: false,
        error: 'tweet not found in syndication',
        url: tweetUrl, id: tweetId,
      } satisfies TweetResult)
    }

    const user = data.user ?? {}
    const handle = (user.screen_name ?? '').toLowerCase()
    const text = data.text ?? ''

    return NextResponse.json({
      handle,
      text,
      valid: !!(handle && text),
      error: '',
      url: tweetUrl,
      id: tweetId,
    } satisfies TweetResult)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      handle: '', text: '', valid: false,
      error: `fetch failed: ${msg}`,
      url: tweetUrl, id: tweetId,
    } satisfies TweetResult)
  }
}

export const runtime = 'nodejs' // force Node.js runtime for fetch
