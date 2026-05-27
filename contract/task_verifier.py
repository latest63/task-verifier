# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json
from dataclasses import dataclass


@allow_storage
@dataclass
class Task:
    submitter: Address
    tweet_url: str
    screenshot_url: str       # imgur/0x0.st link
    expected_handle: str
    action_type: str          # "like", "retweet", "reply", "post"
    status: str               # "pending", "verified", "rejected"
    verdict_reason: str
    timestamp: str


class TaskVerifier(gl.Contract):
    tasks: TreeMap[str, Task]
    task_count: u256

    def __init__(self):
        self.task_count = u256(0)

    # ── Submit a new verification task ──────────────────────────

    @gl.public.write
    def submit_task(
        self,
        tweet_url: str,
        screenshot_url: str,
        expected_handle: str,
        action_type: str,
    ) -> str:
        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith(
            "https://twitter.com/"
        ):
            raise gl.vm.UserError("tweet_url must be from x.com or twitter.com")

        if action_type not in ("like", "retweet", "reply", "post"):
            raise gl.vm.UserError("action_type must be: like, retweet, reply, post")

        import re
        handle_re = r'^[A-Za-z0-9_]{1,15}$'
        if not re.match(handle_re, expected_handle):
            raise gl.vm.UserError("invalid X handle format")

        task_id = f"task_{int(self.task_count)}"
        now = gl.message_raw["datetime"]

        self.tasks[task_id] = Task(
            submitter=gl.message.sender_address,
            tweet_url=tweet_url,
            screenshot_url=screenshot_url,
            expected_handle=expected_handle,
            action_type=action_type,
            status="pending",
            verdict_reason="",
            timestamp=now,
        )
        self.task_count = u256(int(self.task_count) + 1)
        return task_id

    # ── Run verification (multi-LLM consensus) ─────────────────

    @gl.public.write
    def verify(self, task_id: str) -> typing.Any:
        task = self.tasks.get(task_id)
        if task is None:
            raise gl.vm.UserError("task not found")
        if task.status != "pending":
            raise gl.vm.UserError("task already resolved")

        # ── Non-deterministic block: web fetch + LLM vision ──
        def nondet_verify() -> str:
            # Step 1: Render tweet page as text (headless browser)
            page_text = gl.nondet.web.render(
                task.tweet_url,
                mode="text",
                wait_after_loaded="5s",
            )

            # Step 2: Fetch screenshot image from imgur/0x0.st
            img_resp = gl.nondet.web.get(task.screenshot_url)
            img_bytes = img_resp.body

            # Step 3: LLM vision cross-analysis
            prompt = f"""You are a task verification AI. You must determine if a screenshot is GENUINE or FAKED.

Expected X handle: @{task.expected_handle}
Expected action: {task.action_type} (like, retweet, reply, or post)

=== TWEET PAGE CONTENT (fetched live from URL) ===
{page_text}

Analyze the screenshot image I have attached alongside this text:

1. Does the screenshot show @{task.expected_handle} having {task.action_type}ed this specific tweet?
2. Does the tweet text/content in the screenshot match the real tweet from the URL above?
3. Are the engagement numbers (likes, retweets, replies) consistent between the screenshot and the live page?
4. Are there any visual signs of manipulation (misaligned text, inconsistent fonts, fake UI elements)?
5. Is the UI style consistent with the real X/Twitter interface?

Respond STRICTLY in this JSON format, no other text:
{{"verdict": "verified" or "rejected", "reason": "short explanation", "confidence": "high" or "medium" or "low"}}"""

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
        verdict_json = json.loads(gl.eq_principle.strict_eq(nondet_verify))

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
            "tweet_url": task.tweet_url,
            "screenshot_url": task.screenshot_url,
            "expected_handle": task.expected_handle,
            "action_type": task.action_type,
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
                "screenshot_url": v.screenshot_url,
                "expected_handle": v.expected_handle,
                "action_type": v.action_type,
                "status": v.status,
                "verdict_reason": v.verdict_reason,
                "timestamp": v.timestamp,
            }
            for k, v in self.tasks.items()
        }

    @gl.public.view
    def get_task_count(self) -> int:
        return int(self.task_count)
