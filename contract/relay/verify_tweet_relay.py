"""
Verify Tweet Relay — External Fetch Layer for GenLayer Bradbury.

Research doc's "What I Would Personally Build" / "Best Bradbury-Compatible Stack":

  GET /verifyTweet?url=<tweet_url>
  → { "handle": "username", "text": "tweet content", "valid": true }

Contract then:
  1. gl.nondet.web.get(RELAY_URL + "?url=" + tweet_url)
  2. Parse handle + text from normalized JSON
  3. Deterministic check (handle matches? code in text?)
  4. strict_eq on binary verdict

Zero external deps — runs on stdlib http.server.
Deploy anywhere: Vercel, Cloudflare Worker, Railway, bare server.
"""

import json
import re
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Config ──────────────────────────────────────────────────────────────────

HOST = "0.0.0.0"
PORT = 8080

SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result"
USER_AGENT = "Mozilla/5.0 (compatible; GenLayerRelay/1.0)"
REQUEST_TIMEOUT = 15  # seconds


# ── Tweet Fetcher ───────────────────────────────────────────────────────────

def extract_tweet_id(url: str) -> str | None:
    """Extract numeric tweet ID from x.com or twitter.com /status/N."""
    match = re.search(r'/status/(\d+)', url)
    return match.group(1) if match else None


def fetch_tweet(tweet_id: str) -> dict:
    """
    Fetch tweet data from Twitter's syndication endpoint.
    Returns normalized dict: { handle, text } or error dict.
    """
    api_url = f"{SYNDICATION_URL}?id={tweet_id}&lang=en"

    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = resp.read()
            if len(body) < 10:
                return {"handle": "", "text": "", "error": "empty response"}
            data = json.loads(body.decode("utf-8"))

            # Syndication response has __typename = "Tweet" when valid
            if not data or data.get("__typename") != "Tweet":
                return {"handle": "", "text": "", "error": "tweet not found"}

            user = data.get("user") or {}
            handle = (user.get("screen_name") or "").lower()
            text = data.get("text") or ""

            return {
                "handle": handle,
                "text": text,
                "error": "",
            }

    except urllib.error.HTTPError as e:
        return {"handle": "", "text": "", "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"handle": "", "text": "", "error": f"network error: {e.reason}"}
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return {"handle": "", "text": "", "error": f"parse error: {e}"}
    except Exception as e:
        return {"handle": "", "text": "", "error": f"unexpected: {e}"}


# ── HTTP Handler ────────────────────────────────────────────────────────────

class VerifyTweetHandler(BaseHTTPRequestHandler):
    """Handles GET /verifyTweet?url=<tweet_url>"""

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # Only handle /verifyTweet
        if parsed.path != "/verifyTweet":
            self._json_response(404, {"error": "not found"})
            return

        # Parse query params
        params = urllib.parse.parse_qs(parsed.query)
        tweet_url = params.get("url", [None])[0]

        if not tweet_url:
            self._json_response(400, {"error": "missing ?url= parameter"})
            return

        # Validate and extract tweet ID
        tweet_id = extract_tweet_id(tweet_url)
        if not tweet_id:
            self._json_response(400, {
                "error": "invalid tweet URL — must contain /status/<id>",
                "url": tweet_url,
            })
            return

        # Fetch tweet data
        result = fetch_tweet(tweet_id)
        result["url"] = tweet_url
        result["id"] = tweet_id

        # Include valid field for convenience
        result["valid"] = bool(result.get("handle") and result.get("text"))

        self._json_response(200, result)

    def _json_response(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))

    # Suppress default logging to stdout (genlayer validators don't care about our access logs)
    def log_message(self, format, *args):
        pass


# ── Server ──────────────────────────────────────────────────────────────────

def run_server():
    server = HTTPServer((HOST, PORT), VerifyTweetHandler)
    print(f"VerifyTweet Relay running on http://{HOST}:{PORT}/verifyTweet?url=...")
    print(f"Example: http://localhost:{PORT}/verifyTweet?url=https://x.com/user/status/123")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.server_close()


if __name__ == "__main__":
    run_server()
