# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Minimal test — just prompt_comparative on a simple string.
Does the consensus principle itself even work on Bradbury?
"""

from genlayer import *
import typing
import json


class SimpleConsensusTest(gl.Contract):
    def __init__(self):
        pass

    @gl.public.write
    def test_prompt(self) -> dict:
        """Ask LLM: what's 2+2? Very simple, should agree."""
        def nd() -> str:
            result = gl.nondet.exec_prompt("What is 2+2? Answer with ONLY a number.")
            return result.strip()

        raw = gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the number.""",
        )

        return {"answer": raw.strip()}

    @gl.public.write
    def test_hardcoded(self) -> dict:
        """No exec_prompt, just return a hardcoded string from nd."""
        def nd() -> str:
            return '{"test": "hello"}'

        raw = gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree.""",
        )

        return {"result": raw}

    @gl.public.view
    def ping(self) -> str:
        return "ok"
