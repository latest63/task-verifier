# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Profile Verifier — deterministic X handle verification via oEmbed API.

ARCHITECTURE (Best Bradbury-Compatible Stack):

  Data source:  gl.nondet.web.get() against Twitter oEmbed API
                 https://api.twitter.com/1.1/statuses/oembed.json?url=...
  → Parses author_url for handle + html <p> for text
  → Deterministic field comparison
  → strict_eq consensus

  No relay. No render. No LLM. No syndication endpoint.
  Just the official Twitter oEmbed API — stable, lightweight, consistent.
"""

from genlayer import *
import typing
import json
from dataclasses import dataclass
import re

OEMBED_BASE = "https://publish.x.com/oembed"
# oEmbed via Twitter syndication returns consistent JSON without redirects
# publish.x.com is on the x.com domain which GenLayer VM can access


@allow_storage
@dataclass
class Submission:
    submitter: Address
    x_handle: str
    code: str
    tweet_url: str
    status: str           # "pending" | "verified" | "rejected"
    verdict: str
    timestamp: str


class BradburyProfileVerifier(gl.Contract):
    submissions: TreeMap[str, Submission]
    verified_handles: TreeMap[str, str]   # wallet_hex → x_handle
    count: u256

    def __init__(self):
        self.count = u256(0)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _extract_tweet_id(self, url: str) -> str:
        match = re.search(r'/status/(\d+)', url)
        if not match:
            raise gl.vm.UserError("invalid tweet URL — must contain /status/<id>")
        return match.group(1)

    def _extract_handle(self, author_url: str) -> str:
        """Extract @handle from oEmbed author_url like https://x.com/GenLayer"""
        parts = author_url.rstrip("/").split("/")
        return parts[-1].lower() if parts else ""

    def _extract_text(self, html: str) -> str:
        """Extract tweet text from oEmbed HTML blockquote <p> tag"""
        match = re.search(r'<p[^>]*>([\s\S]*?)</p>', html)
        if not match:
            return ""
        # Strip any remaining HTML tags in the text
        return re.sub(r'<[^>]+>', '', match.group(1)).strip()

    def _url_encode(self, s: str) -> str:
        """Minimal URL encoding for query param values."""
        result = []
        for c in s:
            if c in ':/?#[]@!$&\'()*+,;=':
                result.append(f'%{ord(c):02X}')
            elif c == '%':
                result.append('%25')
            else:
                result.append(c)
        return ''.join(result)

    # ── Submit ───────────────────────────────────────────────────────────────

    @gl.public.write
    def submit(
        self,
        img_data: bytes,
        x_handle: str,
        code: str,
        tweet_url: str,
    ) -> str:
        # Wallet already verified?
        existing = self.verified_handles.get(gl.message.sender_address.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(
                f"wallet already verified as @{existing}"
            )

        # Validate handle length
        if len(x_handle) < 2 or len(x_handle) > 30:
            raise gl.vm.UserError("invalid handle length (2-30 chars)")

        # Validate code format (6 alphanumeric)
        if len(code) != 6 or not code.isalnum():
            raise gl.vm.UserError("code must be exactly 6 alphanumeric characters")

        # Validate tweet URL
        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith("https://twitter.com/"):
            raise gl.vm.UserError("tweet URL must start with https://x.com/ or https://twitter.com/")

        # Validate tweet ID extractable
        self._extract_tweet_id(tweet_url)

        task_id = f"p_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = Submission(
            submitter=gl.message.sender_address,
            x_handle=x_handle,
            code=code,
            tweet_url=tweet_url,
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)

        return task_id

    # ── Verify (oEmbed API → Deterministic → strict_eq) ────────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("already verified")

        # Double-check wallet not already verified
        existing = self.verified_handles.get(sub.submitter.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(
                f"wallet already verified as @{existing}"
            )

        # Build oEmbed URL (captured outside nd() block per pitfall #32)
        oembed_url = OEMBED_BASE + "?url=" + self._url_encode(sub.tweet_url)

        def nd() -> str:
            """
            Non-deterministic block:
              1. GET oEmbed endpoint → normalized JSON
              2. Parse author_url for handle, html <p> for text
              3. Return deterministic binary verdict
            """
            try:
                resp = gl.nondet.web.get(oembed_url)
                if not resp or not resp.body or len(resp.body) < 20:
                    return '{"verified":false}'
            except:
                # Network errors (DNS, timeout, connection refused) → fail gracefully
                return '{"verified":false}'

            try:
                data = json.loads(resp.body.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                return '{"verified":false}'

            # Extract fields from oEmbed response
            api_handle = self._extract_handle(data.get("author_url") or "")
            tweet_text = self._extract_text(data.get("html") or "")

            # Binary check — no AI, no interpretation
            verified = (
                api_handle == sub.x_handle.lower()
                and sub.code in tweet_text
            )

            # sort_keys=True ensures identical output across all validators
            return json.dumps({"verified": verified}, sort_keys=True)

        # strict_eq — ALL validators must return the EXACT same string
        raw = json.loads(gl.eq_principle.strict_eq(nd))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            f"X handle @{sub.x_handle} verified — tweet contains matching handle + code"
            if verdict == "verified"
            else f"could not confirm @{sub.x_handle} — handle or code not found in tweet"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        if verdict == "verified":
            self.verified_handles[sub.submitter.as_hex.lower()] = sub.x_handle

        return {"status": verdict, "reason": reason}

    # ── Views ───────────────────────────────────────────────────────────────

    @gl.public.view
    def get_submission(self, task_id: str) -> dict:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        return {
            "submitter": sub.submitter.as_hex,
            "x_handle": sub.x_handle,
            "code": sub.code,
            "tweet_url": sub.tweet_url,
            "status": sub.status,
            "verdict": sub.verdict,
            "timestamp": sub.timestamp,
        }

    @gl.public.view
    def get_all(self) -> dict[str, dict]:
        return {
            k: {
                "submitter": v.submitter.as_hex,
                "x_handle": v.x_handle,
                "code": v.code,
                "tweet_url": v.tweet_url,
                "status": v.status,
                "verdict": v.verdict,
                "timestamp": v.timestamp,
            }
            for k, v in self.submissions.items()
        }

    @gl.public.view
    def get_count(self) -> int:
        return int(self.count)

    @gl.public.view
    def get_x_handle(self, wallet: str) -> str:
        """Returns verified X handle for a wallet, or empty string."""
        return self.verified_handles.get(wallet, "")
