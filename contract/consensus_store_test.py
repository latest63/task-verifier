# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Test: stores prompt_comparative result in state so we can read it.
"""
from genlayer import *
import typing
import json


class ConsensusStoreTest(gl.Contract):
    results: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def test_hardcoded(self, run_id: str) -> dict:
        """prompt_comparative with hardcoded nd() — no exec_prompt"""
        def nd() -> str:
            return '{"test": "hello"}'

        raw = gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree.""",
        )
        self.results[run_id] = raw

        return {"run_id": run_id, "result": raw}

    @gl.public.write
    def test_simple_prompt(self, run_id: str) -> dict:
        """prompt_comparative with exec_prompt — simple math"""
        def nd() -> str:
            result = gl.nondet.exec_prompt("What is 2+2? Answer with ONLY a number. No words.")
            return result.strip()

        raw = gl.eq_principle.prompt_comparative(
            nd,
            principle="""All validators must agree on the number.""",
        )
        self.results[run_id] = raw

        return {"run_id": run_id, "result": raw}

    @gl.public.view
    def get_result(self, run_id: str) -> str:
        return self.results.get(run_id, "not found")
