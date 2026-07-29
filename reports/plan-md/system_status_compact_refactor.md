# System Status Compact Refactor

## Scope

Refactored the Status do Sistema page from always-expanded technical inventories into a compact operational surface.

## Changes

- Replaced the full active systems grid with collapsed accordions.
- Added compact summary cards for Runtime, API, Build and Registry.
- Kept the visual health score as the primary health signal.
- Kept validation as a summarized deployment path: last validation, tests, frontend and API.
- Added a system filter that expands matching groups only while searching.
- Preserved premium glass cards and status indicators inside expanded sections.

## Default Behavior

- Modules, engines, templates and skills are collapsed by default.
- Default page height is controlled by summary cards, health score and validation summary.
- Technical lists require explicit user action.

## Files

- `apps/web/app/(app)/system-status/page.tsx`
- `apps/web/components/system/ActiveSystemsGrid.tsx`
- `apps/web/components/system/CollapsibleSection.tsx`
- `apps/web/components/system/SystemGroupAccordion.tsx`
- `apps/web/components/system/SystemSearchFilter.tsx`
- `apps/web/components/system/StatusSummaryCard.tsx`
- `apps/web/components/system/DeployModeToggle.tsx`