# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
GenLayer Liked-Post Verifier — Checks if an uploaded screenshot shows a
specific post from @GenLayer on X/Twitter that has been liked (heart icon filled).

Pinned post: https://x.com/genlayer/status/2060049252319961451

User uploads a compressed image (≤50KB JPEG/PNG) as bytes in calldata.
Contract stores it, then verify() uses AI consensus to determine if the
image shows THIS specific post in a liked state.
"""
from genlayer import *
import typing
import json
from dataclasses import dataclass

PINNED_POST = "https://x.com/genlayer/status/2060049252319961451"
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


class LikedPostVerifier(gl.Contract):
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

        img_data = self.images[task_id]

        def nd() -> str:
            # Render the pinned post page as text for reference context
            page_text = gl.nondet.web.render(
                PINNED_POST,
                mode="text",
                wait_after_loaded="5s",
            )

            prompt = f"""You are a GenLayer liked-post verifier. Analyze the attached image and the page text to determine if the image shows the SPECIFIC pinned post from @GenLayer on X/Twitter that has been liked by the viewer.

PINNED POST URL: {PINNED_POST}

PAGE TEXT (from the pinned post):
---
{page_text[:4000]}
---

INSTRUCTIONS:
1. Determine whether the image is a screenshot of an X/Twitter post.
2. Determine whether the post author is GenLayer:
   - Look for "GenLayer" and/or "@GenLayer" in the post header.
   - The author handle must be clearly visible and match @GenLayer.
3. Determine whether the post content in the screenshot matches this SPECIFIC pinned post:
   - The post is about "GenLayer Portal" being live on mainnet.
   - Compare the visible text/content in the screenshot with the page text above.
   - The content should be substantially the same post.
4. Determine whether the post appears to be LIKED:
   - Look for a filled, solid, or highlighted heart icon near the post.
   - A pink or red filled heart icon is strong evidence that the post is liked.
   - The heart must be visibly different from an unselected/outline heart.
5. If the image is NOT an X/Twitter post screenshot → verified=false
6. If the author is NOT clearly GenLayer → verified=false
7. If the post content does NOT match the pinned post → verified=false
8. If the post does NOT clearly appear liked → verified=false
9. If unsure about any requirement → verified=false
10. NEVER guess.

IMPORTANT:
- The pinned post is at {PINNED_POST}
- Focus on whether the screenshot shows THIS SPECIFIC post authored by GenLayer.
- Focus on whether there is clear visual evidence that the post is liked.
- A pink/red filled heart is sufficient evidence of a liked post.
- Do not infer missing information.
- Only return true when the evidence is clear.

Return ONLY this JSON with no other text:

{{"verified": true}} if the image clearly shows THIS SPECIFIC pinned GenLayer post in a liked state
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
            "Image confirmed as a liked GenLayer pinned post"
            if verdict == "verified"
            else "Image not recognized as a liked GenLayer pinned post"
        )

        sub.status = verdict
        sub.verdict = reason
        self.submissions[task_id] = sub

        # Clean up stored image
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
        sub = self.submissions.get(task_id)
        if sub is None:
            return False
        return sub.status == "verified"
