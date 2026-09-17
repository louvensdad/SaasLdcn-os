import type { GenerationJobSummary } from '@contracts/generation-job.contract';
import type { ProjectRoomSummary } from '@contracts/project-room.contract';

import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

/**
 * The mission line of a project in a list: the stations the list reads can answer, compressed into one row of points.
 * Quality, certification and delivery need a read per project (there is no project aggregate, gap G5), so a list does
 * not guess them — the line ends in a dashed tail and the project screen draws the rest.
 */
export type LinePointId = 'definition' | 'requirements' | 'generation' | 'build' | 'package';
export const LINE_POINTS: readonly LinePointId[] = ['definition', 'requirements', 'generation', 'build', 'package'];

export interface LinePoint {
  readonly id: LinePointId;
  /** The backend value, or the field that answered it. */
  readonly state: string;
  readonly family: Family;
}

export function projectLine(room: ProjectRoomSummary | null, latest: GenerationJobSummary | null): readonly LinePoint[] {
  const definition: LinePoint = room
    ? { id: 'definition', state: room.status, family: familyFor(room.status) }
    : { id: 'definition', state: 'n/a', family: 'na' };
  const requirements: LinePoint = room
    ? room.has_prompt_master ? { id: 'requirements', state: 'has_prompt_master', family: 'proof' } : { id: 'requirements', state: 'NOT_RUN', family: 'idle' }
    : { id: 'requirements', state: 'n/a', family: 'na' };
  const generation: LinePoint = latest
    ? { id: 'generation', state: latest.status, family: familyFor(latest.status) }
    : { id: 'generation', state: 'NOT_RUN', family: 'idle' };
  const build: LinePoint = latest
    ? { id: 'build', state: latest.buildStatus, family: latest.buildStatus === 'RUNNING' ? 'pulse' : familyFor(latest.buildStatus) }
    : { id: 'build', state: 'NOT_RUN', family: 'idle' };
  const packaged: LinePoint = latest?.packageReady
    ? { id: 'package', state: 'packageReady', family: 'proof' }
    : { id: 'package', state: 'NOT_RUN', family: 'idle' };
  return [definition, requirements, generation, build, packaged];
}
