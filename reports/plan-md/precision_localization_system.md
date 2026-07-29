# Precision Localization System

## Status

Implemented deterministic localization for `pt-BR`, `en-US`, `es-ES`, and `fr-FR` across shared contracts, backend API, frontend shell, Settings, LDCN presence, wizard-critical actions, templates, and generated project documentation.

## Architecture

- Frontend dictionaries live in `apps/web/lib/i18n/dictionaries`.
- Frontend locale preferences persist in `ldcn-locale-preferences`.
- Backend localization endpoints expose locale metadata, dictionaries, preview, validation, and safe `en-US` fallback.
- `locale_profile` travels through Blueprint, Prompt Master, Gatekeeper, local generation, and backend generation.
- Localization remains deterministic, offline-first, and requires no AI or agents.
