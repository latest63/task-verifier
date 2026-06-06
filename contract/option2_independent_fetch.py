# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
OPTION 2 — Submit only tweet_url + code, validators independently fetch oEmbed.
Uses exec_prompt inside prompt_comparative — each validator fetches the oEmbed
API independently and determines if the tweet matches. NO pre-fetched data.
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
    status: str
    verdict: str
    timestamp: str


class VerifierOption2(gl.Contract):
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

    def _clean_llm_output(self, text: str) -> str:
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
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)
        return task_id

    # ── Verify (independent fetch + LLM reasoning) ─────────────────────────

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

        # Extract to local primitives
        handle = sub.x_handle
        code = sub.code
        tweet_url = sub.tweet_url

        def nd() -> str:
            """Each validator independently fetches oEmbed and verifies.
            Uses exec_prompt with the oEmbed data fetched via web.render."""
            oembed_url = f"https://publish.twitter.com/oembed?url={tweet_url}"
            oembed_data = gl.nondet.web.render(oembed_url, mode="text")

            prompt = f"""You are verifying an X/Twitter post.

Tweet URL: {tweet_url}
Claimed handle: @{handle}
Verification code: "{code}"

Here is the oEmbed data fetched from X.com for this tweet URL:

{oembed_data}

Based ONLY on the oEmbed data above:
1. Is the author @{handle}? (check the "author_url" field)
2. Does the tweet text contain the verification code "{code}"?

Return ONLY:
{{"verified": true}} — if BOTH conditions are met
{{"verified": false}} — if EITHER condition fails or data is invalid"""

            result = gl.nondet.exec_prompt(prompt)
            result = self._clean_llm_output(result)
            try:
                parsed = json.loads(result)
            except json.JSONDecodeError:
                return json.dumps({"verified": False}, sort_keys=True)
            return json.dumps(parsed, sort_keys=True)

        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the "verified" field. Both must return true or both must return false.""",
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        sub.status = verdict
        sub.verdict = (
            f"X handle @{sub.x_handle} verified — validators confirmed matching handle and code"
            if verdict == "verified"
            else f"could not confirm @{sub.x_handle} — handle or code mismatch"
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
