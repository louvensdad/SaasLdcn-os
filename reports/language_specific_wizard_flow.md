# Language-Specific Wizard Flow

The wizard now switches to language-domain endpoints as soon as a language is selected.

## Flow

1. User selects a language in step 1.
2. The wizard loads the language profile from `GET /api/languages/{language_id}/profile`.
3. The wizard loads language-scoped frameworks, architectures, archetypes, capabilities, and recommendations.
4. Framework, architecture, archetype, and capability choices are filtered by the selected language domain.
5. The side rail shows language recommendations instead of relying only on generic registry lists.

## UI behavior

- Java loads Spring Boot, Quarkus, and Micronaut options.
- TypeScript loads NestJS, Next.js, Fastify, Angular, and React options.
- Python loads FastAPI, Django, and Flask options.
- The wizard preserves the safe offline state if the backend is unavailable.

## Files changed

- `apps/web/app/(app)/wizard/page.tsx`
- `apps/web/hooks/use-language-profile.ts`
- `apps/web/hooks/use-language-frameworks.ts`
- `apps/web/hooks/use-language-architectures.ts`
- `apps/web/hooks/use-language-archetypes.ts`
- `apps/web/hooks/use-language-capabilities.ts`
- `apps/web/hooks/use-language-recommendations.ts`

