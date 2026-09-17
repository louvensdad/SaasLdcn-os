# LDCN OS · Next UI V2 · Screen map

All routes are hash routes of the prototype (`design/ldcn-next-ui/index.html#…`). Product screens are in English (product default locale); proposal chapters are in Portuguese. Every screen uses the single `DESIGN_FIXTURE` story: **Inventory Lite · Mission #3F-C**.

## 1. Navigation architecture

```
Rail (global places)                     Project scope (inside a project)
├─ Command Center     #/app/command      Cockpit · Mission · Company · Workbench · Runtime · Evidence · Delivery
├─ Projects           #/app/projects
├─ Action Center (◆3) #/app/actions      Context bar: workspace · breadcrumb · Ctrl K · ◆ decisions · provider · dev · motion · theme
├─ Activity           #/app/activity     Inspector: opens on click in any canvas or list, never navigates away
├─ Virtual Company    #/app/company      Signal strip: latest real events
├─ Engineering        #/app/workbench    Replay dock: mission, canvas, runtime
├─ Runtime            #/app/runtime
├─ Certification      #/app/certification
├─ Library            #/app/library
└─ Settings           #/app/settings     Mobile tabs: Home · Mission · Actions · Activity · Account
```

**Depth model.** Command Center → Project (Cockpit) → Mission → {Company → Agent / Job, Workbench → Changes / Build / Tests, Runtime, Evidence → Tests} → Action Center → Delivery. A double-click on any canvas node goes one level deeper; the breadcrumb and the scope bar go back up.

**Command palette (`Ctrl K`).** Context-aware commands first (inside a mission: *View runtime, Why is it READY?, Open the company of this mission, Choose delivery*; elsewhere: *Create project, Open mission, Approve decision, Search evidence, Plan a team*), then grouped search over Projects, Missions, Jobs, Agents, Artifacts, Requirements, Evidence and Technologies.

## 2. The 30 mockups (+ architecture map)

| # | Screen | Route | Job of the screen | Backend reads | Signature interaction |
|---|---|---|---|---|---|
| 01 | Login | `#/login` | sign in; state what LDCN does | auth | story illustration draws once; G14 note |
| 02 | Workspace selector | `#/workspaces` | choose where to work | `GET /api/workspaces` | cards with mission lines, waiting count; G20 note |
| 03 | Command Center | `#/app/command` | "does anything need me, where is everything?" | rooms, jobs, delivery, activity, live preview, usage | mission lines per project; waiting queue; scoped proof |
| 04 | Projects | `#/app/projects` | dense list with hierarchy | rooms + jobs (client-side join, G5) | filter chips; expandable rows with missions, runtime, delivery |
| 05 | Project Cockpit | `#/app/project` | the project as an anatomy | room, blueprint, files, kernel, delivery | intent → requirements → architecture → code → proof → delivery; architecture mini-map traced on hover |
| 06 | Mission Command Center | `#/app/mission` | one mission, end to end | `GET /api/meta-factory/jobs/{job_id}`, company, test room, kernel, delivery | mission map (hover · click · double-click · expand stages); replay |
| 07 | Mission Canvas | `#/app/mission-canvas` | explore the mission spatially | same + company jobs + evidence | layers: stages, jobs & critical path, evidence; minimap |
| 08 | Action Center | `#/app/actions[/:id]` | human intervention console | delivery, change requests, rooms (G4) | queue · context · consequences; confirm; decision submitted |
| 09 | Activity | `#/app/activity` | what happened, by meaning | `GET /api/activity-feed` | day map with lanes and episodes; grouped timeline |
| 10 | Virtual Company | `#/app/company` | who is on this mission | `GET /api/companies/by-job/{job_id}` | teams as zones; reporting lines ↔ hand-offs; certification filter |
| 11 | Workforce Planner | `#/app/planner` | plan a team for a stack | `POST /api/workforce/plan` | coverage bars vs required depth; gap refused, not staffed |
| 12 | Agent detail | `#/app/agent` | why this agent holds the seat | agent instance, cognitive certification, certification record | five axes vs threshold 90; runs bar; cost gap G19 |
| 13 | Job detail | `#/app/job` | what one job did | company jobs, executions, events | dependency neighbourhood; repair episode |
| 14 | Engineering Workbench | `#/app/workbench` | why this code exists and what proves it | files, file-content, requirements, tests | requirement → jobs → agents → files → build → tests → evidence |
| 15 | Diff / Changes | `#/app/changes` | review a planned change | `GET /api/change-requests/{id}/diff` | lifecycle; trace graph per requirement (solid observed / dashed planned); diff |
| 16 | Build Room | `#/app/build` | generation, validation, repair | job stage statuses, build commands | stage pipeline with repair loop; duration bars |
| 17 | Test Room | `#/app/tests` | proof of behaviour | `GET /api/test-room/{project_id}/proof` | run stages at real timestamps; test squares; E2E storyboard |
| 18 | Runtime Control Room | `#/app/runtime` | is it running, and why do we believe it | live preview, topology, probes | topology lanes; startup order; failure state; G6 empty charts |
| 19 | Evidence Graph | `#/app/evidence` | why is it READY? | engineering kernel, test room proof | verdict ← pillars ← evidence ← artifacts; expand pillars |
| 20 | Certification Center | `#/app/certification` | what LDCN can build and who can build it | stack certifications, cognitive certifications, compositions | roles × axes matrix; axis explorer |
| 21 | Library | `#/app/library` | knowledge universe | registry, team memory, templates, marketplace | orbit of modules sized by count; research drawn as gap |
| 22 | Technology Graph | `#/app/technology` | languages → frameworks → compositions ← infrastructure | `GET /api/registry/*` | verdict filter; composition paths light up |
| 23 | Research Intelligence | `#/app/research` | where agents may look, what they found | dependency findings (G3 for sources) | trust ladder; dependency board; ghost panel |
| 24 | Delivery Center | `#/app/delivery` | the last gate is the owner's | `GET/POST /api/meta-factory/{project_id}/delivery`, staging | eligibility gates; modes; gate passes on record |
| 25 | Settings & providers | `#/app/settings` | workspace, members, keys, usage, appearance | workspaces, members, user AI keys, usage | keys never shown; theme/motion/developer toggles |
| 26 | Empty states | `#/app/empty` | eight invitations to act | — | illustrations + one action each |
| 27 | Error & loading states | `#/app/errors` | say what failed and what fixes it | — | unreachable, mission failed, unhealthy, 403, provider 401, stale, 404, static skeleton |
| 28 | Mobile Home | `#/app/m-command` | "does anything need me?" | as 03 | decisions first; project lines; sheets |
| 29 | Mobile Mission | `#/app/m-mission` | the path as a column | as 06 | tap station → sheet |
| 30 | Mobile Actions | `#/app/m-actions` | decide with the thumb | as 08 | decision sheet with thumb-zone buttons |
| — | Architecture Map | `#/app/architecture` | routes → modules → tables | blueprint / architecture topology | trace a requirement across layers |

## 3. Proposal chapters

| Route | Content |
|---|---|
| `#/` | thesis, live mission map with replay, 17-step presentation, truth rules, six swaps |
| `#/brand`, `#/brand/:section` | Signal Path construction, sizes, five directions, identity (palette, states, type, glyphs, misuse) |
| `#/directions` | A Mission Control · B Calm Engineering · C Engineering OS · D LDCN Signature |
| `#/system` | primitives, depth layers, background identity, components, illustrations |
| `#/motion` | levels, microinteractions, signal decay, six transitions, what never moves |
| `#/map` | backend → visualization map, interactive screen map, complete flow, keep/merge/refactor, gaps |
| `#/mobile` | the three phones side by side |
| `#/compare` | before (apps/web-next) × V2, six pairs |
| `#/approval` | status, checklist of eleven areas, summary to paste in the chat |

## 4. Complete flow

Login → Workspace → Command Center → Project Cockpit → Mission → (Company · Workbench · Runtime · Evidence) → Action Center → **Delivery (rose gate)** → READY delivered.

## 5. From `apps/web-next` to V2

| Today | In V2 | Decision |
|---|---|---|
| `/` | Command Center | refactor: cards → mission lines + decision queue |
| `/projects` | Projects | refactor: list → expandable rows with a mission line |
| `/inbox`, `/platform/decisions` | Action Center | ~~merge: two queues become one console~~ — corrected during implementation: `/platform/decisions` lists model-routing decision traces, not decisions a person takes, so the two stay apart (see `NEXT-UI-V2-IMPLEMENTATION.md`) |
| `/inbox/activity` | Activity | refactor: table → episodes + day map |
| `/workforce` | Virtual Company · Certification Center | refactor: seat table → graph; certifications → matrix |
| `/workforce/planner` | Workforce Planner | refactor: form → coverage and gaps |
| `/library/*` | Library · Technology · Research · Certification | refactor: tabs → navigable universe |
| `/p/[key]` | Project Cockpit | refactor: summary → anatomy |
| `/p/[key]/define/*` | Cockpit · Architecture Map | merge |
| `/p/[key]/missions/[jobId]` | Mission Command Center | refactor: stepper and lists → map |
| `/p/[key]/missions/[jobId]/company/**` | Company · Agent · Job | refactor: detail pages → graph + inspector |
| `/p/[key]/engineering/**` | Workbench · Changes · Build · Tests | refactor: requirement-to-proof trace |
| `/p/[key]/runtime` | Runtime Control Room | refactor: fields and console → topology |
| `/p/[key]/evidence` | Evidence Graph | refactor: stepper → verdict graph |
| `/p/[key]/delivery` | Delivery Center | refactor: options → gate with eligibility |
| `/p/[key]/governance`, `/memory`, `/modernize` | same screens | keep (new chrome, flows unchanged in this proposal) |
| `/studio/**` | Studio | keep (outside V2's visual scope) |
| `/settings/**` | Settings | keep, as sections with side navigation |
| `/learn/**` | palette help + inspector | merge: help where the question arises |
| `/signin`, `/select-workspace` | Login · Workspaces | refactor |
| `/learn/terms` | glossary inside the palette | remove as a standalone page (content kept) |

No capability is dropped.
