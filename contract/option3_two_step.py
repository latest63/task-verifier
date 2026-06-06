# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
OPTION 3 — Two-step: fetch_oembed stores data via consensus, then verify runs
deterministic nd() on it.

Step 1: submit(tweet_url, code) → stores on chain
Step 2: fetch_oembed(task_id) → validators independently fetch oEmbed via
        gl.nondet.web.render, stored through strict_eq consensus
Step 3: verify(task_id) → prompt_comparative + deterministic nd() on stored data
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
    oembed_raw_json: str      # populated by fetch_oembed step
    oembed_fetched: bool       # tracks whether fetch step completed
    status: str                # "pending" | "fetching" | "verified" | "rejected"
    verdict: str
    timestamp: str


class VerifierOption3(gl.Contract):
    submissions: TreeMap[str, Submission]
    verified_handles: TreeMap[str, str]
    count: u256

    def __init__(self):
        self.count = u256(0)

    def _extract_tweet_id(self, url: str) -> str:
        match = re.search(r'/status/(\d+)', url)
        if not match:
            raise gl.vm.UserError("tweet URL must contain /status/<id>")
        return match.group(1)

    # ── Step 1: Submit ──────────────────────────────────────────────────────

    @gl.public.write
    def submit(
        self,
        x_handle: str,
        code: str,
        tweet_url: str,
    ) -> str:
        existing = self.verified_handles.get(gl.message.sender_address.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(f"wallet already verified as @{existing}")

        if len(x_handle) < 2 or len(x_handle) > 30:
            raise gl.vm.UserError("invalid handle length (2-30 chars)")
        if len(code) != 6 or not code.isalnum():
            raise gl.vm.UserError("code must be exactly 6 alphanumeric chars")
        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith("https://twitter.com/"):
            raise gl.vm.UserError("tweet URL must start with https://x.com/ or https://twitter.com/")
        self._extract_tweet_id(tweet_url)

        task_id = f"p_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = Submission(
            submitter=gl.message.sender_address,
            x_handle=x_handle,
            code=code,
            tweet_url=tweet_url,
            oembed_raw_json="",
            oembed_fetched=False,
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)
        return task_id

    # ── Step 2: Fetch oEmbed (non-deterministic, strict_eq consensus) ──────

    @gl.public.write
    def fetch_oembed(self, task_id: str) -> str:
        """Each validator fetches oEmbed via web.render. strict_eq requires all
        to return identical data for consensus."""
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("submission already resolved")

        tweet_url = sub.tweet_url

        def nd() -> str:
            """Fetch oEmbed — each validator independently renders the page."""
            oembed_url = f"https://publish.twitter.com/oembed?url={tweet_url}"
            raw = gl.nondet.web.render(oembed_url, mode="text")
            return raw

        raw = gl.eq_principle.strict_eq(nd)
        sub.oembed_raw_json = raw
        sub.oembed_fetched = True
        self.submissions[task_id] = sub
        return "fetched"

    # ── Step 3: Verify (prompt_comparative + deterministic nd) ─────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if not sub.oembed_fetched:
            raise gl.vm.UserError("must call fetch_oembed first")
        if sub.status != "pending":
            raise gl.vm.UserError("submission already resolved")

        existing = self.verified_handles.get(sub.submitter.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(f"wallet already verified as @{existing}")

        # Extract to local primitives
        handle = sub.x_handle
        code = sub.code
        raw_json = sub.oembed_raw_json

        def nd() -> str:
            """Deterministic parse of already-fetched oEmbed data."""
            data = json.loads(raw_json)
            author_url = data.get("author_url", "")
            html = data.get("html", "")

            api_handle = ""
            parts = author_url.rstrip("/").split("/")
            if parts:
                api_handle = parts[-1].lower()

            text = re.sub(r'<[^>]+>', ' ', html)

            verified = (
                api_handle == handle.lower()
                and code in text
            )
            return json.dumps({"verified": verified}, sort_keys=True)

        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the "verified" field.""",
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        sub.status = verdict
        sub.verdict = (
            f"X handle @{sub.x_handle} verified — validators confirm match"
            if verdict == "verified"
            else f"could not confirm @{sub.x_handle}"
        )
        self.submissions[task_id] = sub

        if verdict == "verified":
            self.verified_handles[sub.submitter.as_hex.lower()] = sub.x_handle

        return {"status": verdict, "reason": sub.verdict}

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
            "oembed_fetched": sub.oembed_fetched,
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
                "oembed_fetched": v.oembed_fetched,
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
