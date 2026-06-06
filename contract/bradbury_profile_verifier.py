# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Bradbury Profile Verifier — On-chain AI consensus via prompt_comparative.

ARCHITECTURE:

  Verification uses GenLayer's prompt_comparative principle:
    1. User submits (oembed_json, x_handle, code, tweet_url) → pending state
       oembed_json is pre-fetched by the frontend from publish.x.com/oembed
    2. verify() runs exec_prompt on each validator's LLM with the
       oEmbed data embedded in the prompt
    3. prompt_comparative reaches semantic consensus on the LLM outputs
    4. Submission is marked verified or rejected

  This avoids strict_eq + gl.nondet.web.get (broken on Bradbury) and
  instead uses GenLayer's LLM-based consensus principle, which tolerates
  minor differences in output phrasing.
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
    oembed_json: str        # Pre-fetched oEmbed response from X.com
    status: str             # "pending" | "verified" | "rejected"
    verdict: str
    timestamp: str


class BradburyProfileVerifier(gl.Contract):
    submissions: TreeMap[str, Submission]
    verified_handles: TreeMap[str, str]  # wallet_hex → x_handle
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

    def _clean_llm_output(self, text: str) -> str:
        """Strip markdown code fences from LLM output."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    # ── Submit ───────────────────────────────────────────────────────────────

    @gl.public.write
    def submit(
        self,
        oembed_json: str,
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

        # Validate oembed_json is non-empty JSON
        if len(oembed_json) < 10:
            raise gl.vm.UserError("oembed_json is too short or empty")

        task_id = f"p_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = Submission(
            submitter=gl.message.sender_address,
            x_handle=x_handle,
            code=code,
            tweet_url=tweet_url,
            oembed_json=oembed_json,
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)

        return task_id

    # ── Verify (LLM → prompt_comparative) ──────────────────────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("submission already resolved")

        # Double-check wallet not already verified
        existing = self.verified_handles.get(sub.submitter.as_hex.lower(), "")
        if existing != "":
            raise gl.vm.UserError(
                f"wallet already verified as @{existing}"
            )

        # Parse stored oEmbed JSON to extract author_url and html for the prompt
        oembed_data = sub.oembed_json

        def nd() -> str:
            """
            Non-deterministic block:
              1. Runs exec_prompt with oEmbed data embedded in the prompt
              2. Each validator's LLM reads the oEmbed and determines handle + code match
              3. Returns deterministic JSON verdict
            """
            prompt = f"""You are verifying an X/Twitter profile verification.

A user claims their X handle is @{sub.x_handle}.
They were given verification code: {sub.code}
They should have tweeted a message containing this code.

Here is the oEmbed response from X.com for their claimed tweet URL ({sub.tweet_url}):

{sub.oembed_json}

Based on this oEmbed data, determine:
1. Is the tweet author @{sub.x_handle}? (Check the "author_url" or "author_name" field in the oEmbed JSON above)
2. Does the tweet text (found inside the "html" field's <p> tag) contain the code "{sub.code}"?

RULES:
- If you are unsure about the author or the code → verified=false
- NEVER guess. If the data is missing or unclear → verified=false
- Look ONLY at the oEmbed data provided above. Do not visit any URLs.

Return ONLY this JSON with no other text:
{{"verified": true}} if the tweet is from @{sub.x_handle} AND contains the code "{sub.code}"
{{"verified": false}} if it does not"""

            result = gl.nondet.exec_prompt(prompt)
            result = self._clean_llm_output(result)
            try:
                parsed = json.loads(result)
            except json.JSONDecodeError:
                # If LLM returns malformed JSON, fail safe
                return json.dumps({"verified": False}, sort_keys=True)
            return json.dumps(parsed, sort_keys=True)

        # prompt_comparative: each validator runs nd(), then principle compares
        # outputs semantically (not exact match). Allows minor phrasing differences.
        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the "verified" field. Both must return true or both must return false. Wording and other details may differ, but the binary verdict MUST match.""",
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            f"X handle @{sub.x_handle} verified — oEmbed confirm with matching handle and code"
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
            "oembed_json": sub.oembed_json,
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
                "oembed_json": v.oembed_json,
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
