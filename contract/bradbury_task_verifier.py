# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Task Verifier — deterministic X/Twitter verification via syndication API.

KEY DIFFERENCE from StudioNet contracts:
  ❌ web.render()        →  ✅ gl.nondet.web.get()
  ❌ exec_prompt (LLM)   →  ✅ Deterministic JSON parse
  ❌ prompt_comparative   →  ✅ strict_eq
  ❌ AI interpretation    →  ✅ Field-level string comparison

All validators fetch lightweight JSON from the tweet syndication endpoint,
parse the same 3 fields (screen_name, text), and return identical binary verdicts.
"""

from genlayer import *
import typing
import json
from dataclasses import dataclass
import re

SYNDICATION_BASE = "https://cdn.syndication.twimg.com/tweet-result"
UA_HEADER = "Mozilla/5.0 (compatible; GenLayer/1.0)"


@allow_storage
@dataclass
class Task:
    submitter: Address
    tweet_url: str
    expected_handle: str
    verification_code: str
    status: str               # "pending" | "verified" | "rejected"
    verdict_reason: str
    timestamp: str


class BradburyTaskVerifier(gl.Contract):
    tasks: TreeMap[str, Task]
    task_count: u256
    verified_handles: TreeMap[str, Address]   # handle → wallet that owns it

    def __init__(self):
        self.task_count = u256(0)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _extract_tweet_id(self, url: str) -> str:
        """Pull numeric tweet ID from x.com or twitter.com /status/N."""
        match = re.search(r'/status/(\d+)', url)
        if not match:
            raise gl.vm.UserError("tweet URL must contain /status/<id>")
        return match.group(1)

    # ── Submit ───────────────────────────────────────────────────────────────

    @gl.public.write
    def submit_task(
        self,
        expected_handle: str,
        tweet_url: str,
        verification_code: str,
    ) -> str:
        # Validate handle format
        if not re.match(r'^[A-Za-z0-9_]{1,15}$', expected_handle):
            raise gl.vm.UserError(
                "invalid handle (1-15 chars, alphanumeric + underscore)"
            )

        # Validation code must be present
        if not verification_code or len(verification_code.strip()) < 3:
            raise gl.vm.UserError("verification_code must be at least 3 chars")

        # Validate tweet URL structure
        tweet_id = self._extract_tweet_id(tweet_url)
        if not tweet_id.isdigit():
            raise gl.vm.UserError("invalid tweet ID in URL")

        # Handle not already claimed by a different wallet
        existing = self.verified_handles.get(expected_handle)
        if existing is not None and existing != gl.message.sender_address:
            raise gl.vm.UserError(
                f"handle @{expected_handle} already verified to another wallet"
            )

        task_id = f"brad_{int(self.task_count)}"
        now = gl.message_raw["datetime"]

        self.tasks[task_id] = Task(
            submitter=gl.message.sender_address,
            tweet_url=tweet_url,
            expected_handle=expected_handle,
            verification_code=verification_code,
            status="pending",
            verdict_reason="",
            timestamp=now,
        )
        self.task_count = u256(int(self.task_count) + 1)

        return task_id

    # ── Verify (No AI, No Render, No Prompts) ───────────────────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        task = self.tasks.get(task_id)
        if task is None:
            raise gl.vm.UserError("task not found")
        if task.status != "pending":
            raise gl.vm.UserError("task already resolved")

        tweet_id = self._extract_tweet_id(task.tweet_url)
        api_url = f"{SYNDICATION_BASE}?id={tweet_id}&lang=en"

        def nd() -> str:
            """
            Non-deterministic block:
              1. GET syndication endpoint → lightweight JSON
              2. Parse screen_name + text
              3. Return deterministic verdict
            """
            resp = gl.nondet.web.get(api_url)

            # Defensive: empty / tiny response = fail
            if not resp or not resp.body or len(resp.body) < 50:
                return '{"verified":false}'

            try:
                data = json.loads(resp.body.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                return '{"verified":false}'

            # Extract fields — defensive access
            user = data.get("user") or {}
            api_handle = (user.get("screen_name") or "").lower()
            tweet_text = data.get("text") or ""

            # Binary check — no AI, no interpretation
            verified = (
                api_handle == task.expected_handle.lower()
                and task.verification_code in tweet_text
            )

            # sort_keys=True ensures identical output across validators
            return json.dumps({"verified": verified}, sort_keys=True)

        # strict_eq — ALL validators must return the EXACT same string
        # This works because the output is deterministic JSON, not free-text
        raw = json.loads(gl.eq_principle.strict_eq(nd))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            "tweet confirmed: handle + verification code match"
            if verdict == "verified"
            else "tweet does not match expected handle or code"
        )

        task.status = verdict
        task.verdict_reason = reason
        self.tasks[task_id] = task

        if verdict == "verified":
            self.verified_handles[task.expected_handle] = task.submitter

        return {
            "verdict": verdict,
            "reason": reason,
        }

    # ── Views ───────────────────────────────────────────────────────────────

    @gl.public.view
    def get_task(self, task_id: str) -> dict:
        task = self.tasks.get(task_id)
        if task is None:
            raise gl.vm.UserError("task not found")
        return {
            "submitter": task.submitter.as_hex,
            "tweet_url": task.tweet_url,
            "expected_handle": task.expected_handle,
            "verification_code": task.verification_code,
            "status": task.status,
            "verdict_reason": task.verdict_reason,
            "timestamp": task.timestamp,
        }

    @gl.public.view
    def get_all_tasks(self) -> dict[str, dict]:
        return {
            k: {
                "submitter": v.submitter.as_hex,
                "tweet_url": v.tweet_url,
                "expected_handle": v.expected_handle,
                "verification_code": v.verification_code,
                "status": v.status,
                "verdict_reason": v.verdict_reason,
                "timestamp": v.timestamp,
            }
            for k, v in self.tasks.items()
        }

    @gl.public.view
    def get_task_count(self) -> int:
        return int(self.task_count)

    @gl.public.view
    def get_verified_handle(self, handle: str) -> str:
        """Returns the wallet address that owns this handle, or 'not_verified'."""
        addr = self.verified_handles.get(handle)
        if addr is None:
            return "not_verified"
        return addr.as_hex

    @gl.public.view
    def is_tweet_used(self, tweet_url: str) -> bool:
        """Check if a tweet URL has already been submitted (anti-reuse)."""
        tweet_id = self._extract_tweet_id(tweet_url)
        for k, v in self.tasks.items():
            if v.status == "verified" and tweet_id in v.tweet_url:
                return True
        return False
