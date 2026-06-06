"""
Verify Tweet Relay — Vercel Serverless Function.

GET /api/verify_tweet?url=https://x.com/user/status/123

Returns:
  { "handle": "username", "text": "tweet content", "valid": true, "error": "" }
"""

import json
import re
import os
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler

SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result"
REQUEST_TIMEOUT = 15


def extract_tweet_id(url: str) -> str | None:
    match = re.search(r'/status/(\d+)', url)
    return match.group(1) if match else None


def fetch_tweet(tweet_id: str) -> dict:
    """Fetch tweet from syndication endpoint and return normalized fields."""
    api_url = f"{SYNDICATION_URL}?id={tweet_id}&lang=en"
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": ua, "Accept": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = resp.read()
            if len(body) < 10:
                return {"handle": "", "text": "", "error": "empty response"}
            data = json.loads(body.decode("utf-8"))

            if not data or data.get("__typename") != "Tweet":
                return {"handle": "", "text": "", "error": "tweet not found"}

            user = data.get("user") or {}
            handle = (user.get("screen_name") or "").lower()
            text = data.get("text") or ""

            return {"handle": handle, "text": text, "error": ""}

    except urllib.error.HTTPError as e:
        return {"handle": "", "text": "", "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"handle": "", "text": "", "error": f"network: {e.reason}"}
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return {"handle": "", "text": "", "error": f"parse: {e}"}
    except Exception as e:
        return {"handle": "", "text": "", "error": f"error: {e}"}


class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless function handler."""

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path != "/api/verify_tweet":
            self._respond(404, {"error": "not found"})
            return

        params = urllib.parse.parse_qs(parsed.query)
        tweet_url = params.get("url", [None])[0]

        if not tweet_url:
            self._respond(400, {"error": "missing url parameter"})
            return

        tweet_id = extract_tweet_id(tweet_url)
        if not tweet_id:
            self._respond(400, {
                "error": "invalid tweet URL",
                "url": tweet_url,
            })
            return

        result = fetch_tweet(tweet_id)
        result["url"] = tweet_url
        result["id"] = tweet_id
        result["valid"] = bool(result.get("handle") and result.get("text"))

        self._respond(200, result)

    def _respond(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def log_message(self, format, *args):
        pass
