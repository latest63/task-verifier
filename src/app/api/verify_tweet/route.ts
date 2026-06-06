import { NextRequest, NextResponse } from 'next/server'

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

/** Extract @handle from oEmbed author_url like https://x.com/GenLayer */
function extractHandle(authorUrl: string): string {
  try {
    const path = new URL(authorUrl).pathname.replace(/\/+$/, '')
    return path.split('/').filter(Boolean).pop()?.toLowerCase() ?? ''
  } catch {
    return ''
  }
}

/** Extract tweet text from oEmbed HTML blockquote */
function extractText(html: string): string {
  // The HTML is a blockquote with a <p> containing the tweet text
  // <blockquote ...><p lang="en" dir="ltr">TEXT HERE</p>...</blockquote>
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
  if (!pMatch) return ''
  // Strip any remaining HTML tags in the text
  return pMatch[1].replace(/<[^>]+>/g, '').trim()
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

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TaskVerifierRelay/1.0)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({
        handle: '', text: '', valid: false,
        error: `oEmbed HTTP ${res.status}`,
        url: tweetUrl, id: tweetId,
      } satisfies TweetResult)
    }

    const body = await res.text()

    if (!body || body.length < 20) {
      return NextResponse.json({
        handle: '', text: '', valid: false,
        error: 'empty response from oEmbed',
        url: tweetUrl, id: tweetId,
      } satisfies TweetResult)
    }

    const data = JSON.parse(body)

    const handle = extractHandle(data.author_url ?? '')
    const text = extractText(data.html ?? '')
    const authorName = data.author_name ?? ''

    return NextResponse.json({
      handle: handle || (authorName ? authorName.toLowerCase() : ''),
      text,
      valid: !!(handle && text),
      error: '',
      url: tweetUrl,
      id: tweetId,
      raw_oembed: body,  // pass through raw oEmbed JSON for on-chain submission
    } satisfies TweetResult & { raw_oembed: string })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      handle: '', text: '', valid: false,
      error: `fetch failed: ${msg}`,
      url: tweetUrl, id: tweetId,
    } satisfies TweetResult)
  }
}

export const runtime = 'nodejs'
