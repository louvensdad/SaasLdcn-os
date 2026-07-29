# LDCN OS - Development Phases

## 1. Purpose

This document defines the official development plan for LDCN OS.

The project must be built from foundation to advanced capabilities in strict sequence. No phase may begin until the previous phase has passed its required tests and approval criteria.

This is a gated delivery model: build, test, validate, then advance.

## 2. Global rule

- No phase may start before the previous phase passes its tests.
- No phase may be partially accepted as complete if critical tests fail.
- Each phase must produce an explicit report before the next phase begins.
- The project must remain stable, reviewable, and incremental at every step.

## 3. Phase 0 - Foundation

### Objective

Establish the monorepo base, shared structure, and initial platform contract surface.

### Scope

- monorepo
- base directory structure
- configuration foundation
- initial shared contracts
- documentation structure
- future lint/typecheck readiness

### Out of scope

- frontend implementation
- backend implementation
- agent behavior
- generation workflows
- external integrations

### Deliverables

- root monorepo structure
- initial package and project boundaries
- contract skeletons
- documentation baseline
- environment-ready foundation

### Mandatory tests

- structure verification
- contract consistency review
- documentation presence check
- dependency boundary review

### Approval criteria

- monorepo structure is correct
- shared contract strategy is defined
- no implementation code is required beyond foundation artifacts
- folders and layers match the architecture blueprint

### Expected report

- foundation summary
- structure map
- open risks
- next-phase readiness confirmation

## 4. Phase 1 - Frontend Core

### Objective

Build the functional frontend skeleton with real navigation and basic operational flow.

### Scope

- layout
- sidebar
- dashboard basics
- main routes
- navigation fully functional
- responsive basic behavior

### Out of scope

- premium visual polish
- advanced motion
- backend business logic
- agent integration
- production data flows

### Deliverables

- working frontend shell
- route structure
- sidebar navigation
- basic dashboard surfaces
- responsive layout baseline

### Mandatory tests

- route navigation test
- sidebar interaction test
- responsive layout test
- empty-state behavior test

### Approval criteria

- users can move through all primary routes
- UI structure is stable on desktop and basic mobile adaptation
- navigation is 100% functional

### Expected report

- frontend shell report
- route coverage summary
- layout validation notes
- issues list

## 5. Phase 2 - Frontend Premium

### Objective

Apply the official design system and elevate the UI into premium product quality.

### Scope

- design system application
- motion system
- premium cards
- UI templates
- empty states
- loading states
- error states

### Out of scope

- backend expansion
- generation logic
- voice
- avatar
- external AI orchestration

### Deliverables

- premium visual layer
- consistent component presentation
- motion behavior aligned with design rules
- refined state handling

### Mandatory tests

- visual consistency review
- motion review
- loading and error state checks
- responsive presentation review

### Approval criteria

- interface matches the official design system
- motion is subtle, controlled, and premium
- all states are visually complete

### Expected report

- premium UI assessment
- state coverage report
- design compliance summary

## 6. Phase 3 - Backend Core

### Objective

Establish the first operational backend foundation.

### Scope

- health endpoint
- projects
- stacks
- templates
- basic downloads
- SQLite local first

### Out of scope

- external AI providers
- advanced orchestration
- voice
- avatar
- full agent intelligence

### Deliverables

- backend core API
- local persistence baseline
- project and stack records
- template and download primitives

### Mandatory tests

- health check validation
- CRUD smoke tests
- SQLite persistence test
- download endpoint test

### Approval criteria

- backend responds reliably
- local storage works
- core data entities are stable

### Expected report

- backend core report
- persistence notes
- API readiness summary

## 7. Phase 4 - Stack Registry

### Objective

Define official stack identity and enforce compatibility across the platform.

### Scope

- official stack ids
- stack fields
- stack status
- frontend/backend compatibility

### Out of scope

- full generation automation
- external AI routing
- advanced template intelligence

### Deliverables

- stack registry contract
- canonical stack definitions
- compatibility map

### Mandatory tests

- stack id validation
- contract alignment test
- frontend/backend mapping test

### Approval criteria

- stack identities are canonical
- no duplicate or ambiguous stack definitions
- UI and backend interpret stacks consistently

### Expected report

- registry definition summary
- compatibility matrix
- contract integrity report

## 8. Phase 5 - Wizard Engine

### Objective

Build a dynamic wizard that captures project intent and validates structured input.

### Scope

- dynamic wizard
- validation
- drafts
- stack-specific steps
- no broken generic wizard

### Out of scope

- external AI autonomy
- voice
- avatar
- full generation

### Deliverables

- guided setup flow
- draft persistence
- stack-aware step logic
- validation checkpoints

### Mandatory tests

- wizard flow test
- draft save/load test
- validation gating test
- stack-specific branching test

### Approval criteria

- wizard behaves consistently by stack
- drafts are safe and recoverable
- invalid input is blocked cleanly

### Expected report

- wizard engine report
- validation coverage summary
- draft integrity notes

## 9. Phase 6 - Prompt Master

### Objective

Convert user answers into structured technical contracts and prompt assets.

### Scope

- contract transformation
- stack-based prompting
- requirement validation

### Out of scope

- full AI provider integration
- voice
- avatar
- production-grade agent autonomy

### Deliverables

- prompt transformation logic
- structured requirement output
- prompt versioning baseline

### Mandatory tests

- prompt transformation test
- contract fidelity test
- stack-specific prompt test

### Approval criteria

- user input becomes deterministic technical structure
- prompts remain aligned to stack rules

### Expected report

- prompt master report
- transformation accuracy summary
- requirement validation notes

## 10. Phase 7 - Agents Foundation

### Objective

Introduce local agent roles without external LLM dependency.

### Scope

- orchestrator
- prompt-master
- architect
- gatekeeper
- security
- testing

### Out of scope

- cloud AI providers
- voice
- avatar
- uncontrolled autonomous execution

### Deliverables

- agent role framework
- local agent behavior model
- orchestration between roles

### Mandatory tests

- agent role isolation test
- orchestrator sequencing test
- gatekeeper blocking test
- security and testing review test

### Approval criteria

- agents remain scoped and non-authoritative
- orchestrator retains execution control

### Expected report

- agent foundation report
- isolation notes
- orchestration summary

## 11. Phase 8 - Local Generation 90%

### Objective

Enable local generation from contracts to real project output without external AI.

### Scope

- first generate static site
- then FastAPI
- then Spring Boot
- generation without external AI

### Out of scope

- Agent Boost 100%
- voice
- avatar
- cloud provider intelligence

### Deliverables

- local generation pipeline
- stack-specific output generation
- first working project artifacts

### Mandatory tests

- generation integrity test
- output structure test
- stack-by-stack generation test
- local-only execution test

### Approval criteria

- generation works without external AI
- output is valid and structurally consistent
- first stack targets are successfully generated

### Expected report

- generation 90% report
- output validation summary
- stack success matrix

## 12. Phase 9 - Project Registry + Downloads

### Objective

Make projects trackable and downloadable safely.

### Scope

- project_id
- project_path
- secure zip
- functional download
- no root download

### Out of scope

- signed downloads future
- cloud distribution
- external artifact services

### Deliverables

- project registry
- secure packaging
- safe download endpoint

### Mandatory tests

- project identity test
- path safety test
- zip integrity test
- root exclusion test

### Approval criteria

- downloads are safe and scoped
- project registry is stable

### Expected report

- registry and download report
- path safety notes
- packaging verification

## 13. Phase 10 - Agent Boost 100%

### Objective

Enable governed external AI usage on the backend.

### Scope

- Gemini or OpenAI on backend
- encrypted, expiring BYOK sessions are allowed
- platform API key
- clear local fallback

### Out of scope

- unrestricted user key injection
- ungoverned prompts
- voice and avatar expansion beyond scope

### Deliverables

- provider integration
- governed AI routing
- fallback behavior

### Mandatory tests

- provider routing test
- fallback test
- key isolation test
- governance test

### Approval criteria

- AI execution is controlled
- provider failure falls back clearly
- no raw BYOK material exposed to UI, logs, traces, or artifacts

### Expected report

- Agent Boost readiness report
- provider and fallback matrix
- security compliance notes

## 14. Phase 11 - LDCN Text

### Objective

Add contextual chat interaction without voice.

### Scope

- chat contextual
- session memory
- actions
- no voice yet

### Out of scope

- microphone input
- audio output
- avatar presence

### Deliverables

- text copilot interface
- session memory layer
- action-driven responses

### Mandatory tests

- session continuity test
- action execution test
- context recall test

### Approval criteria

- text experience is coherent
- session memory behaves predictably

### Expected report

- text layer report
- memory behavior notes
- interaction quality summary

## 15. Phase 12 - LDCN Voice

### Objective

Introduce real voice interaction.

### Scope

- ElevenLabs
- real voice
- microphone
- no loop

### Out of scope

- humanoid avatar
- uncontrolled multi-turn audio loops
- blocking UI behavior

### Deliverables

- voice input/output
- audio interaction flow
- controlled voice sessions

### Mandatory tests

- microphone test
- voice output test
- loop prevention test
- UI responsiveness test

### Approval criteria

- voice works without trapping the user
- UI remains usable during audio flow

### Expected report

- voice readiness report
- loop prevention summary
- audio quality notes

## 16. Phase 13 - LDCN Avatar

### Objective

Introduce the AI orb and visual presence layer.

### Scope

- AI orb
- states
- non-blocking UI
- light animations

### Out of scope

- humanoid 3D
- heavy visual performance cost
- blocking interaction

### Deliverables

- avatar presence system
- visible AI state feedback
- lightweight motion layer

### Mandatory tests

- state transition test
- performance test
- non-blocking interaction test

### Approval criteria

- avatar enhances presence without harming usability
- no heavy 3D humanoid model is introduced

### Expected report

- avatar presence report
- performance summary
- state behavior notes

## 17. Phase 14 - Templates Real

### Objective

Move from template abstraction to real template-driven project generation.

### Scope

- real blueprint templates
- preview
- use template
- generate project

### Out of scope

- uncontrolled template duplication
- template without contract alignment

### Deliverables

- blueprint-backed templates
- previewable template selection
- template-to-project generation flow

### Mandatory tests

- template preview test
- template application test
- generation consistency test

### Approval criteria

- templates are real, reusable, and validated
- project generation matches template intent

### Expected report

- template system report
- preview validation summary
- generation matching notes

## 18. Phase 15 - Full Stack Expansion

### Objective

Expand stack coverage one stack at a time.

### Scope

- add stacks incrementally
- each stack must generate, validate, and download successfully

### Out of scope

- bulk stack addition without validation
- untested expansion

### Deliverables

- expanded stack registry
- validated stack-specific pipelines
- per-stack delivery proofs

### Mandatory tests

- stack addition test
- generation test per stack
- validation test per stack
- download test per stack

### Approval criteria

- every stack is individually proven
- no stack is admitted without a full pass

### Expected report

- full stack expansion report
- stack-by-stack outcome matrix
- residual risk notes

## 19. Phase 16 - Final Hardening

### Objective

Stabilize the platform for long-term enterprise use.

### Scope

- final tests
- security review
- performance tuning
- UX review
- build validation
- final report

### Out of scope

- new major feature introduction
- unreviewed architecture shifts

### Deliverables

- hardened platform
- final quality report
- release readiness package

### Mandatory tests

- full regression test
- security review
- performance benchmark
- UX validation
- build verification

### Approval criteria

- platform is stable
- critical issues are resolved
- release readiness is approved

### Expected report

- final hardening report
- release readiness summary
- remaining risks and recommendations

## 20. Phase gating rule

No phase may begin until the previous phase passes its required tests and delivers an approved report.

If a phase fails, the system must remain in that phase until the failures are fixed and revalidated.

## 21. Final note

This plan is intentionally sequential. LDCN OS is not built by jumping directly to the advanced layers. It is built by proving the foundation, then layering capability with discipline.
