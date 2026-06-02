# LDCN OS - Architecture Boundaries

## 1. Purpose

This document defines the official architectural separation rules for LDCN OS.

The goal is to preserve a system that is modular, secure, testable, observable, and safe to evolve. These boundaries are mandatory design rules, not implementation suggestions.

## 2. Layer boundaries

### 2.1 Frontend

The frontend layer may access:
- public backend APIs
- shared contracts
- presentation-safe package utilities
- local UI state

The frontend layer may not access:
- databases directly
- filesystem resources directly
- backend internals
- engine internals
- agents directly
- secrets

### 2.2 Backend

The backend layer may access:
- services
- engines through governed interfaces
- shared contracts
- persistence layers
- infrastructure adapters
- secret storage

The backend layer may not access:
- browser-only UI state
- avatar presentation concerns as business logic
- raw frontend runtime state

### 2.3 Services

Services may access:
- contracts
- backend-controlled data sources
- engines through orchestrated entry points
- queues and events when authorized

Services may not access:
- UI components
- direct agent execution
- uncontrolled infrastructure internals
- raw user browser state

### 2.4 Engines

Engines may access:
- shared contracts
- validated input data
- governed service interfaces
- internal deterministic state

Engines may not access:
- frontend DOM or UI state
- direct database drivers unless explicitly mediated by backend policy
- agents as a bypass path
- unrelated engines without orchestration approval

### 2.5 Agents

Agents may access:
- validated context
- contracts
- orchestration instructions
- scoped tool results

Agents may not access:
- raw filesystem by default
- direct database mutation
- secret material
- UI internals
- service internals without control boundaries

### 2.6 Infrastructure

Infrastructure may access:
- deployment assets
- runtime configuration
- operational telemetry
- container and environment primitives

Infrastructure may not access:
- product logic
- business rules
- agent reasoning
- UI implementation details

### 2.7 Packages

Packages may expose:
- shared UI primitives
- shared types and contracts
- config helpers
- validation utilities
- logging utilities
- prompts and event definitions

Packages may not contain:
- service ownership
- engine orchestration
- agent autonomy
- environment-specific secrets

## 3. Forbidden access rules

These rules are explicit and non-negotiable.

- frontend does not access the database
- frontend does not access the filesystem directly
- agents do not access the filesystem directly
- agents do not mutate projects directly
- wizard-engine does not access voice-engine directly
- avatar layer does not control orchestration
- UI does not call agents directly
- services do not bypass contracts
- engines do not reach into UI internals
- packages do not become hidden service containers
- secrets are never exposed to frontend
- no module may rely on undeclared side effects

## 4. Communication rules

### 4.1 REST

REST is the primary synchronous communication mechanism for:
- frontend to backend
- backend to services
- external integrations

REST must remain contract-driven, versioned, and predictable.

### 4.2 Events

Events are used for:
- lifecycle transitions
- generation milestones
- orchestration checkpoints
- auditability
- future asynchronous expansion

Events must be explicit, named, and traceable.

### 4.3 Internal contracts

Internal contracts define all structured communication between layers.

They are required for:
- request and response shapes
- state transitions
- generation inputs and outputs
- project and stack definitions

### 4.4 Queues future

Queue-based transport is reserved for future scaling needs.

When introduced, queues must:
- preserve ordering where required
- keep message schemas versioned
- remain observable
- not replace contract discipline

### 4.5 Orchestrator central

The orchestrator is the central coordination point for multi-step workflows.

It must:
- own execution sequencing
- dispatch specialized work
- merge results
- enforce progression rules
- prevent uncontrolled cross-layer jumps

No layer may silently replace the orchestrator in a multi-step flow.

## 5. Shared contracts

All modules must use shared contracts as the canonical source of truth.

Rules:
- all important shapes must live in shared contracts
- duplicate schemas must be avoided
- stack ids must never be hardcoded in multiple places
- wizard, project, generation, and stack data must share the same vocabulary
- contract changes must be intentional and traceable

This prevents drift between frontend, backend, engines, agents, and services.

## 6. State management rules

### 6.1 Frontend state

Frontend state is ephemeral and interaction-oriented.

It may store:
- form progress
- view state
- transient selection state
- local UI loading state

It may not store:
- authoritative project truth
- secret data
- durable generation records

### 6.2 Backend state

Backend state is authoritative for platform operations.

It may store:
- projects
- generation records
- policies
- audit events
- orchestration metadata

It must remain the source of truth for persisted operational data.

### 6.3 Orchestration state

Orchestration state tracks progression across workflows.

It must capture:
- stage
- status
- current actor
- blocking conditions
- retry or fallback decisions

It must be deterministic and inspectable.

### 6.4 Conversation state

Conversation state tracks user-facing AI interaction.

It may contain:
- message history
- summarized context
- active intent
- scoped memory references

It may not become an unbounded hidden store of business truth.

### 6.5 Generation state

Generation state tracks creation progress and output readiness.

It must record:
- input contract version
- generation stage
- validation results
- packaging status
- delivery status

## 7. Agent isolation

Agents are reasoning units, not direct system owners.

Rules:
- agents do not modify projects directly
- agents return structured responses against contracts
- agents do not bypass the orchestrator
- agents do not write persistence independently
- agents may recommend, validate, or reject based on rules
- the orchestrator controls execution order and state changes

This keeps intelligence useful without allowing uncontrolled authority.

## 8. Security boundaries

Security is a first-class architectural boundary.

Rules:
- secrets only backend
- no frontend API exposure of secrets
- no secret-bearing payloads in UI state
- all sensitive actions must be authenticated and authorized
- service access must be scoped by role and purpose
- generation sandboxing is a future requirement for risky execution paths
- signed downloads are a future requirement for artifact delivery integrity

Security must be enforced by architecture, not by convention alone.

## 9. Runtime separation

The runtime must remain split into clear execution zones.

### 9.1 UI thread

Handles:
- rendering
- input handling
- client interaction

Must not:
- perform orchestration work
- execute agent logic
- access secrets

### 9.2 Orchestration runtime

Handles:
- workflow sequencing
- state transitions
- task dispatch

Must not:
- render UI
- own presentation state
- bypass validation

### 9.3 AI runtime

Handles:
- prompt execution
- model interaction
- response normalization

Must not:
- directly own business authority
- mutate system state without orchestration

### 9.4 Voice runtime

Handles:
- speech capture
- speech synthesis
- voice transport

Must not:
- control core orchestration
- own product truth

### 9.5 Avatar runtime

Handles:
- visual persona
- conversational presence
- presentation behavior

Must not:
- dictate execution flow
- override orchestration rules

## 10. Scalability philosophy

LDCN OS must scale by replacing parts, not by inflating a single monolithic core.

Rules:
- scaling must be modular
- engines must be replaceable
- providers must be replaceable
- agents must be replaceable
- service boundaries must remain stable under growth
- runtime components must be independently evolvable

This architecture is designed to survive future product expansion without collapse into a tightly coupled system.

## 11. Anti-chaos rules

The system must actively resist architectural entropy.

### 11.1 No hidden mocks

All fake data, test doubles, and placeholders must be explicit and isolated.

### 11.2 No temporary hacks

Short-term hacks that become permanent are prohibited.

### 11.3 No direct filesystem coupling

Filesystem access must be mediated, intentional, and never assumed by default.

### 11.4 No giant god services

Services must remain narrow in responsibility and composable by design.

### 11.5 No uncontrolled AI execution

AI behavior must always be governed by contracts, validation, and orchestration.

### 11.6 No circular dependencies

Modules must not create dependency loops across layers, packages, or services.

### 11.7 No boundary erosion

When a module begins absorbing unrelated responsibilities, the design must be corrected immediately.

## 12. Final rule

If a decision improves convenience but weakens separation, traceability, security, or modularity, the decision is rejected.

LDCN OS is built for disciplined expansion, not architectural drift.
