# Contracts Foundation Report

## Purpose

This report documents the initial TypeScript contract foundation created for LDCN OS.

The objective of this first contract layer is to establish a shared, typed vocabulary for the platform before any implementation logic is introduced.

## Files created

- `packages/contracts/shared.contract.ts`
- `packages/contracts/stack.contract.ts`
- `packages/contracts/project.contract.ts`
- `packages/contracts/wizard.contract.ts`
- `packages/contracts/generation.contract.ts`
- `packages/contracts/template.contract.ts`
- `packages/contracts/agent.contract.ts`
- `packages/contracts/ldcn.contract.ts`

## Contract summary

### `shared.contract.ts`

This file defines the base contract utilities and branded ID types used across the package.

It includes:
- branded identifiers for all core entities
- timestamp and contract version types
- recursive contract value types
- shared contract metadata

This file is the foundation for standardizing identity and structure across the entire system.

### `stack.contract.ts`

This file defines the canonical stack model.

It includes:
- stack IDs
- stack domain classification
- lifecycle status
- runtime mode
- language and toolchain data
- compatibility flags

This contract provides a single source of truth for stack identity and capability.

### `project.contract.ts`

This file defines the project registry model.

It includes:
- project IDs
- project naming and description fields
- project status and scope
- owner metadata
- optional links to template, wizard, and generation records

This contract establishes the main project identity used by the platform.

### `wizard.contract.ts`

This file defines the guided setup and validation contract.

It includes:
- wizard IDs
- step and field definitions
- answer map structure
- validation issues
- wizard lifecycle status

This contract is the base structure for stack-aware project onboarding.

### `generation.contract.ts`

This file defines the generation pipeline contract.

It includes:
- generation request and generation state
- artifact definitions
- trace entries
- validation report structure
- download metadata

This contract ensures generation is traceable, inspectable, and packageable.

### `template.contract.ts`

This file defines the template registry contract.

It includes:
- template IDs
- template status and visibility
- blueprint structure
- preview structure
- default answers
- prompt seed references

This contract makes templates explicit, reviewable, and reusable.

### `agent.contract.ts`

This file defines the agent registry and execution contracts.

It includes:
- agent roles
- agent lifecycle status
- agent responsibilities
- input and output schemas
- execution records
- error records

This contract keeps agents scoped, testable, and orchestrator-aware.

### `ldcn.contract.ts`

This file defines the LDCN copilot session and interaction contract.

It includes:
- LDCN modes
- session states
- presence states
- messages
- actions
- memory references
- voice and avatar enablement flags

This contract provides the initial typed model for the global copilot layer.

## Design notes

- All IDs are branded to reduce accidental cross-entity mixing.
- No `any` types were introduced.
- Contracts are intentionally focused on identity, state, and structure.
- No implementation logic, UI logic, or backend behavior was added.

## Outcome

The contracts package now has a clear official foundation for future frontend, backend, engine, and agent work.

This package can now be used as the canonical contract source for the next development phases.
