import type { ProjectData } from './use-project';

export type ScopedMission = ProjectData['missions'][number];

/**
 * Which generated project a project screen reads. Every generation writes its own project id
 * (`ProjectWriter.write`), so the project an earlier mission generated is not the latest one.
 *
 * Without `?mission=` a screen reads the project the latest generating mission produced — what the project tabs open —
 * and names that mission. A link from a mission carries it, and the screen then reads the project that mission
 * generated. A mission this project does not list is said to be so; it is never silently swapped for the latest.
 */
export type MissionScope =
  | { readonly kind: 'latest'; readonly generatedProjectId: string | null; readonly mission: ScopedMission | null }
  | {
    readonly kind: 'mission';
    readonly generatedProjectId: string | null;
    readonly mission: ScopedMission;
    /** True when this mission's project is not the one the project tabs open. */
    readonly earlier: boolean;
  }
  | { readonly kind: 'pending'; readonly missionId: string }
  | { readonly kind: 'unresolved'; readonly missionId: string; readonly reason: 'unreadable' | 'foreign' };

export function missionScope(project: ProjectData, missionId: string | null): MissionScope {
  if (!missionId) {
    const mission = project.missions.find((job) => Boolean(job.generatedProjectId) && job.generatedProjectId === project.generatedProjectId) ?? null;
    return { kind: 'latest', generatedProjectId: project.generatedProjectId, mission };
  }
  if (project.jobs.isPending) return { kind: 'pending', missionId };
  if (project.jobs.isError) return { kind: 'unresolved', missionId, reason: 'unreadable' };
  const mission = project.missions.find((job) => job.id === missionId);
  if (!mission) return { kind: 'unresolved', missionId, reason: 'foreign' };
  const generatedProjectId = mission.generatedProjectId ?? null;
  return { kind: 'mission', generatedProjectId, mission, earlier: generatedProjectId !== project.generatedProjectId };
}

/** The generated project a resolved scope reads; null while it cannot be named. */
export function scopedProjectId(scope: MissionScope): string | null {
  return scope.kind === 'latest' || scope.kind === 'mission' ? scope.generatedProjectId : null;
}

/** The query a link to a sibling screen carries so the reader stays on the same mission's project. */
export function missionQuery(missionId: string): string {
  return `?mission=${encodeURIComponent(missionId)}`;
}

export function scopeQuery(scope: MissionScope): string {
  return scope.kind === 'mission' ? missionQuery(scope.mission.id) : '';
}
