# LDCN OS · Next UI V2 · Visualization system

How every drawing in V2 is grounded in the backend, and how the prototype draws it. Endpoints below were checked against the live OpenAPI (443 paths, 72 tags, 486 operations; dump in `design/ldcn-next-ui/assets/endpoints.json`).

## 1. Backend as product map

Endpoint → capability → entity → states → events → evidence → visualization.

| Domain | Endpoint | Capability | Entity | States | Events | Evidence | V2 visualization |
|---|---|---|---|---|---|---|---|
| Missions | `GET /api/meta-factory/jobs/{job_id}` | run a mission | GenerationJob | 32 statuses: QUEUED → … → READY, FAILED, PAUSED, NEEDS_USER_ACTION, STALLED | `GET …/jobs/{job_id}/events` | stageStatuses, checkpoints, buildStatus | Mission map, Mission Command Center |
| Definition | `GET /api/project-rooms/{room_id}` | turn an idea into requirements | ProjectRoom | DRAFT → PROMPT_READY → … → READY | messages, prompt versions | approved PromptMaster | Cockpit anatomy |
| Company | `GET /api/companies/by-job/{job_id}` | assemble the company | VirtualCompanyView, TeamPositionView | OPEN, RESTRUCTURING, CLOSED, FAILED; BOOTSTRAP / OBSERVE / ENFORCE | assignments | CertificationView (DERIVED / BOOTSTRAP / OVERRIDE) | Company graph, seat rings |
| Jobs | `GET /api/companies/by-job/{job_id}/jobs` | plan and run work | CompanyJobView | ASSIGNED, RUNNING, FINISHED, FAILED, REFUSED | executions | required_gates, reviewer_required, dependency_job_ids | Jobs layer, Job detail |
| Cognitive certification | `GET /api/workforce/cognitive-certifications` | prove agent competence | cognitive run | CERTIFIED, QUALIFIED, FAILED, BLOCKED, NOT_EXECUTED | run finished | 5 axes, depth = 100 × passed / total, threshold 90 | matrix, axis explorer, rings |
| Stacks | `GET /api/registry/stack-certifications` | certify stacks and compositions | stack certification, compositions | CERTIFIED, QUALIFIED, EXPERIMENTAL | suite run | build, startup order, health, cross-service, browser | Technology graph, compositions |
| Planning | `POST /api/workforce/plan` | compose a team before a mission | workforce plan | COMPOSED, COMPOSED_WITH_GAPS | — | coverage, gaps | Workforce Planner |
| Test Room | `GET /api/test-room/{project_id}/proof` | prove behaviour | TestRoomRun, Evidence | pending → resolving_profile → building → starting_app → health_checking → running_tests → collecting_evidence → finished | stage transitions | command, http_probe, process, test_run, browser_check, artifact | Test Room, evidence nodes |
| Runtime | `GET /api/live-preview/by-project/{project_id}` | run the app | LivePreviewSession + ArchitectureTopology | starting, running, failed, stopped, unsupported | console, logs | probes | Runtime Control Room |
| Kernel | `GET /api/meta-factory/{project_id}/engineering-kernel` | decide readiness | EngineeringKernelStatus | VERIFIED, PARTIALLY_VERIFIED, BLOCKED, NEEDS_HUMAN_REVIEW | computed_at | build, quality, completeness | verdict node |
| Delivery | `GET /api/meta-factory/{project_id}/delivery` | choose delivery | DeliveryDecision | blocked; zip_only, git_export, zip_and_git, ldcn_only | decision recorded | eligibility | Delivery Center, rose gate |
| Changes | `GET /api/change-requests/{change_request_id}/diff` | evolve a project | ChangeRequest | Draft → Analyzed → Planned → Approved → Applying → Validating → Accepted / Rejected / Rolled Back | apply, validate | diff, validation | Changes trace |
| Activity | `GET /api/activity-feed` | explain what happened | ActivityEvent | category, status | events | — | Activity episodes, signal strip |
| Staging | `GET /api/staging/{project_id}` | stage a deploy | StagingDeployment | stopped, running, failed, unsupported, can_rollback | deploy, rollback | health | Delivery staging panel |
| AI keys & usage | `GET /api/user-ai-keys`, `GET /api/meta-factory/jobs/usage` | bring your own key | user AI key, GenerationUsageSummary | READY, NOT_CONFIGURED | key test | usage per account and period | Settings, scoped cost metric |
| Library | `GET /api/team-memory/{team_id}/knowledge`, `GET /api/registry/languages` | reuse knowledge | lessons, registry | approved, queued | curation | — | Library universe |

### Gaps the drawings expose (no new contract is required for V2 to exist)

| Gap | What is missing | How V2 draws it |
|---|---|---|
| G3 | research sources and citations have no read endpoint | ghost panel in Research; dashed orb in Library |
| G4 | no pending-decisions aggregate | Action Center note: queue joined on the client |
| G5 | no project aggregate | Projects note: lines joined on the client |
| G6 | no per-service latency history or restart count | two empty, named charts in the Runtime Control Room |
| G11 | preview/terminal only for Python/FastAPI + Next.js/React | Workbench console note |
| G14 | 2FA is not asked at sign-in | Login note |
| G19 | usage is per account, never per mission or agent | Agent cost readout stays empty |
| G20 | owner of a shared workspace is not served | Workspace selector note |
| G24 | change-request summary lacks `room_id` | join through missions (documented) |

## 2. The fixture contract

`design/ldcn-next-ui/js/fixture.js` is `DESIGN_FIXTURE`: one coherent story whose fields mirror served fields (schema named in comments). Rules followed:

- if the backend has no field, the fixture has no value (the UI shows the gap);
- the change request is `Planned`, so its build and tests are `NOT_RUN` and drawn dashed;
- the replay steps are states the backend reports, in order, with their timestamps;
- the Reviewer seat is `QUALIFIED` under `BOOTSTRAP` while its role's latest cognitive run `FAILED` on JUDGMENT (71 < 90): the UI shows both records side by side instead of reconciling them.

## 3. Canvas engine (`js/graph.js`)

One small engine powers every drawing.

- **Nodes are HTML** (crisp text, real focusable buttons); **edges are one SVG layer** under them.
- Node model: `{ id, x, y, w, h, html, className, aria, anchor?, from?, inert? }`. `anchor` attaches edges to a sub-rectangle (the dial inside a captioned station); `from` makes a new node grow out of its parent; `inert` is for zones and labels.
- Edge model: `{ from, to, className, label?, arrow?, shape?: 'elbow' | 'drop', orient?: 'h' | 'v' | 'auto' }`. Curves are cubic; `elbow` draws the mark's down-and-across turn; `drop` hangs a chain below a node.
- Interaction: drag to pan; Ctrl/⌘ + wheel to zoom at the cursor; +, −, 0 and arrows on the keyboard; hover or focus shows a summary and (optionally) lights the path upstream and downstream; click selects and opens the inspector; double-click or Shift+Enter enters.
- API: `set(nodes, edges, { refit })`, `fit()`, `focus(id, { scale, cinematic })`, `highlight(id)`, `highlightSet(ids)`, `select(id)`, `zoomAt()`, `destroy()`.
- Motion: layout changes transition node transforms and the CSS `d` of edges (L3); new edges draw in; removed nodes fade; camera tweens use the motion tokens and are instant with reduced motion.
- Fit avoids a floating HUD: it tries reserving the HUD's height and its width and keeps the larger scale.
- Minimap and engineering coordinates are optional per canvas.

## 4. The drawings

### Mission map (signature) — `components.js → layoutMission`
- **Define** (Idea, Discovery, Requirements, Architecture) is a column with captions to the right.
- An **elbow** carries the work from Architecture to the **run**: Company, Jobs, Build, Test, Runtime, Delivery. Delivery is a gate (rotated rounded square); it is the only rose when a decision is waiting.
- **Slots** widen when a station opens its stages (`+`) or when the evidence layer is on, so the run reflows instead of overlapping.
- **Layers** (canvas mode): stages hang as a chain under Build and Test; the company job DAG sits below the run with levels computed from `dependency_job_ids` and the critical path in platinum; evidence hangs above the stations it proves, dashed until observed.
- Edge classes follow the family of the stations they join (proof, live, hand, blocked).
- Replay: families come from `snapshot(step)`; stations whose family changed get a one-time "settle" ring.

### Mission line — `missionLine()`
The ten stations compressed into one line per project (Command Center, Projects, workspaces, mobile, Action Center). Shapes follow the families: filled dot, arc ring, diamond (hand / delivery), square (fault), small dashed ring (idle). A gap after the fourth point marks the end of Define.

### Virtual Company
Teams are zones laid out as an org chart (Command → Architecture and Quality → Engineering). Seats are agent cards with a five-segment ring (green ≥ 90, red below, dot on critical axes). *Reporting lines* come from `reports_to_position_id`; *Hand-offs* come from job dependencies that cross agents, labelled with what is handed over. A certification filter dims the other seats.

### Runtime topology
Lanes client → frontend → service → data; nodes are `ServiceNode`s with port, state and the probe that proved them (check, HTTP or exit code, latency, time). Edges turn live while the target starts and proof when both ends are ready. Startup order and health evidence are listed beside the canvas. A *Failure state* view shows Backend refused, Frontend waiting on its dependency. Latency history and restarts are empty charts (G6).

### Evidence graph
Read right to left: **artifact → evidence → pillar → verdict**. Five pillars (Build, Tests, Runtime, Quality gate, Gatekeeper) each fold their evidence; the kernel read is one click on the verdict. Double-click on a test run opens the Test Room; on a probe, the runtime.

### Trace graph — `traceModel(requirement)`
Seven columns: Requirement → Job → Agent → Files → Build → Tests → Evidence. Observed traces (R-01…R-05) are solid; the planned change (R-07) is dashed with `NOT_RUN` build and tests. Hover lights everything a node touches.

### Certification explorer
Roles × five axes with a depth bar per cell (red below 90, outlined when the axis is critical); an axis explorer places every role on a 60–100 scale around the threshold; stacks grouped by language; compositions as five executed gates.

### Technology graph
Languages → frameworks and tools → **certified compositions** ← infrastructure. Hovering a composition lights its framework, infrastructure and language path; a verdict filter dims the rest.

### Architecture map
Actors → routes → API modules → tables, from the blueprint; planned nodes (from the change request) are dashed rose. *Trace a requirement* lights the routes, modules and tables that serve it.

### Library universe
The Library core with eight modules in orbit, sized by the count the registry serves; research sources are a dashed body with "?" (G3).
