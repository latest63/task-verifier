# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Profile Verifier — Relay-based X handle verification.

ARCHITECTURE:

  Verification is done OFF-CHAIN by the deployer's resolver script:
    1. User submits (img_data, x_handle, code, tweet_url) → pending state
    2. Resolver script polls pending submissions
    3. Resolver fetches oEmbed via the Next.js relay endpoint
    4. Resolver calls resolve(task_id, verified) on the contract
    5. Contract updates state deterministically — no web.get, no strict_eq

  This avoids the Bradbury strict_eq + gl.nondet.web.get bug where all
  validators vote DISAGREE even with identical ND results.
"""

from genlayer import *
import typing
from dataclasses import dataclass
import re


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
    owner: Address

    def __init__(self):
        self.count = u256(0)
        self.owner = gl.message.sender_address

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

    # ── Resolve (called by deployer's off-chain resolver) ───────────────────

    @gl.public.write
    def resolve(self, task_id: str, verified: bool) -> dict:
        """Resolve a pending submission. Only callable by the contract owner."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("only the contract owner can resolve submissions")

        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("submission already resolved")

        # Double-check wallet not already verified (edge case: wallet verified
        # between submit and resolve via another submission)
        existing = self.verified_handles.get(sub.submitter.as_hex.lower(), "")
        if existing != "":
            # Wallet got verified through another submission — mark this one rejected
            verdict = "rejected"
            reason = f"wallet already verified as @{existing}"
        else:
            verdict = "verified" if verified else "rejected"
            reason = (
                f"X handle @{sub.x_handle} verified — off-chain oEmbed check passed"
                if verdict == "verified"
                else f"could not confirm @{sub.x_handle} — off-chain oEmbed check failed"
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
