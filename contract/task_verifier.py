# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json
from dataclasses import dataclass

PINNED_POST = "https://x.com/GenLayer/status/2033575658165867008"


@allow_storage
@dataclass
class Task:
    submitter: Address
    screenshot_url: str
    status: str               # "pending", "verified", "rejected"
    verdict_reason: str
    timestamp: str


class TaskVerifier(gl.Contract):
    tasks: TreeMap[str, Task]
    task_count: u256

    # ── Anti-abuse storage ──────────────────────────────────────
    used_screenshots: TreeMap[str, bool]   # screenshot_url → claimed

    def __init__(self):
        self.task_count = u256(0)

    # ── Submit a new verification task ──────────────────────────

    @gl.public.write
    def submit_task(self, screenshot_url: str) -> str:
        if self.used_screenshots.get(screenshot_url, False):
            raise gl.vm.UserError("this screenshot has already been used")

        task_id = f"task_{int(self.task_count)}"
        now = gl.message_raw["datetime"]

        self.tasks[task_id] = Task(
            submitter=gl.message.sender_address,
            screenshot_url=screenshot_url,
            status="pending",
            verdict_reason="",
            timestamp=now,
        )
        self.task_count = u256(int(self.task_count) + 1)
        self.used_screenshots[screenshot_url] = True

        return task_id

    # ── Run verification (multi-LLM consensus) ─────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        task = self.tasks.get(task_id)
        if task is None:
            raise gl.vm.UserError("task not found")
        if task.status != "pending":
            raise gl.vm.UserError("task already resolved")

        # ── Non-deterministic block: web fetch + LLM consensus ──
        def nondet_verify() -> str:
            # Step 1: Render pinned post page as text
            page_text = gl.nondet.web.render(
                PINNED_POST,
                mode="text",
                wait_after_loaded="5s",
            )

            # Step 2: Fetch screenshot image from hosted URL
            img_resp = gl.nondet.web.get(task.screenshot_url)
            img_bytes = img_resp.body

            # Validate image is not empty/broken
            if not img_bytes or len(img_bytes) < 100:
                return json.dumps({"verified": False}, sort_keys=True)

            # Step 3: LLM consensus — analyze image + page text
            prompt = f"""You are a screenshot verification agent.

You are given ONE image and the rendered text of a Twitter/X page.
Analyze BOTH the image and the page text.

CLAIM: the user liked the GenLayer pinned post.
PINNED POST: {PINNED_POST}

Rendered page text:
---
{page_text[:5000]}
---

CRITICAL INSTRUCTIONS:
1. The image MUST show an X/Twitter interface. If it shows anything else (random photo, meme, blank screen, etc.), return verified=false.
2. The image MUST show the GenLayer pinned post about "GenLayer Portal" / "now live". If it shows a different tweet, return verified=false.
3. The page text above is from the live tweet URL. It should mention GenLayer. If it is empty/blocked/unrelated, return verified=false.
4. Only return verified=true if BOTH the image shows a valid GenLayer tweet screenshot AND the page text confirms GenLayer content.
5. If you are unsure about the image content, return verified=false. NEVER guess.

Return ONLY JSON:
{{"verified": true}}  if evidence confirms the claim
{{"verified": false}} if evidence does not confirm the claim

Do NOT include any other keys, explanations, or markdown."""

            result = gl.nondet.exec_prompt(prompt, images=[img_bytes])

            # Clean: strip markdown code fences if present
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            elif result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]

            # Normalize JSON key order for strict_eq comparison
            parsed = json.loads(result.strip())
            return json.dumps(parsed, sort_keys=True)

        # Multi-validator consensus: all LLMs must return identical result
        raw_verdict = json.loads(gl.eq_principle.strict_eq(nondet_verify))
        verdict = "verified" if raw_verdict.get("verified", False) else "rejected"
        verdict_json = {
            "verdict": verdict,
            "reason": "Tweet page evidence confirms the action" if verdict == "verified" else "Tweet page evidence does not confirm the action",
            "confidence": "high",
            "score": 100 if verdict == "verified" else 0,
        }

        # Apply verdict
        task.status = verdict_json["verdict"]
        task.verdict_reason = verdict_json["reason"]
        self.tasks[task_id] = task

        return verdict_json

    # ── Views ──────────────────────────────────────────────────

    @gl.public.view
    def get_task(self, task_id: str) -> dict:
        task = self.tasks.get(task_id)
        if task is None:
            raise gl.vm.UserError("task not found")
        return {
            "submitter": task.submitter.as_hex,
            "screenshot_url": task.screenshot_url,
            "status": task.status,
            "verdict_reason": task.verdict_reason,
            "timestamp": task.timestamp,
        }

    @gl.public.view
    def get_all_tasks(self) -> dict[str, dict]:
        return {
            k: {
                "submitter": v.submitter.as_hex,
                "screenshot_url": v.screenshot_url,
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
    def is_screenshot_used(self, url: str) -> bool:
        """Check if a screenshot URL has already been submitted."""
        return self.used_screenshots.get(url, False)
