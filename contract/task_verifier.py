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
    tweet_url: str
    screenshot_url: str       # imgur/0x0.st link
    expected_handle: str
    action_type: str          # "like", "retweet"
    status: str               # "pending", "verified", "rejected"
    verdict_reason: str
    timestamp: str


class TaskVerifier(gl.Contract):
    tasks: TreeMap[str, Task]
    task_count: u256

    # ── Anti-abuse storage ──────────────────────────────────────
    used_screenshots: TreeMap[str, bool]   # screenshot_url → claimed
    verified_handles: TreeMap[str, Address]  # X handle → wallet that verified it
    used_urls: TreeMap[str, bool]          # tweet_url → claimed (for retweet/reply)

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
        # ── Validation ──────────────────────────────────────────

        if not tweet_url.startswith("https://x.com/") and not tweet_url.startswith(
            "https://twitter.com/"
        ):
            raise gl.vm.UserError("tweet_url must be from x.com or twitter.com")

        if action_type not in ("like", "retweet"):
            raise gl.vm.UserError("action_type must be: like or retweet")

        if action_type == "like" and tweet_url.rstrip("/") != PINNED_POST.rstrip("/"):
            raise gl.vm.UserError("like action must target the GenLayer pinned post")

        if action_type == "retweet" and tweet_url == PINNED_POST:
            raise gl.vm.UserError("retweet must use your own retweet URL, not the pinned post")

        import re
        handle_re = r'^[A-Za-z0-9_]{1,15}$'
        if not re.match(handle_re, expected_handle):
            raise gl.vm.UserError("invalid X handle format")

        # ── Anti-abuse checks ────────────────────────────────────

        if self.used_screenshots.get(screenshot_url, False):
            raise gl.vm.UserError("this screenshot has already been used")

        # Only check URL reuse for retweets — likes all share the same pinned post
        if action_type != "like" and self.used_urls.get(tweet_url, False):
            raise gl.vm.UserError("this tweet URL has already been used")

        existing = self.verified_handles.get(expected_handle)
        if existing is not None and existing != gl.message.sender_address:
            raise gl.vm.UserError(
                f"handle @{expected_handle} is already verified to another wallet"
            )

        # ── Create task ─────────────────────────────────────────

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

        # Reserve screenshot at submit time; URLs only for retweets
        self.used_screenshots[screenshot_url] = True
        if action_type != "like":
            self.used_urls[tweet_url] = True

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

            # Step 2: Fetch screenshot image from hosted URL
            img_resp = gl.nondet.web.get(task.screenshot_url)
            img_bytes = img_resp.body

            # Validate image is not empty/broken
            if not img_bytes or len(img_bytes) < 100:
                return json.dumps({
                    "verified": False,
                    "score": 0,
                    "evidence": ["Image fetch returned empty or truncated data"],
                    "reason": "Screenshot URL returned no valid image data"
                }, sort_keys=True)

            # Step 3: LLM vision cross-analysis
            prompt = f"""You are a screenshot verification agent with vision capability.

You are given ONE image. Analyze ONLY what you can actually see in this image.

CRITICAL INSTRUCTIONS — READ FIRST:
1. If the image does NOT show an X/Twitter interface at all, score = 0 and verified = false.
2. If the image shows a random photo, landscape, animal, food, meme, or anything that is NOT a tweet screenshot, score = 0 and verified = false.
3. If the image is a screenshot but shows a DIFFERENT tweet (not GenLayer), score = 0 and verified = false.
4. Only if the image actually shows an X/Twitter post about GenLayer, proceed to scoring below.
5. If you are unsure what the image shows, score = 0 and verified = false. NEVER guess.

Expected X handle: @{task.expected_handle}
Expected action: {task.action_type} (like or retweet)

=== LIVE TWEET PAGE TEXT (for reference only) ===
{page_text}

Now SCORE the image using this rubric ONLY if it is a valid X/Twitter screenshot:

Handle match (40 pts): Does the screenshot show @{task.expected_handle}? Must match exactly.
Tweet content match (40 pts): Does the tweet text match "GenLayer Portal" / "now live" / portal announcement?
Platform/UI match (20 pts): Is this clearly the X/Twitter mobile app or web interface?

Verification rules:
Score >= 70 → verified = true
Score < 70 → verified = false

Return JSON only:

{{
  "verified": true,
  "score": 0-100,
  "evidence": [
    "..."
  ],
  "reason": "..."
}}"""

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
        # Map new format back to old format for storage
        verdict = "verified" if raw_verdict.get("verified", False) else "rejected"
        verdict_json = {
            "verdict": verdict,
            "reason": raw_verdict.get("reason", "No reason provided"),
            "confidence": "high" if raw_verdict.get("score", 0) >= 80 else "medium" if raw_verdict.get("score", 0) >= 70 else "low",
            "score": raw_verdict.get("score", 0),
        }

        # Apply verdict
        task.status = verdict_json["verdict"]
        task.verdict_reason = verdict_json["reason"]
        self.tasks[task_id] = task

        # ── Lock rewards on successful verification ──────────────
        if verdict_json["verdict"] == "verified":
            # Map handle to the submitter's wallet so no one else can claim it
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
