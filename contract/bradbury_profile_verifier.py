# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Profile Verifier — deterministic X handle verification via syndication API.

STUDIONET profile_verifier.py:
  web.render() + exec_prompt + prompt_comparative  ← kept as-is for StudioNet

BRADBURY (this file):
  gl.nondet.web.get() + deterministic JSON parse + strict_eq
  No LLM, no render, no prompts.

Flow:
  1. User tweets "Verifying @taskverifier: {CODE}"
  2. User submits tweet_url + handle + code
  3. Contract fetches https://cdn.syndication.twimg.com/tweet-result?id=...
  4. Parses user.screen_name + text from JSON response
  5. Deterministic check: handle matches? code in text?
  6. strict_eq → identical binary verdict from all validators
"""

from genlayer import *
import typing
import json
from dataclasses import dataclass
import re

SYNDICATION_BASE = "https://cdn.syndication.twimg.com/tweet-result"


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

    # ── Submit ───────────────────────────────────────────────────────────────

    @gl.public.write
    def submit(
        self,
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

    # ── Verify (Syndication API → Deterministic → strict_eq) ────────────────

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

        tweet_id = self._extract_tweet_id(sub.tweet_url)
        api_url = f"{SYNDICATION_BASE}?id={tweet_id}&lang=en"

        def nd() -> str:
            """Non-deterministic block: fetch syndication JSON, return identical verdict."""
            resp = gl.nondet.web.get(api_url)

            # Empty / too-small response → fail
            if not resp or not resp.body or len(resp.body) < 50:
                return '{"verified":false}'

            try:
                data = json.loads(resp.body.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                return '{"verified":false}'

            # Defensive field extraction
            user = data.get("user") or {}
            api_handle = (user.get("screen_name") or "").lower()
            tweet_text = data.get("text") or ""

            # Deterministic check — no AI, no interpretation
            verified = (
                api_handle == sub.x_handle.lower()
                and sub.code in tweet_text
            )

            # sort_keys=True → identical string across all validators
            return json.dumps({"verified": verified}, sort_keys=True)

        # strict_eq: all validators must return the EXACT same string
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
