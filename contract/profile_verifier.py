# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
GenLayer Profile Verifier — Verifies an X/Twitter handle belongs to a wallet.
User tweets a one-time code, provides the tweet URL, and AI validators
fetch the tweet page to confirm the code is present.

Flow:
1. User generates a random code in the app (6-char alphanumeric, 5min expiry)
2. User tweets: "Verifying @taskverifier: {CODE}"
3. User provides the tweet URL
4. AI validators fetch the tweet page via web.render() and check for:
   - The tweet is from @{handle}
   - The tweet contains the verification code
5. On success, the wallet -> x_handle mapping is stored on-chain
"""
from genlayer import *
import typing
import json
from dataclasses import dataclass

MIN_HANDLE_LEN = 2
MAX_HANDLE_LEN = 30
CODE_LEN = 6


@allow_storage
@dataclass
class Submission:
    submitter: Address
    x_handle: str
    code: str
    tweet_url: str
    status: str           # "pending", "verified", "rejected"
    verdict: str
    timestamp: str


class ProfileVerifier(gl.Contract):
    submissions: TreeMap[str, Submission]
    verified_handles: TreeMap[str, str]  # wallet_hex -> x_handle
    count: u256

    def __init__(self):
        self.count = u256(0)

    # ---- Submit ---------------------------------------------------------------

    @gl.public.write
    def submit(self, img_data: bytes, x_handle: str, code: str, tweet_url: str) -> str:
        # Validate handle
        if len(x_handle) < MIN_HANDLE_LEN or len(x_handle) > MAX_HANDLE_LEN:
            raise gl.vm.UserError(f"Invalid handle length (min {MIN_HANDLE_LEN}, max {MAX_HANDLE_LEN})")

        # Validate code format (6 alphanumeric)
        if len(code) != CODE_LEN or not code.isalnum():
            raise gl.vm.UserError(f"Invalid code format (must be {CODE_LEN} alphanumeric chars)")

        # Basic URL validation
        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith("https://twitter.com/"):
            raise gl.vm.UserError("Invalid tweet URL (must start with https://x.com/ or https://twitter.com/)")

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

    # ---- Verify (AI Consensus) — URL Scraping, No Image Needed ----------------

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("Submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("Already verified")

        def nd() -> str:
            # Fetch the tweet page to verify the code and handle are present
            page_content = gl.nondet.web.render(sub.tweet_url)

            prompt = f"""You are a GenLayer X/Twitter profile verifier. Determine if the X/Twitter post at the URL below is from @{sub.x_handle} and contains the verification code "{sub.code}".

X HANDLE TO VERIFY: @{sub.x_handle}
VERIFICATION CODE: {sub.code}
TWEET URL: {sub.tweet_url}

PAGE CONTENT FROM THE URL:
{page_content[:5000]}

INSTRUCTIONS:
1. Does the page content show a tweet/post from @{sub.x_handle}? Look for the handle, display name, or @username in the content.
2. Does the tweet text contain the exact verification code "{sub.code}" as a continuous, unbroken string?
3. If the page is an error, login wall, or doesn't contain a tweet -> verified=false
4. If the tweet author is NOT @{sub.x_handle} -> verified=false
5. If the verification code "{sub.code}" is NOT present in the tweet text -> verified=false
6. If unsure about any requirement -> verified=false
7. NEVER guess.

Return ONLY this JSON with no other text:
{{"verified": true}} if the tweet from @{sub.x_handle} contains the code "{sub.code}"
{{"verified": false}} if it does not"""

            result = gl.nondet.exec_prompt(prompt)
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            elif result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]
            parsed = json.loads(result.strip())
            return json.dumps(parsed, sort_keys=True)

        raw = json.loads(gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the "verified" field. Both must return true or both must return false. Wording and other details may differ, but the binary verdict MUST match."""
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            f"X handle @{sub.x_handle} verified - tweet URL confirmed with correct code"
            if verdict == "verified"
            else f"Could not confirm @{sub.x_handle} - tweet at URL does not contain the verification code"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        # If verified, store the wallet -> handle mapping (lowercase key for case-insensitive lookup)
        if verdict == "verified":
            self.verified_handles[sub.submitter.as_hex.lower()] = sub.x_handle

        return {"status": verdict, "reason": reason}

    # ---- Views ---------------------------------------------------------------

    @gl.public.view
    def get_submission(self, task_id: str) -> dict:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("Submission not found")
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
        """Returns the verified X handle for a wallet address, or empty string if not verified."""
        return self.verified_handles.get(wallet, "")
