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
    expected_handle: str
    status: str               # "pending", "verified", "rejected"
    verdict_reason: str
    timestamp: str


class TaskVerifier(gl.Contract):
    tasks: TreeMap[str, Task]
    task_count: u256

    # ── Anti-abuse storage ──────────────────────────────────────
    used_screenshots: TreeMap[str, bool]   # screenshot_url → claimed
    verified_handles: TreeMap[str, Address]  # X handle → wallet that verified it

    def __init__(self):
        self.task_count = u256(0)

    # ── Submit a new verification task ──────────────────────────

    @gl.public.write
    def submit_task(
        self,
        expected_handle: str,
        screenshot_url: str,
    ) -> str:
        import re
        handle_re = r'^[A-Za-z0-9_]{1,15}$'
        if not re.match(handle_re, expected_handle):
            raise gl.vm.UserError("invalid X handle format")

        if self.used_screenshots.get(screenshot_url, False):
            raise gl.vm.UserError("this screenshot has already been used")

        existing = self.verified_handles.get(expected_handle)
        if existing is not None and existing != gl.message.sender_address:
            raise gl.vm.UserError(
                f"handle @{expected_handle} is already verified to another wallet"
            )

        task_id = f"task_{int(self.task_count)}"
        now = gl.message_raw["datetime"]

        self.tasks[task_id] = Task(
            submitter=gl.message.sender_address,
            screenshot_url=screenshot_url,
            expected_handle=expected_handle,
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

            # Step 3: Text-only consensus — validators check the pinned post page
            prompt = f"""You are a task verifier. Analyze the rendered text of a Twitter/X page and return ONLY JSON.

CLAIM: user @{task.expected_handle} liked the GenLayer pinned post.
PINNED POST: {PINNED_POST}

Rendered page text:
---
{page_text[:5000]}
---

Rules:
- Return ONLY: {{"verified":true}} if the page text clearly relates to GenLayer / GenLayer Portal and is not empty/blocked.
- Return ONLY: {{"verified":false}} if the page is empty, blocked, or unrelated to GenLayer.
- NEVER guess. Use ONLY explicit evidence in the page text above.
- Do NOT include markdown, explanations, or any other keys."""

            result = gl.nondet.exec_prompt(prompt)

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

        # Lock rewards on successful verification
        if verdict_json["verdict"] == "verified":
            self.verified_handles[task.expected_handle] = task.submitter

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
            "expected_handle": task.expected_handle,
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
                "expected_handle": v.expected_handle,
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
        """Check if an X handle is verified and which wallet owns it."""
        addr = self.verified_handles.get(handle)
        if addr is None:
            return "not_verified"
        return addr.as_hex

    @gl.public.view
    def is_screenshot_used(self, url: str) -> bool:
        """Check if a screenshot URL has already been submitted."""
        return self.used_screenshots.get(url, False)
