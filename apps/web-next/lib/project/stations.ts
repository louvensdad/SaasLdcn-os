import type { Station } from '@/components/evidence-line';
import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

import type { ProjectData } from './use-project';

/**
 * The Evidence Line of a project, one station per lifecycle step. Each station shows the backend's own word; a read
 * that failed or has not answered yet is `unknown` (dashed), and a step that cannot exist yet is `NOT_RUN` — neither
 * is ever drawn as proof.
 */
export type StationId = 'definition' | 'blueprint' | 'review' | 'mission' | 'build' | 'quality' | 'certification' | 'delivery';

const UNKNOWN: readonly [string, Family] = ['unknown', 'unknown'];
const NOT_RUN: readonly [string, Family] = ['NOT_RUN', 'idle'];

export function projectStations(project: ProjectData, name: (id: StationId) => string, base: string): readonly Station[] {
  const { room, latest, running, kernel, delivery, generatedProjectId } = project;

  const pair = (id: StationId, value: readonly [string, Family], extra: Partial<Station> = {}): Station =>
    ({ id, name: name(id), state: value[0], family: value[1], ...extra });

  const roomKnown = room.isSuccess && room.data;
  const definition: readonly [string, Family] = roomKnown ? [room.data.status, familyFor(room.data.status)] : UNKNOWN;

  const blueprintVersion = roomKnown ? room.data.active_blueprint_version ?? room.data.architecture_blueprint?.version ?? null : null;
  const blueprint: readonly [string, Family] = !roomKnown ? UNKNOWN : blueprintVersion != null ? [`V${blueprintVersion}`, 'proof'] : NOT_RUN;

  const readiness = roomKnown ? room.data.engineering_review?.generation_readiness : undefined;
  const review: readonly [string, Family] = !roomKnown ? UNKNOWN : readiness ? [readiness, familyFor(readiness)] : NOT_RUN;

  const mission: readonly [string, Family] = project.jobs.isError ? UNKNOWN : latest ? [latest.status, familyFor(latest.status)] : NOT_RUN;
  const build: readonly [string, Family] = project.jobs.isError ? UNKNOWN : latest ? [latest.buildStatus, familyFor(latest.buildStatus)] : NOT_RUN;

  let quality: readonly [string, Family] = NOT_RUN;
  let certification: readonly [string, Family] = NOT_RUN;
  if (generatedProjectId) {
    if (kernel.data) {
      const blockers = kernel.data.quality_gate_blocker_count;
      quality = blockers === 0 ? ['NO BLOCKER', 'proof'] : [`${blockers} BLOCKER`, 'fault'];
      certification = [kernel.data.kernel_phase, familyFor(kernel.data.kernel_phase)];
    } else {
      quality = UNKNOWN;
      certification = UNKNOWN;
    }
  }

  let deliveryState: readonly [string, Family] = generatedProjectId ? UNKNOWN : NOT_RUN;
  if (delivery.data) {
    const chosen = delivery.data.current_profile?.delivery_mode;
    deliveryState = chosen
      ? [chosen.toUpperCase(), 'proof']
      : delivery.data.blocked
        ? ['BLOCKED', 'caution']
        : ['NOT_CHOSEN', 'hand'];
  }

  return [
    pair('definition', definition, { href: `${base}/define/requirements` }),
    pair('blueprint', blueprint, { href: `${base}/define/architecture` }),
    pair('review', review, { href: `${base}/define/review` }),
    pair('mission', mission, { href: latest ? `${base}/missions/${latest.id}` : `${base}/missions`, live: Boolean(running), current: Boolean(running) }),
    pair('build', build, { href: `${base}/engineering/verification` }),
    pair('quality', quality, { href: `${base}/evidence` }),
    pair('certification', certification, { href: `${base}/evidence` }),
    pair('delivery', deliveryState, { href: `${base}/delivery` }),
  ];
}
