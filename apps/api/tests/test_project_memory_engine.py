from __future__ import annotations

from types import SimpleNamespace

from app.engines.project_memory_engine import ProjectMemory, project_memory_engine


def _spec(language="Java", framework="Spring Boot"):
    return SimpleNamespace(suggested_stack=SimpleNamespace(language=language, framework=framework))


def test_build_initial_captures_architecture_and_decisions_from_spec_and_blueprint():
    blueprint = {
        "decisions": [
            {"area": "database", "choice": "postgres", "justification": "ACID + relational domain"},
            {"area": "frontend", "choice": "react ts", "justification": "team familiarity"},
            {"area": "auth", "choice": "jwt"},
        ]
    }
    memory = project_memory_engine.build_initial(_spec(), blueprint)

    assert memory.architecture == {"backend": "Java Spring Boot", "database": "postgres", "frontend": "react ts"}
    assert {"decision": "database: postgres", "reason": "ACID + relational domain"} in memory.decisions
    assert {"decision": "auth: jwt", "reason": ""} in memory.decisions
    assert memory.known_problems == []
    assert memory.validated_files == []
    assert memory.updated_at


def test_build_initial_tolerates_missing_blueprint():
    memory = project_memory_engine.build_initial(_spec(), None)
    assert memory.architecture["database"] == ""
    assert memory.decisions == []


def test_record_known_problem_dedupes_and_stamps_updated_at():
    memory = ProjectMemory()
    project_memory_engine.record_known_problem(memory, "backend", "OpenAPI ausente")
    project_memory_engine.record_known_problem(memory, "backend", "OpenAPI ausente")  # duplicate, ignored

    assert memory.known_problems == ["[backend] OpenAPI ausente"]


def test_record_validated_files_dedupes_and_only_stamps_on_change():
    memory = ProjectMemory()
    project_memory_engine.record_validated_files(memory, ["a.ts", "b.ts"])
    first_stamp = memory.updated_at
    project_memory_engine.record_validated_files(memory, ["a.ts"])  # no new file

    assert memory.validated_files == ["a.ts", "b.ts"]
    assert memory.updated_at == first_stamp


def test_prompt_block_includes_architecture_decisions_and_problems():
    memory = ProjectMemory(
        architecture={"backend": "Java Spring Boot", "database": "postgres", "frontend": ""},
        decisions=[{"decision": "database: postgres", "reason": "ACID"}],
        known_problems=["[backend] OpenAPI ausente"],
        validated_files=["openapi.yaml"],
    )
    block = project_memory_engine.prompt_block(memory)

    assert "<project_memory>" in block and "</project_memory>" in block
    assert "backend: Java Spring Boot" in block
    assert "database: postgres" in block
    assert "Decisao: database: postgres (ACID)" in block
    assert "OpenAPI ausente" in block
    assert "openapi.yaml" in block


def test_prompt_block_bounds_decisions_and_known_problems_to_the_most_recent():
    memory = ProjectMemory(
        decisions=[{"decision": f"area{i}: choice{i}", "reason": ""} for i in range(20)],
        known_problems=[f"problem-{i}" for i in range(20)],
        validated_files=[f"file-{i}.ts" for i in range(50)],
    )
    block = project_memory_engine.prompt_block(memory)

    assert "area0: choice0" not in block  # oldest decision dropped, only the most recent survive
    assert "area19: choice19" in block
    assert "problem-0" not in block
    assert "problem-19" in block
    assert "file-0.ts" not in block
    assert "file-49.ts" in block


def test_project_memory_round_trips_through_dict():
    memory = ProjectMemory(
        architecture={"backend": "Java"}, decisions=[{"decision": "x", "reason": "y"}],
        known_problems=["p"], validated_files=["f"], updated_at="2026-07-14T00:00:00+00:00",
    )
    restored = ProjectMemory.from_dict(memory.as_dict())
    assert restored == memory


def test_from_dict_tolerates_none_and_missing_keys():
    memory = ProjectMemory.from_dict(None)
    assert memory.architecture == {}
    assert memory.decisions == []
    assert memory.known_problems == []
    assert memory.validated_files == []
