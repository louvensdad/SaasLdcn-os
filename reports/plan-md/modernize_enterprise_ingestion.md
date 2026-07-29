# Modernize — Enterprise Ingestion Pipeline

Removed the fixed 5,000-file limit from Modernize and replaced ad-hoc extraction with a
professional, resource-bounded ingestion pipeline that scales to monorepos, microservices
and Enterprise systems with **hundreds of thousands of files**.

## What changed
`apps/api/app/services/codebase_ingest_service.py` rewritten:

1. **Streaming** — the archive is read member-by-member from a spooled temp file; each file
   is copied to disk in 64 KiB chunks. Nothing is buffered whole in memory, and ignored
   trees are never read. `testzip()` (which decompresses everything) was removed.
2. **Smart Ignore Engine** — runs before anything is read. Any path containing a junk
   directory segment is dropped, plus OS/editor cruft files:
   `node_modules, .git, dist, build, target, out, bin, obj, vendor, coverage, .cache,
   .next, .nuxt, .gradle, .idea, .vscode, __pycache__, venv, .venv, logs, temp, tmp,
   generated, .terraform, .mvn, .pytest_cache, .tox, .svn, .hg` · `.DS_Store, Thumbs.db`.
   These never reach the AI.
3. **Relevant-only index** — extended language/marker map: Java, Kotlin, Python, Go, Rust,
   TS/JS, React/Angular/Vue, C#, PHP, Ruby, Scala, Swift; Dockerfile, docker-compose,
   Terraform, Kubernetes (YAML), SQL, YAML, JSON, XML, OpenAPI, GraphQL, Protobuf, Markdown,
   and build markers (pom.xml, build.gradle, go.mod, package.json, …).
4. **Professional pre-analysis report** (`IngestStats`, surfaced on `ModernizeResponse` and
   `ModernizeProject`, rendered in the Modernize UI before analysis):
   files found · auto-ignored · analyzable · languages · frameworks · code size · lines of
   code · estimated complexity (+ a `truncated` flag).
5. **Deep analysis only sees relevant files** — `iter_files` (the AI's input) applies the
   same ignore + relevance + per-file rules.

## Resource-based limits (never a file count)
Configurable via env (`LDCN_MODERNIZE_*`):
- `max_analyzable_bytes` (default **2 GB**) — effective code size cap. When reached, extraction
  stops gracefully (`truncated=true`); the project still analyzes — it is **not** an error.
- `max_file_bytes` (default **5 MB**) — skips minified bundles / generated blobs.
- `max_upload_bytes` (default **4 GB**) — compressed archive cap, enforced while streaming the
  upload to disk (no in-memory buffering).
- `zip_bomb_ratio` (default **1000**) — refuses decompression bombs once real volume is seen.

The number of files in the ZIP is **never** a limit.

## Frameworks / complexity
Frameworks are detected from marker files anywhere in the tree (Spring Boot, React, Angular,
Vue, Next.js, Express, NestJS, Django/FastAPI/Flask, Docker, Docker Compose, Terraform,
Kubernetes, PostgreSQL/MySQL/MongoDB). Complexity is banded by analyzable LOC
(Baixa / Média / Alta / Muito alta (Enterprise)).

## Tests
`apps/api/tests/test_modernize_ingest_enterprise.py`:

**Fast suite (runs by default):**
- Smart Ignore covers every spec directory + OS cruft.
- Relevant-language index covers the Enterprise stack.
- `test_small_project_ignores_junk_without_count_limit` — **200 ignorable files**
  (node_modules / .git / build) + a small real app: proves the Smart Ignore Engine works and
  that there is **no fixed file-count limit**, without dominating the suite.
- No fixed file-count limit (8,000 relevant files ingest fine).
- Analyzable-byte cap truncates gracefully (no error).
- `test_ingest_report_surfaced_via_route` — the report is surfaced via the HTTP route.

**Enterprise proof (opt-in, `@pytest.mark.slow` + `@pytest.mark.enterprise`):**
- `test_enterprise_zip_over_100k_files_ignores_junk_and_analyzes` — a **>100,000-file archive**
  (100k node_modules + 3k .git + 3k build + a real app): ingests without error, ignores the
  junk, analyzes only the real code, and the AI input (`iter_files`) contains no
  node_modules/.git/target paths.

### Why the split
The 100k-file proof builds and walks ~106k zip entries (~50 s), which dominated every run. It
is marked `slow`/`enterprise` and **excluded from the default suite** (`pytest.ini`:
`addopts = -m "not slow"`), while the fast `test_small_project_…` keeps equivalent coverage in
the normal cycle. The Enterprise guarantee stays proven; day-to-day runs stay fast.

### Commands
```
pytest                # fast suite (excludes slow) — default dev cycle
pytest -m slow        # only the slow / Enterprise tests
pytest -m enterprise  # only the Enterprise-scale proof tests
```

## Verification
- Fast suite: **335 passed, 1 skipped, 1 deselected** in ~2m39s (was ~4m25s).
- `pytest -m slow` on the Enterprise test: **1 passed** (~52 s).
- `tsc` clean · `next build` ✓ (`/modernize`).
