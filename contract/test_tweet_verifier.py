# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Test contract — same submit → verify flow as BradburyProfileVerifier.
Tests if a tweet exists with specific author + content.
Uses exec_prompt + prompt_comparative with oEmbed data embedded in prompt.
"""

from genlayer import *
import typing
import json
from dataclasses import dataclass


@allow_storage
@dataclass
class TestSubmission:
    submitter: Address
    tweet_url: str
    expected_handle: str
    expected_text: str
    oembed_json: str
    status: str           # "pending" | "verified" | "rejected"
    verdict: str
    timestamp: str


class TestTweetVerifier(gl.Contract):
    submissions: TreeMap[str, TestSubmission]
    count: u256

    def __init__(self):
        self.count = u256(0)

    def _clean_llm_output(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    @gl.public.write
    def submit(self, tweet_url: str, expected_handle: str, expected_text: str, oembed_json: str) -> str:
        task_id = f"t_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = TestSubmission(
            submitter=gl.message.sender_address,
            tweet_url=tweet_url,
            expected_handle=expected_handle,
            expected_text=expected_text,
            oembed_json=oembed_json,
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.count = u256(int(self.count) + 1)

        return task_id

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("already resolved")

        def nd() -> str:
            prompt = f"""You are verifying an X/Twitter post.

Tweet URL: {sub.tweet_url}
Expected author handle: @{sub.expected_handle}
Expected tweet content: "{sub.expected_text}"

Here is the oEmbed data from X.com for this tweet URL:

{sub.oembed_json}

Based on this oEmbed data:
1. Does the tweet exist? (check if the data has valid author_url and html)
2. Is the author @{sub.expected_handle}? (check the "author_url" field)
3. Does the tweet content match "{sub.expected_text}"? (check the "html" field's <p> tag)

RULES:
- NEVER guess. If you can't confirm → verified=false
- Look ONLY at the oEmbed data provided above. Do not visit any URLs.

Return ONLY:
{{"verified": true}} if ALL three checks pass
{{"verified": false}} if ANY check fails"""

            result = gl.nondet.exec_prompt(prompt)
            result = self._clean_llm_output(result)
            try:
                parsed = json.loads(result)
            except json.JSONDecodeError:
                return json.dumps({"verified": False}, sort_keys=True)
            return json.dumps(parsed, sort_keys=True)

        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the \"verified\" field. Both must return true or both must return false. Wording and other details may differ, but the binary verdict MUST match.""",
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            f"Tweet confirmed — @{sub.expected_handle} posted \"{sub.expected_text}\""
            if verdict == "verified"
            else f"Could not confirm tweet by @{sub.expected_handle}"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        return {"status": verdict, "reason": reason, "tweet_url": sub.tweet_url}

    @gl.public.view
    def get_submission(self, task_id: str) -> dict:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("submission not found")
        return {
            "submitter": sub.submitter.as_hex,
            "tweet_url": sub.tweet_url,
            "expected_handle": sub.expected_handle,
            "expected_text": sub.expected_text,
            "status": sub.status,
            "verdict": sub.verdict,
            "timestamp": sub.timestamp,
        }

    @gl.public.view
    def get_all(self) -> dict[str, dict]:
        return {
            k: {
                "submitter": v.submitter.as_hex,
                "tweet_url": v.tweet_url,
                "expected_handle": v.expected_handle,
                "expected_text": v.expected_text,
                "status": v.status,
                "verdict": v.verdict,
                "timestamp": v.timestamp,
            }
            for k, v in self.submissions.items()
        }

    @gl.public.view
    def ping(self) -> str:
        return "ok"
