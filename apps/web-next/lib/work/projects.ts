import type { GenerationJobSummary } from '@contracts/generation-job.contract';
import type { ProjectRecord } from '@contracts/project.contract';
import type { ProjectRoomSummary } from '@contracts/project-room.contract';

/**
 * One list of everything being built. The backend has no project aggregate (gap G5), so a room, its generation jobs
 * and any legacy project record are joined here by the room id that the handoff reuses as `projectId`.
 */
export interface ProjectRow {
  readonly key: string;
  readonly name: string;
  readonly origin: 'room' | 'record';
  /** What best describes it now: the latest mission's status while one exists, otherwise the room's. */
  readonly state: string;
  readonly roomState: string | null;
  readonly missions: number;
  readonly at: string;
  readonly current: string;
  /** The room summary and the latest mission behind the row: what its mission line is drawn from. */
  readonly room: ProjectRoomSummary | null;
  readonly latest: GenerationJobSummary | null;
  /** Every mission of the project, newest first. */
  readonly jobs: readonly GenerationJobSummary[];
}

export function deriveProjects(
  rooms: readonly ProjectRoomSummary[] | undefined,
  jobs: readonly GenerationJobSummary[] | undefined,
  records: readonly ProjectRecord[] | undefined,
): readonly ProjectRow[] {
  const byProject = new Map<string, GenerationJobSummary[]>();
  for (const job of jobs ?? []) {
    const list = byProject.get(job.projectId) ?? [];
    list.push(job);
    byProject.set(job.projectId, list);
  }

  const rows: ProjectRow[] = (rooms ?? []).map((room) => {
    const mine = [...(byProject.get(room.room_id) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = mine[0];
    return {
      key: room.room_id,
      name: room.title,
      origin: 'room' as const,
      state: latest ? latest.status : room.status,
      roomState: room.status,
      missions: mine.length,
      at: latest ? latest.updatedAt : room.updated_at,
      current: `/project-rooms/${room.room_id}`,
      room,
      latest: latest ?? null,
      jobs: mine,
    };
  });

  const known = new Set(rows.map((row) => row.key));
  for (const record of records ?? []) {
    const key = String(record.project_id);
    if (known.has(key)) continue;
    const mine = [...(byProject.get(key) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    rows.push({
      key,
      name: record.project_name,
      origin: 'record',
      state: record.status,
      roomState: null,
      missions: mine.length,
      at: record.updated_at,
      current: `/projects/${key}`,
      room: null,
      latest: mine[0] ?? null,
      jobs: mine,
    });
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
