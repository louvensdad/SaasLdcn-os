from __future__ import annotations

from app.services import import_graph_engine as ige


def test_extract_imports_handles_import_export_require_and_dynamic():
    content = (
        "import React from 'react';\n"
        "import './styles.css';\n"
        "export { x } from '../shared/x';\n"
        "const fs = require('fs');\n"
        "const mod = import('./lazy');\n"
    )
    specs = ige.extract_imports(content)
    assert specs == ["react", "./styles.css", "../shared/x", "fs", "./lazy"]


def test_app_root_and_manifest_app_root():
    assert ige.app_root("apps/web/src/index.ts") == "apps/web"
    assert ige.app_root("src/index.ts") is None
    assert ige.manifest_app_root("apps/web/package.json") == "apps/web"
    assert ige.manifest_app_root("package.json") is None


def test_undeclared_external_package_is_flagged():
    files = {"apps/web/src/index.ts": "import axios from 'axios';\nexport const x = 1;"}
    manifests = {"apps/web": {"dependencies": {}}}
    graph = ige.build_import_graph(files, manifests)
    conflicts = graph["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["specifier"] == "axios"
    assert conflicts[0]["status"] == "undeclared_external"


def test_declared_external_and_node_builtin_are_not_flagged():
    files = {"apps/web/src/index.ts": "import axios from 'axios';\nimport fs from 'fs';\nexport const x = 1;"}
    manifests = {"apps/web": {"dependencies": {"axios": "^1.0.0"}}}
    graph = ige.build_import_graph(files, manifests)
    assert graph["conflicts"] == []
    assert "axios" in graph["external_packages"]


def test_cross_stack_leakage_between_apps_is_flagged():
    files = {
        "apps/web/src/index.ts": "import { handler } from '../../api/src/handler';",
        "apps/api/src/handler.ts": "export const handler = () => {};",
    }
    graph = ige.build_import_graph(files, {})
    conflicts = graph["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["status"] == "cross_stack_leakage"
    assert conflicts[0]["source_file"] == "apps/web/src/index.ts"


def test_internal_relative_import_resolves_to_a_generated_file():
    files = {
        "apps/web/src/index.ts": "import { helper } from './helper';",
        "apps/web/src/helper.ts": "export const helper = () => {};",
    }
    graph = ige.build_import_graph(files, {})
    assert graph["conflicts"] == []
    edge = next(e for e in graph["edges"] if e["specifier"] == "./helper")
    assert edge["status"] == "resolved"
    assert edge["resolved"] == "apps/web/src/helper.ts"


def test_alias_import_resolves_under_src_of_the_source_app():
    files = {
        "apps/web/src/index.ts": "import { Button } from '@/components/Button';",
        "apps/web/src/components/Button.tsx": "export const Button = () => null;",
    }
    graph = ige.build_import_graph(files, {})
    assert graph["conflicts"] == []


def test_unresolved_internal_import_is_flagged():
    files = {"apps/web/src/index.ts": "import { missing } from './missing';"}
    graph = ige.build_import_graph(files, {})
    conflicts = graph["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["status"] == "unresolved_internal"


def test_non_source_extensions_and_non_js_files_are_ignored():
    assert ige.is_js_file("apps/web/src/index.ts") is True
    assert ige.is_js_file("apps/web/README.md") is False
    files = {"apps/web/src/index.ts": "import './styles.css';\nexport const x = 1;"}
    graph = ige.build_import_graph(files, {})
    assert graph["conflicts"] == []
