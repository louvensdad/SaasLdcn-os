from __future__ import annotations

from app.engines.architecture_consolidation_gate import architecture_consolidation_gate
from app.services.file_protocol import EmittedFile


def _files(*paths: str) -> list[EmittedFile]:
    return [EmittedFile(path=p, content=f"// content of {p}\n") for p in paths]


class TestDuplicateResolution:
    def test_picks_one_canonical_and_drops_the_rest(self):
        files = _files(
            "backend/app/application/services/auth_service.py",
            "app/services/auth_service.py",
            "backend/src/app/services/auth_service.py",
        )
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 1
        assert consolidated[0].path == "backend/app/application/services/auth_service.py"
        assert manifest.canonicalFiles["auth_service.py"] == "backend/app/application/services/auth_service.py"
        assert len(manifest.rejectedAlternatives) == 2
        assert {r.path for r in manifest.rejectedAlternatives} == {
            "app/services/auth_service.py", "backend/src/app/services/auth_service.py",
        }

    def test_non_duplicated_files_are_untouched(self):
        files = _files("backend/app/main.py", "backend/app/core/config.py")
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 2
        assert manifest.rejectedAlternatives == []
        assert manifest.conflictsResolved == []

    def test_canonical_content_is_preserved_not_a_different_file(self):
        files = [
            EmittedFile(path="backend/app/models.py", content="class Canonical: pass\n"),
            EmittedFile(path="app/models.py", content="class Rejected: pass\n"),
        ]
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 1
        assert consolidated[0].content == "class Canonical: pass\n"

    def test_conventional_nextjs_basenames_are_never_flagged(self):
        files = _files(
            "src/app/[locale]/admin/users/page.tsx",
            "src/app/[locale]/auth/login/page.tsx",
            "src/app/[locale]/dashboard/page.tsx",
            "src/app/[locale]/layout.tsx",
            "src/app/layout.tsx",
        )
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == len(files)
        assert manifest.rejectedAlternatives == []

    def test_idempotent_running_twice_converges(self):
        files = _files(
            "backend/app/services/auth_service.py",
            "app/services/auth_service.py",
        )
        consolidated1, _ = architecture_consolidation_gate.consolidate(files)
        consolidated2, manifest2 = architecture_consolidation_gate.consolidate(consolidated1)
        assert [f.path for f in consolidated1] == [f.path for f in consolidated2]
        assert manifest2.rejectedAlternatives == []


class TestEntrypointDetection:
    def test_single_entrypoint_is_recorded(self):
        files = _files("backend/app/main.py", "backend/app/core/config.py")
        _, manifest = architecture_consolidation_gate.consolidate(files)
        assert manifest.entrypoint == "backend/app/main.py"
        assert manifest.blocked is False

    def test_duplicate_entrypoint_same_name_resolves_via_dedup(self):
        files = _files("backend/app/main.py", "app/main.py")
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert manifest.blocked is False
        assert manifest.entrypoint == "backend/app/main.py"

    def test_genuinely_different_entrypoints_block_instead_of_guessing(self):
        files = _files(
            "backend/app/main.py",
            "backend/app/CadastroUsuarioApplication.java",
        )
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        # Neither file is dropped -- blocking means "ask a human", not "delete
        # something that might be a legitimately different service".
        assert len(consolidated) == 2
        assert manifest.blocked is True
        assert "main.py" in manifest.blockReason
        assert "CadastroUsuarioApplication.java" in manifest.blockReason

    def test_no_recognized_entrypoint_does_not_block(self):
        # Must never brick a job just because our pattern list didn't
        # recognize this stack's entrypoint convention.
        files = _files("backend/app/handler.rb", "backend/app/routes.rb")
        _, manifest = architecture_consolidation_gate.consolidate(files)
        assert manifest.blocked is False
        assert manifest.entrypoint is None


class TestDependencyAndTestRoot:
    def test_dependency_file_detected(self):
        files = _files("backend/requirements.txt", "backend/app/main.py")
        _, manifest = architecture_consolidation_gate.consolidate(files)
        assert manifest.dependencyFile == "backend/requirements.txt"

    def test_test_root_detected(self):
        files = _files("backend/app/main.py", "backend/tests/test_main.py")
        _, manifest = architecture_consolidation_gate.consolidate(files)
        assert manifest.testRoot == "backend/tests"


class TestRealHistoricalJobRegression:
    def test_real_job_duplicate_set_consolidates_without_error(self):
        # Regression fixture: the exact duplicate-basename pairs/groups found
        # by RootCauseInvestigator against the real historical job
        # genjob_3be298b1d64b42 (a genuine 6-way competing-root fragmentation
        # of the core domain entity). The gate must resolve every group down
        # to exactly one canonical file, never raise, never drop everything.
        real_duplicate_groups = [
            ["backend/pom.xml", "pom.xml"],
            ["backend/src/main/java/com/app/auth/domain/model/Usuario.java",
             "backend/src/main/java/com/app/cadastro/domain/model/Usuario.java",
             "backend/src/main/java/com/app/domain/entity/Usuario.java",
             "backend/src/main/java/com/app/domain/model/Usuario.java",
             "src/main/java/com/app/domain/model/Usuario.java",
             "src/main/java/com/app/usuario/domain/entity/Usuario.java"],
            ["backend/src/main/java/com/app/application/port/input/RegistrarUsuarioUseCase.java",
             "backend/src/main/java/com/app/application/usecase/RegistrarUsuarioUseCase.java",
             "backend/src/main/java/com/app/auth/application/usecase/RegistrarUsuarioUseCase.java",
             "backend/src/main/java/com/app/cadastro/application/usecase/RegistrarUsuarioUseCase.java",
             "src/main/java/com/app/application/usecase/RegistrarUsuarioUseCase.java"],
        ]
        all_paths = [p for group in real_duplicate_groups for p in group]
        files = _files(*all_paths)
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)

        assert len(consolidated) == len(real_duplicate_groups), "exactly one survivor per duplicate group"
        assert len(manifest.conflictsResolved) == len(real_duplicate_groups)
        for group in real_duplicate_groups:
            survivors = [f for f in consolidated if f.path in group]
            assert len(survivors) == 1, f"expected exactly one survivor for {group}, got {[f.path for f in survivors]}"
