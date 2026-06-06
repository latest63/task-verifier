# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Minimal test: just call web.get on a simple URL and see if it works on Bradbury.
"""
from genlayer import *
import json

class WebTest(gl.Contract):
    last_result: str
    last_error: str

    def __init__(self):
        self.last_result = ""
        self.last_error = ""

    @gl.public.write
    def test_web_get(self) -> str:
        def nd() -> str:
            try:
                resp = gl.nondet.web.get("https://example.com")
                body = resp.body
                if isinstance(body, bytes):
                    text = body.decode(errors="replace")[:200]
                else:
                    text = str(body)[:200]
                return json.dumps({"ok": True, "text": text}, sort_keys=True)
            except Exception as e:
                return json.dumps({"ok": False, "error": str(e)}, sort_keys=True)

        raw = json.loads(gl.eq_principle.strict_eq(nd))
        self.last_result = json.dumps(raw)
        return self.last_result

    @gl.public.view
    def get_result(self) -> str:
        return self.last_result

    @gl.public.view
    def get_error(self) -> str:
        return self.last_error
