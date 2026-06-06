# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Profile Verifier V2 — Raw oEmbed JSON submitted, nd() parses.
Validators independently extract handle + code from the raw JSON.
"""

from genlayer import *
import typing
import json
from dataclasses import dataclass
import re


@allow_storage
@dataclass
class Submission:
    submitter: Address
    x_handle: str
    code: str
    tweet_url: str
    oembed_raw_json: str   # full oEmbed API response, frontend passes through unparsed
    status: str
    verdict: str
    timestamp: str


class BradburyProfileVerifierV2(gl.Contract):
    submissions: TreeMap[str, Submission]
    verified_handles: TreeMap[str, str]
    count: u256

    def __init__(self):
        self.count = u256(0)

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
        oembed_raw_json: str,
    ) -> str:
        existing = self.verified_handles.get(gl.message.sender_address.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(f"wallet already verified as @{existing}")

        if len(x_handle) < 2 or len(x_handle) > 30:
            raise gl.vm.UserError("invalid handle length (2-30 chars)")
        if len(code) != 6 or not code.isalnum():
            raise gl.vm.UserError("code must be exactly 6 alphanumeric characters")
        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith("https://twitter.com/"):
            raise gl.vm.UserError("tweet URL must start with https://x.com/ or https://twitter.com/")
        self._extract_tweet_id(tweet_url)
        if len(oembed_raw_json) < 50:
            raise gl.vm.UserError("oEmbed data too short")

        task_id = f"p_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = Submission(
            submitter=gl.message.sender_address,
            x_handle=x_handle,
            code=code,
            tweet_url=tweet_url,
            oembed_raw_json=oembed_raw_json,
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)
        return task_id

    # ── Verify (prompt_comparative on deterministic nd) ────────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("submission already resolved")

        existing = self.verified_handles.get(sub.submitter.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(f"wallet already verified as @{existing}")

        # Extract values before nd() — avoid capturing dataclass in closure
        handle = sub.x_handle
        code = sub.code
        raw_json = sub.oembed_raw_json

        def nd() -> str:
            """Parse raw oEmbed JSON deterministically — no gl.nondet.* calls."""
            data = json.loads(raw_json)

            # Extract author_url from oEmbed
            author_url = data.get("author_url", "")
            # Extract tweet text from oEmbed html block
            html = data.get("html", "")

            # Extract handle from author_url: "https://x.com/momentum_pool" → "momentum_pool"
            api_handle = ""
            parts = author_url.rstrip("/").split("/")
            if parts:
                api_handle = parts[-1].lower()

            # Strip HTML from oEmbed html to get plain text
            text = re.sub(r'<[^>]+>', ' ', html)

            verified = (
                api_handle == handle.lower()
                and code in text
            )
            return json.dumps({"verified": verified}, sort_keys=True)

        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the "verified" field. Both must return true or both must return false.""",
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            f"X handle @{sub.x_handle} verified — oEmbed confirms matching handle and code"
            if verdict == "verified"
            else f"could not confirm @{sub.x_handle} — handle or code mismatch"
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
        return self.verified_handles.get(wallet, "")
