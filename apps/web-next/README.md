# apps/web-next — the next LDCN OS frontend

The implementation of the approved design (`docs/NEXT-FRONTEND-*.md`, prototype in `design/next-frontend-prototype/`),
built **beside** `apps/web`, which stays untouched and keeps serving everything this app does not have yet
(migration Option 3: parallel app, route-group cutover).

**Status — all six waves built; 55 of 55 destinations.** Owner decision of 2026-09-16: this app replaces
`apps/web`, which is removed only once [the parity table](../../docs/NEXT-FRONTEND-CUTOVER-PARITY.md) reads `built`
on every row — it now does. §6 of that table says which of the three cutover conditions are met and what the current
app still gates that this one does not. What works here:

- **Sign in** (`/signin`): sign in, create an account with the policy version, Google/GitHub, and every failure
  explained without revealing whether an account exists. Session renewal from the httpOnly refresh cookie.
- **Provider return** (`/auth/callback`): the backend's four real reasons — `provider_denied`, `invalid_state`,
  `not_configured`, `exchange_failed` — each with a way forward.
- **Workspace choice** (`/select-workspace`): skipped when the account has one workspace.
- **Learn** (`/learn`, `/learn/:guideId`, `/learn/terms`): first steps read from what the platform recorded
  (project rooms, generation jobs, the `PreviewStarted` activity event), the next move from `GET /api/ldcn/briefing`,
  24 guides (13 adapted from the current help drawer, 11 new), and Terms & signals with the platform glossary.
- **Command Center** (`/`): the mission that is running, the decisions waiting on a person, the evidence of the last
  missions, the active provider with the 24-hour spend, and every project — each panel naming the endpoint it read.
- **Action Center** (`/inbox`): the decision queue, filterable by definition / missions / changes, beside the system
  decisions (`GET /api/system/presence/decisions`) and the notifications, with “mark all read”.
- **Activity** (`/inbox/activity`): the recorded events with their backend status, searchable, filterable by category
  and paged with the feed's own cursor.
- **Projects** (`/projects`): rooms joined with their missions, the room status kept beside the mission status.
- **Project cockpit** (`/p/:projectKey`): the Evidence Line of one project — definition, blueprint, review, mission,
  build, quality, certification, delivery — each station showing the word its own source returned, plus the kernel and
  the delivery decision as they are. `/p/:projectKey/missions` lists every attempt, with archive and delete.
- **Mission Command Center** (`/p/:projectKey/missions/:jobId`): the mission stream read frame by frame
  (`execution_event`, `generation_job`, `heartbeat`, `stream_timeout`), resumable with `Last-Event-ID`, with the
  pipeline as a selectable Evidence Line, the stage's checkpoints and artefacts, the live console, the decisions the
  mission raises (each naming the field that raises it) and its controls: pause, resume, retry a stage, diagnostic.
- **The shell**: rail, context bar with the decision count and the answering provider, command palette (`Ctrl K`),
  “Learn about this screen” (`?`), theme, density and the four locales.

- **Define** (`/p/:k/define/discovery|requirements|architecture|review`): the conversation that defines the work, the
  PromptMaster and its versions, the blueprint with the stack it locks, and the engineering review with its committee —
  each step doing what the backend actually accepts at that room status, and saying so when it does not.
- **Project memory** (`/p/:k/memory`): what this project taught the platform, with each memory's origin, and the
  advisory insight from your own past runs on the same stack.
- **Engineering and runtime** (`/p/:k/engineering`, `/changes`, `/verification`, `/runtime`, `/modernize`,
  `/governance`): change requests with their diffs, the test room, the live preview and its console, the runtime
  telemetry with the collectors that report `UNKNOWN`, and the sandbox policy exceptions.
- **Company and workforce** (`/p/:k/missions/:jobId/company`, `/workforce`, `/workforce/planner`): the virtual company
  of a mission, one agent's own record, the chief's dashboard, and the composer that plans a workforce.
- **Library** (`/library` + technology, templates & skills, knowledge, marketplace, certification, research): the
  catalogs the platform builds from, what the teams have learned, what people published, and — for research — an
  honest account of a surface the backend keeps in code with no HTTP route.
- **Studios** (`/studio/data`, `/studio/data/:sessionId`, `/studio/automations`): analysis sessions step by step with
  their datasets, agents and the personal data they flagged; and what runs on a schedule, with every run's real result.
- **Start** (`/new`): the one entry point — describe an idea (opens a project room) or run a guided mission, with an
  honest list of the kinds of work that still start in the current app.
- **Guided mission** (`/missions/:missionId`): the mission's steps, what is settled and what is still open, the
  deliverable job drafting each artifact, and the handoff to engineering.
- **Settings and platform** (`/settings/*`, `/platform/*`, `/pricing`, `/legal`): the AI keys and their real test
  result, the plan and its entitlements, the account with its sessions, the workspace and its members, the system
  status with per-collector truth, the decision traces, the runtime config and the roadmap.

## The gates

```bash
npm run verify       # lint, typecheck, audit, build, budget, e2e — everything below, in order
```

| Gate | What it is |
|---|---|
| `npm run typecheck` | Also the locale-parity gate: `Messages` is `Readonly<Record<MessageKey, string>>`, so a key missing from any of the four locales is a compile error. |
| `npm run audit:check` | What the compiler cannot see: dynamic key prefixes resolve, `{placeholders}` match across locales, no user-visible copy outside `t()`, every `familyFor` literal is in the status vocabulary, and every screen that reads the backend names its endpoint. |
| `npm run budget:check` | Two gzipped ceilings from the build's own output: the shell every route pays for (140 kB) and the worst single route (320 kB). |
| `npm run test:e2e` | 236 specs with every backend call mocked in the browser — no account is ever used. The sweep walks every route at 1440 and 390, in the dark theme, in pt-BR, signed out, **with every read failing**, and **with every list empty** (a real account on its first day): that last pass proves the design's own rule, that a screen whose reads all failed still renders, keeps its heading, and draws no proof it never received. It also fails on a console error, a sideways scroll, or an accessibility defect. |

`LDCN_SHOTS_DIR=/somewhere npm run test:e2e` writes the sweep's pictures there instead of `e2e/shots/`.

The command layer composes what the backend does not aggregate: no endpoint lists pending decisions (**G4**) and there
is no project aggregate (**G5**), so both are derived in `lib/work/` from room, mission and change-request statuses —
each card and row names the read it came from, and a read that fails is named on screen instead of silently missing.

## Running it

```bash
npm install
npm run dev          # http://localhost:3200
```

| Variable | Default | What it does |
|---|---|---|
| `LDCN_API_ORIGIN` | `http://127.0.0.1:8000` | Where `/api/*` is forwarded server-side, so the refresh cookie stays first-party |
| `NEXT_PUBLIC_LDCN_CURRENT_APP_URL` | `http://localhost:3000` | The current app, for the screens this one does not have yet |

The API is never called cross-origin: the browser only talks to this app, and `next.config.ts` proxies `/api/*`.

**OAuth while both apps run:** the backend redirects to its own `frontend_base_url` after a provider sign-in. Point
that at this app (port 3200) to finish a provider sign-in here, or expect to land in the current app.

## Checking it

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e     # after a build: Playwright with every backend call mocked in the browser
```

The e2e suite never signs in with a real account: `e2e/mock-api.ts` answers every `/api/**` request with fixture data
shaped like the backend's own schemas.

## What this app deliberately does not do

- It does not change `apps/web`, any backend contract, or any production route.
- It shows backend limitations instead of hiding them: two-factor is not asked for at sign-in (**G14**), there is no
  password reset (**G15**), registration reveals that an e-mail has an account (**G16**), the briefing has a next move
  for only four room statuses (**G17**), the glossary and mission registry are Portuguese-only (**G18**), token usage is
  recorded per account and period but never per mission (**G19**), `GET /api/workspaces` never says who owns a workspace
  you were added to (**G20**), and `stageStatuses` is keyed by the logical stage while a checkpoint's `stage` carries the
  granular status (**G21**), the backend serves a policy version but never the policy text (**G22**), and the work
  estimate's healthy minimum is a Portuguese sentence with no machine-readable band behind it (**G23**), and a
  change-request summary drops the `room_id` its full record carries, so the queue joins through the missions list to
  find the project a change belongs to (**G24**).
  Each one is written up in `docs/NEXT-FRONTEND-DESIGN-REVIEW.md` §9.
- Guides are written in Portuguese and English; Spanish and French show the English text and say so.

## Layout

```
app/            routes: (app) = inside the shell, everything else public
components/     signal glyphs, small UI pieces, shell (rail, context bar, palette, Learn panel)
lib/api/        one fetch path (timeouts, error envelope, single-flight refresh) and the endpoints this app calls
lib/i18n/       four locales; en-US defines the keys and the compiler enforces parity
lib/learn/      guides, interface vocabulary, signal meanings, first-steps derivation, saved preferences
lib/work/       decisions, projects and the reads the command layer composes
lib/status.ts   the backend status vocabulary mapped to the nine signal families
app/styles/     tokens.css and app.css copied from the prototype — edit the prototype first
```
