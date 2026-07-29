from __future__ import annotations

from app.engines.architecture_consolidation_gate import architecture_consolidation_gate
from app.engines.architecture_manifest_planner import architecture_manifest_planner
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.services.file_protocol import EmittedFile


def _files(*paths: str) -> list[EmittedFile]:
    return [EmittedFile(path=p, content=f"// content of {p}\n") for p in paths]


def _python_plan():
    return architecture_manifest_planner.plan(ProjectSpec(
        raw_intent="API",
        suggested_stack=SuggestedStack(language="Python", framework="FastAPI"),
    ))


class TestPlannedManifestEnforcement:
    def test_matching_output_conforms_to_pre_generation_plan(self):
        _, manifest = architecture_consolidation_gate.consolidate(
            _files("backend/app/main.py", "backend/app/services/orders.py", "backend/requirements.txt"),
            expected=_python_plan(),
        )
        assert manifest.blocked is False
        assert manifest.conformsToPlan is True

    def test_competing_backend_root_is_a_hard_manifest_violation(self):
        _, manifest = architecture_consolidation_gate.consolidate(
            _files(
                "backend/app/main.py",
                "backend/app/services/orders.py",
                "backend/src/app/services/customers.py",
                "backend/requirements.txt",
            ),
            expected=_python_plan(),
        )
        assert manifest.blocked is True
        assert manifest.conformsToPlan is False
        assert "outside planned root" in manifest.blockReason
        assert any(item.kind == "manifest_violation" for item in manifest.conflictsResolved)

    def test_missing_planned_entrypoint_blocks_architecture(self):
        _, manifest = architecture_consolidation_gate.consolidate(
            _files("backend/app/server.py", "backend/requirements.txt"),
            expected=_python_plan(),
        )
        assert manifest.blocked is True
        assert "planned entrypoint" in manifest.blockReason

    def test_missing_planned_dependency_file_blocks_architecture(self):
        _, manifest = architecture_consolidation_gate.consolidate(
            _files("backend/app/main.py"),
            expected=_python_plan(),
        )
        assert manifest.blocked is True
        assert "dependency file" in manifest.blockReason


class TestDuplicateResolution:
    def test_picks_one_canonical_and_drops_the_rest(self):
        # Same module-relative path (services/auth_service.py) re-emitted
        # under 3 competing root prefixes -- a genuine same-file duplicate,
        # not the account/port.py-vs-admin/port.py false positive covered by
        # TestPerModuleRoleFilesAreNeverFalselyMergedAcrossModules below.
        files = _files(
            "backend/app/services/auth_service.py",
            "app/services/auth_service.py",
            "backend/src/app/services/auth_service.py",
        )
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 1
        assert consolidated[0].path == "backend/app/services/auth_service.py"
        assert manifest.canonicalFiles["services/auth_service.py"] == "backend/app/services/auth_service.py"
        assert len(manifest.rejectedAlternatives) == 2
        assert {r.path for r in manifest.rejectedAlternatives} == {
            "app/services/auth_service.py", "backend/src/app/services/auth_service.py",
        }

    def test_same_module_role_file_across_competing_roots_still_consolidates(self):
        # The SAME module's port.py re-emitted at 2 competing root prefixes
        # is still a true duplicate -- the fix for the false-positive below
        # must not blanket-exempt these filenames from ever deduplicating.
        files = _files("app/account/application/port.py", "backend/app/account/application/port.py")
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 1
        assert consolidated[0].path == "backend/app/account/application/port.py"

    def test_per_module_role_files_are_never_falsely_merged_across_modules(self):
        # Real bug found live (genjob_e5872a61637a47): account/port.py,
        # admin/port.py, auth/port.py, ... are 6 genuinely different files
        # that happen to share a filename by hexagonal-architecture
        # convention (one port.py per bounded-context module) -- the gate
        # previously treated them as "6 competing duplicates of the same
        # file" and discarded 5 of the 6 real modules' code.
        files = _files(
            "app/account/application/port.py",
            "app/admin/application/port.py",
            "app/auth/application/port.py",
            "app/execution_log/application/port.py",
            "app/instance/application/port.py",
            "app/macro/application/port.py",
        )
        consolidated, manifest = architecture_consolidation_gate.consolidate(files)
        assert len(consolidated) == 6
        assert manifest.rejectedAlternatives == []

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
