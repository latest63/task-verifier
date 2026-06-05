# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
GenLayer Profile Verifier — Verifies an X/Twitter handle belongs to a wallet.
User tweets a one-time code, uploads a screenshot + tweet URL, and AI validators
confirm the tweet is real and contains the correct code.

Flow:
1. User generates a random code in the app (6-char alphanumeric, 5min expiry)
2. User tweets: "Verifying @taskverifier: {CODE}"
3. User uploads screenshot + tweet URL
4. AI validators check: screenshot shows a real tweet from @{handle} with that code,
   AND the URL matches the tweet in the screenshot
5. On success, the wallet -> x_handle mapping is stored on-chain
"""
from genlayer import *
import typing
import json
from dataclasses import dataclass

MAX_IMG_BYTES = 50000
MIN_IMG_BYTES = 100
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
    img_size: u256
    status: str           # "pending", "verified", "rejected"
    verdict: str
    timestamp: str


class ProfileVerifier(gl.Contract):
    submissions: TreeMap[str, Submission]
    images: TreeMap[str, bytes]       # task_id -> raw image bytes
    verified_handles: TreeMap[str, str]  # wallet_hex -> x_handle
    count: u256

    def __init__(self):
        self.count = u256(0)

    # ---- Submit ---------------------------------------------------------------

    @gl.public.write
    def submit(self, img_data: bytes, x_handle: str, code: str, tweet_url: str) -> str:
        if len(img_data) < MIN_IMG_BYTES:
            raise gl.vm.UserError(
                f"Image too small (min {MIN_IMG_BYTES} bytes)"
            )
        if len(img_data) > MAX_IMG_BYTES:
            raise gl.vm.UserError(
                f"Image too large (max {MAX_IMG_BYTES} bytes)"
            )

        is_jpeg = len(img_data) > 2 and img_data[:2] == b"\xff\xd8"
        is_png = len(img_data) > 4 and img_data[:4] == b"\x89PNG"
        if not (is_jpeg or is_png):
            raise gl.vm.UserError("Invalid image (JPEG/PNG magic bytes required)")

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
            img_size=u256(len(img_data)),
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.images[task_id] = img_data
        self.count = u256(int(self.count) + 1)

        return task_id

    # ---- Verify (AI Consensus) -----------------------------------------------

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("Submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("Already verified")

        img_data = self.images[task_id]

        def nd() -> str:
            prompt = f"""You are a GenLayer X/Twitter profile verifier. Analyze the attached image to determine if it shows a real X/Twitter post from the account @{sub.x_handle} that contains the verification code "{sub.code}" AND whose URL matches {sub.tweet_url}.

X HANDLE TO VERIFY: @{sub.x_handle}
VERIFICATION CODE: {sub.code}
TWEET URL: {sub.tweet_url}

INSTRUCTIONS:
1. Does the image show an X/Twitter post screenshot?
2. Is the post author clearly @{sub.x_handle}? Look for the handle or display name in the post header.
3. Does the post text contain the exact verification code "{sub.code}"?
4. Does the post in the screenshot correspond to the URL {sub.tweet_url}? The handle and content should match what is at that URL.
5. If the image is NOT an X/Twitter screenshot -> verified=false
6. If the post author is NOT @{sub.x_handle} -> verified=false
7. If the verification code "{sub.code}" is NOT present in the post text -> verified=false
8. If the tweet does NOT match the URL {sub.tweet_url} (wrong handle or content) -> verified=false
9. If unsure about any requirement -> verified=false
10. NEVER guess.

The code "{sub.code}" must appear as a continuous, unbroken string in the tweet text.

Return ONLY this JSON with no other text:

{{"verified": true}} if the image clearly shows a real tweet from @{sub.x_handle} containing the code "{sub.code}" AND matching {sub.tweet_url}
{{"verified": false}} if it does not"""

            result = gl.nondet.exec_prompt(prompt, images=[img_data])
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
            f"X handle @{sub.x_handle} verified - screenshot matches the tweet URL with correct code"
            if verdict == "verified"
            else f"Could not confirm @{sub.x_handle} - screenshot does not show a valid tweet matching the URL with the verification code"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        # If verified, store the wallet -> handle mapping (lowercase key for case-insensitive lookup)
        if verdict == "verified":
            self.verified_handles[sub.submitter.as_hex.lower()] = sub.x_handle

        # Clean up stored image
        del self.images[task_id]

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
            "img_size": int(sub.img_size),
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
                "img_size": int(v.img_size),
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
