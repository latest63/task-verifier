# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
GenLayer Image Verifier — Simple contract that checks if an uploaded screenshot
is a legitimate post from @GenLayer on X/Twitter.

User uploads a compressed image (≤50KB JPEG/PNG) as bytes in calldata.
Contract stores it, then verify() uses AI consensus to determine if the
image shows a real GenLayer post.
"""
from genlayer import *
import typing
import json
from dataclasses import dataclass

GENLAYER_X = "https://x.com/GenLayer"
MAX_IMG_BYTES = 50000
MIN_IMG_BYTES = 100


@allow_storage
@dataclass
class Submission:
    submitter: Address
    img_size: u256
    status: str           # "pending", "verified", "rejected"
    verdict: str
    timestamp: str


class ImageVerifier(gl.Contract):
    submissions: TreeMap[str, Submission]
    images: TreeMap[str, bytes]       # task_id → raw image bytes
    count: u256

    def __init__(self):
        self.count = u256(0)

    # ── Submit ──────────────────────────────────────────────────────

    @gl.public.write
    def submit(self, img_data: bytes) -> str:
        if len(img_data) < MIN_IMG_BYTES:
            raise gl.vm.UserError(
                f"Image too small (min {MIN_IMG_BYTES} bytes)"
            )
        if len(img_data) > MAX_IMG_BYTES:
            raise gl.vm.UserError(
                f"Image too large (max {MAX_IMG_BYTES} bytes)"
            )

        is_jpeg = len(img_data) > 2 and img_data[:2] == b'\xff\xd8'
        is_png = len(img_data) > 4 and img_data[:4] == b'\x89PNG'
        if not (is_jpeg or is_png):
            raise gl.vm.UserError("Invalid image (JPEG/PNG magic bytes required)")

        task_id = f"v_{int(self.count)}"
        now = gl.message_raw["datetime"]

        self.submissions[task_id] = Submission(
            submitter=gl.message.sender_address,
            img_size=u256(len(img_data)),
            status="pending",
            verdict="",
            timestamp=now,
        )
        self.images[task_id] = img_data
        self.count = u256(int(self.count) + 1)

        return task_id

    # ── Verify (AI Consensus) ──────────────────────────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("Submission not found")
        if sub.status != "pending":
            raise gl.vm.UserError("Already verified")

        # Capture storage OUTSIDE the nondet block (see pitfall #32)
        img_data = self.images[task_id]

        def nd() -> str:
            # Fetch GenLayer's X profile as rendered text
            page_text = gl.nondet.web.render(
                GENLAYER_X,
                mode="text",
                wait_after_loaded="5s",
            )

            prompt = f"""You are a GenLayer post verifier. Analyze the attached image and the page text to determine if the image shows a real post from @GenLayer on X/Twitter.

PAGE TEXT (from GenLayer's X profile):
---
{page_text[:4000]}
---

INSTRUCTIONS:
1. Does the image show an X/Twitter screenshot?
2. Does it show a post from @GenLayer (look for "GenLayer" in the username/header area)?
3. Does the content in the screenshot match what GenLayer posts about (from the page text above)?
4. If the image is NOT an X/Twitter screenshot → return verified=false
5. If the image does NOT clearly show a GenLayer post → return verified=false
6. If unsure, return verified=false — NEVER guess

Return ONLY this JSON with no other text:
{{"verified": true}}  if the image shows a GenLayer post
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
            principle="""All validators must agree on the 'verified' field. Both must return true or both must return false. Wording and other details may differ, but the binary verdict MUST match."""
        ))

        verdict = "verified" if raw.get("verified", False) else "rejected"
        reason = (
            "Image confirmed as GenLayer post"
            if verdict == "verified"
            else "Image not recognized as a GenLayer post"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        # Clean up stored image (already verified, no need to keep)
        del self.images[task_id]

        return {"status": verdict, "reason": reason}

    # ── Views ──────────────────────────────────────────────────────

    @gl.public.view
    def get_submission(self, task_id: str) -> dict:
        sub = self.submissions.get(task_id)
        if sub is None:
            raise gl.vm.UserError("Submission not found")
        return {
            "submitter": sub.submitter.as_hex,
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
    def is_verified(self, task_id: str) -> bool:
        """Quick check if a submission was verified."""
        sub = self.submissions.get(task_id)
        if sub is None:
            return False
        return sub.status == "verified"
