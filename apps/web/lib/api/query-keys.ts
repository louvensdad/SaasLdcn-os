/**
 * Centralized React Query key registry.
 *
 * Before this file, query keys were defined as inline string-array literals
 * scattered across ~60 hooks. That made cache invalidation error-prone: a
 * mutation in one feature had no reliable way to know which keys another
 * feature used, so cross-feature updates silently went stale (the "needs F5"
 * class of bug). Every query key the platform invalidates against should be
 * declared here so producers and consumers share a single source of truth.
 */

export const queryKeys = {
  health: ['api', 'health'] as const,
  systemStatus: ['api', 'system-status'] as const,

  projects: ['api', 'projects'] as const,
  project: (projectId: string) => ['api', 'projects', projectId] as const,

  generationFiles: (projectId: string) => ['api', 'generation-files', projectId] as const,
  generationFileContent: (projectId: string, path: string) =>
    ['api', 'generation-file-content', projectId, path] as const,

  documentationRoot: ['api', 'documentation'] as const,
  documentation: (projectId: string) => ['api', 'documentation', projectId] as const,

  roadmap: ['api', 'roadmap'] as const,
  downloads: ['api', 'downloads'] as const,
  projectRooms: ['api', 'project-rooms'] as const,
  projectRoom: (roomId: string) => ['api', 'project-rooms', roomId] as const,
  blueprints: ['api', 'blueprints'] as const,
  engineeringReviews: ['api', 'engineering-reviews'] as const,

  gitProvider: (provider: 'github' | 'gitlab') => ['git-provider', provider] as const,
  userAiKeys: ['user-ai-keys'] as const,
} as const;

/**
 * Query keys whose data is derived from a project's *persisted lifecycle
 * state* (status, `generated_project_path`, generated files, docs, roadmap,
 * downloads). Any mutation that advances a Project Room or produces/changes a
 * generated project must invalidate all of these so every catalog/dashboard
 * surface refreshes without a manual reload.
 *
 * React Query invalidation is prefix-based, so `['api','projects']` also
 * invalidates `['api','projects', id]`, and `['api','documentation']` covers
 * every per-project documentation entry.
 */
export const PROJECT_LIFECYCLE_KEYS = [
  queryKeys.projectRooms,
  queryKeys.blueprints,
  queryKeys.engineeringReviews,
  queryKeys.projects,
  queryKeys.documentationRoot,
  ['api', 'generation-files'],
  queryKeys.roadmap,
  queryKeys.downloads,
] as const satisfies readonly (readonly unknown[])[];
