# LDCN OS - Master Requirements Ledger

## Purpose

This document is the master traceability ledger for LDCN OS.

It records the product identity, mandatory requirements, architectural decisions, quality expectations, and non-negotiable rules that must not be forgotten during the rebuild.

This ledger is a source of truth for planning, implementation, validation, and governance.

## 1. Product Identity

- official name: LDCN OS
- vision: AI Engineering Operating System
- style: enterprise cinematic intelligence
- operational mode: Local Build 90%
- governed completion mode: Agent Boost 100%
- LDCN role: global copilot

## 2. Supported Languages

Mandatory languages:
- `pt-BR`
- `en-US`
- `es-ES`
- `fr-FR`

Rules:
- no hardcoded text outside the translation system
- LDCN must respond in the selected language
- generated projects must follow the selected language
- wizards, templates, errors, and docs must support locale
- `pt-BR` is the initial default locale

## 3. Architecture Rules

- architecture first
- contracts first
- no hidden mocks
- no direct filesystem access by agents
- no UI calling agents directly
- no circular dependencies
- no giant god services
- orchestrator controls execution

These rules define the structural discipline of the platform and apply to every phase.

## 4. Design Requirements

- Apple + Arc + Linear + Jarvis subtle
- dark premium
- cinematic but clean
- responsive first
- no bootstrap/admin generic UI
- no random cards
- motion system mandatory
- accessibility mandatory

The visual language must remain premium, minimal, and enterprise-safe.

## 5. Frontend Requirements

- clean routes
- sidebar always functional
- no overlay blocking the menu
- premium dashboard
- real templates with preview
- wizard per stack
- empty/loading/error states
- full i18n support

Frontend must feel polished, responsive, and structurally complete before advanced feature work.

## 6. Backend Requirements

- FastAPI core
- health endpoint
- project registry
- stack registry
- template registry
- generation registry
- secure download
- clear logs
- never return HTTP 200 with hidden error

Backend must fail explicitly when something is wrong and must expose stable, documented contracts.

## 7. Stack Registry Requirements

Initial stacks:
- `static_site`
- `fastapi`
- `spring_boot`
- `nestjs`
- `nextjs`

Future stacks:
- `express`
- `laravel`
- `dotnet`
- `react`
- `angular`
- `vue`
- `blazor`
- `automation`
- `ai_agents`

Each stack must have:
- id
- category
- fields
- own wizard
- allowed architecture
- gatekeeper
- generator
- template compatibility

Stack registry is canonical. No stack identity may exist only in local memory or duplicated ad hoc definitions.

## 8. Wizard Requirements

- each stack has its own flow
- static site cannot ask backend questions
- Spring Boot must capture architecture, DB, auth, messaging, Docker, observability
- FastAPI must capture async, DB, auth, workers, docs
- Next.js must capture rendering, SEO, auth, API, CMS
- wizard saves drafts
- wizard validates before moving forward

The wizard must never become generic in a way that breaks stack-specific precision.

## 9. Prompt Master Requirements

- transforms answers into a technical contract
- never skips a stage
- never invents architecture
- validates missing requirements
- generates a stack-specific prompt
- respects language
- respects Local Build / Agent Boost mode

Prompt Master is a governed transformation layer, not a creative shortcut.

## 10. Agent Requirements

Mandatory agents:
- `OrchestratorAgent`
- `PromptMasterAgent`
- `ArchitectAgent`
- `StackSpecialistAgent`
- `FrontendAgent`
- `BackendAgent`
- `SecurityAgent`
- `TestingAgent`
- `GatekeeperAgent`
- `DownloadAgent`
- `TemplateAgent`
- `UIUXAgent`
- `LDCNAgent`

Rules:
- each agent has input and output
- each agent has a boundary
- each agent has a test
- agents do not execute direct actions without the orchestrator

Agents are specialized, accountable, and orchestrated. They are not a bypass for system rules.

## 11. Generation Requirements

- Local Build 90% without external AI
- Agent Boost 100% with platform API key
- no BYOK
- API keys only in backend
- generation trace is mandatory
- validation report is mandatory
- README is mandatory
- docs are mandatory
- secure download is mandatory

Generation is not complete unless it is inspectable, traceable, and deliverable.

## 12. Template Requirements

- templates are not decoration
- each template has a real blueprint
- preview must be real
- `default_answers`
- `prompt_seed`
- valid `stack_id`
- using a template fills the wizard
- generating a template produces a real project

Templates are operational artifacts, not visual placeholders.

## 13. Download Requirements

- `project_path` must be inside `generated_projects`
- ZIP cannot download the LDCN OS root
- ZIP cannot contain secrets
- clear error if path does not exist
- download record is required

Download behavior must be safe, scoped, and auditable.

## 14. LDCN Requirements

- text first
- voice second
- avatar third
- contextual conversation
- session memory
- safe actions
- no loops
- ElevenLabs for voice
- avatar does not control voice
- avatar does not block UI
- wake word future

LDCN must feel intelligent, present, and governed without becoming noisy or invasive.

## 15. Security Requirements

- secrets only backend
- API key never frontend
- logs never show keys
- security gate blocks secrets in ZIP
- future validations: OWASP, dependency audit, Docker scan, LGPD

Security is a platform boundary, not a later hardening task.

## 16. Quality Gates

- each phase has a report
- each phase has a test
- no phase advances broken
- no component without contract
- no endpoint without clear error handling
- no stack without gatekeeper

Quality gates are mandatory and govern phase progression.

## 17. Traceability Table

| Requirement | Source | Phase | Status | Validation Method |
| --- | --- | --- | --- | --- |
| Product identity: LDCN OS as AI Engineering Operating System | Product Vision | 0 | planned | Architecture review and product approval |
| Supported locales: pt-BR, en-US, es-ES, fr-FR | Locale Contracts | 0 | validated | Contract review and locale coverage audit |
| No hardcoded text outside translation system | Locale Contracts | 1 | planned | Code review and UI text scan |
| Architecture first and contracts first | System Blueprint | 0 | validated | Architecture gate review |
| No hidden mocks | Architecture Boundaries | 0 | validated | Test and review policy check |
| No direct filesystem access by agents | Architecture Boundaries | 7 | planned | Agent gate and security review |
| No UI calling agents directly | Architecture Boundaries | 1 | planned | Frontend/backend boundary review |
| No circular dependencies | Architecture Boundaries | 0 | validated | Dependency graph analysis |
| No giant god services | Architecture Boundaries | 3 | planned | Service responsibility review |
| Orchestrator controls execution | System Blueprint | 7 | planned | Orchestration workflow tests |
| Premium dark cinematic UI | Design System | 2 | planned | Visual review and design compliance |
| Motion system mandatory | Design System | 2 | planned | Motion validation tests |
| Accessibility mandatory | Design System | 1 | planned | Accessibility audit |
| Clean routes and sidebar functional | Development Phases | 1 | planned | Navigation gate |
| Premium dashboard and real templates | Development Phases | 2 | planned | UX review and template tests |
| FastAPI core backend | Master Requirements Ledger | 3 | planned | Backend build and API tests |
| Health endpoint | Master Requirements Ledger | 3 | planned | Health check validation |
| Project registry | Master Requirements Ledger | 3 | planned | CRUD and persistence tests |
| Stack registry | Master Requirements Ledger | 4 | planned | Stack contract and compatibility tests |
| Wizard per stack | Master Requirements Ledger | 5 | planned | Wizard flow tests |
| Prompt Master transforms answers into contract | Master Requirements Ledger | 6 | planned | Prompt fidelity tests |
| Mandatory agents with boundaries and tests | Master Requirements Ledger | 7 | planned | Agent isolation and execution tests |
| Local Build 90% without external AI | Product Vision | 8 | planned | Local generation tests |
| Agent Boost 100% with platform API key | Product Vision | 10 | planned | Provider routing and fallback tests |
| Generation trace and validation report mandatory | Quality Gates | 8 | planned | Generation gate |
| Secure download and no root ZIP | Quality Gates | 9 | planned | Download gate |
| Text then voice then avatar | Product Vision | 11 | planned | Interaction phase validation |
| Secrets only backend | Security Requirements | 3 | planned | Security gate and secret scan |
| No HTTP 200 with hidden error | Backend Requirements | 3 | planned | API error contract tests |
| Each phase must report and pass gates | Quality Gates | all | planned | Phase validation reports |

## 18. Traceability Status Legend

- `planned`: requirement is defined but not yet implemented
- `in_progress`: requirement is currently being worked on
- `implemented`: requirement exists in the codebase or product layer
- `validated`: requirement has been tested and approved
- `blocked`: requirement cannot progress due to unresolved dependency or failure

## 19. Governance Rule

If a change conflicts with this ledger, the ledger wins until a formal decision updates it.

## 20. Final rule

Nothing important is allowed to exist only in memory.

If it matters to LDCN OS, it must be written here, traced to a source, assigned a phase, and validated through a clear method.
