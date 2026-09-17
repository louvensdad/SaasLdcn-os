import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import type { CompositionRead, StackCertificationRecord, TestRoomProfileEntry } from '@/lib/api/types';
import { familyFor } from '@/lib/status';

/**
 * What LDCN can build, joined only on served fields: a language (`profile.language`) → its build profiles
 * (`/api/test-room/profiles`) with the latest component certification recorded for each (`profile_id`) → the strategic
 * compositions whose ledger rows name that profile as their `stack_id`. A composition row records one stack; its other
 * members are not served, so they are named as missing instead of being parsed out of the composition id.
 */
export interface LanguageData {
  readonly kind: 'language';
  readonly language: string;
  readonly profiles: number;
}

export interface ProfileData {
  readonly kind: 'profile';
  readonly profile: TestRoomProfileEntry;
  /** The backend's verdict of the latest component certification, or EXPERIMENTAL when none ever ran. */
  readonly verdict: string;
  readonly family: Family;
  readonly record: StackCertificationRecord | null;
}

export interface CompositionData {
  readonly kind: 'composition';
  readonly composition: CompositionRead;
  readonly family: Family;
  /** The profile ids the ledger rows of this composition record as `stack_id`. */
  readonly recordedStacks: readonly string[];
}

export interface TechColumnData {
  readonly kind: 'column';
  readonly column: 'language' | 'profile' | 'composition';
}

export type TechData = LanguageData | ProfileData | CompositionData | TechColumnData;

const X = { language: 0, profile: 220, composition: 540 } as const;
const W = { language: 150, profile: 250, composition: 280 } as const;
const H = 58;
const GAP = 14;
const GROUP_GAP = 20;

const isComponentRow = (record: StackCertificationRecord) => record.sample_ref.startsWith('certification_sample:');

export function verdictFamily(verdict: string): Family {
  if (verdict === 'EXPERIMENTAL') return 'idle';
  return familyFor(verdict);
}

export function layoutTechnologyGraph({ profiles, records, compositions }: {
  readonly profiles: readonly TestRoomProfileEntry[];
  /** `null` when the ledger could not be read. */
  readonly records: readonly StackCertificationRecord[] | null;
  readonly compositions: readonly CompositionRead[];
}): { readonly nodes: readonly GraphNode<TechData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<TechData>[] = [];
  const edges: GraphEdge[] = [];
  const languages = [...new Set(profiles.map((profile) => profile.language))].sort();

  let cursor = 0;
  for (const language of languages) {
    const mine = profiles.filter((profile) => profile.language === language).sort((a, b) => a.id.localeCompare(b.id));
    const height = mine.length * (H + GAP) - GAP;
    nodes.push({
      id: `language:${language}`, x: X.language, y: cursor + (height - H) / 2, w: W.language, h: H, label: `${language}: ${mine.length}`,
      data: { kind: 'language', language, profiles: mine.length },
    });
    mine.forEach((profile, i) => {
      const record = records?.find((entry) => isComponentRow(entry) && entry.profile_id === profile.id) ?? null;
      const verdict = records === null ? 'unknown' : record ? record.verdict : 'EXPERIMENTAL';
      const family = verdictFamily(verdict);
      nodes.push({
        id: `profile:${profile.id}`, x: X.profile, y: cursor + i * (H + GAP), w: W.profile, h: H, label: `${profile.id}: ${verdict}`,
        data: { kind: 'profile', profile, verdict, family, record },
      });
      edges.push({ from: `language:${language}`, to: `profile:${profile.id}`, orient: 'h', className: 'e-reports', arrow: false });
    });
    cursor += height + GROUP_GAP;
  }

  const total = Math.max(0, cursor - GROUP_GAP);
  const compositionHeight = compositions.length * (H + GAP) - GAP;
  compositions.forEach((composition, i) => {
    const recordedStacks = [...new Set((records ?? []).filter((entry) => entry.profile_id === composition.id).map((entry) => entry.stack_id))];
    const family = verdictFamily(composition.verdict);
    const id = `composition:${composition.id}#${composition.mode}`;
    nodes.push({
      id, x: X.composition, y: (total - compositionHeight) / 2 + i * (H + GAP), w: W.composition, h: H, label: `${composition.id}: ${composition.verdict}`,
      data: { kind: 'composition', composition, family, recordedStacks },
    });
    for (const stack of recordedStacks) {
      if (!profiles.some((profile) => profile.id === stack)) continue;
      edges.push({
        from: `profile:${stack}`, to: id, orient: 'h', label: 'stack_id',
        className: family === 'proof' ? 'e-proof' : family === 'fault' ? 'e-blocked' : 'e-declared',
      });
    }
  });

  nodes.push({ id: 'column:language', x: X.language, y: -44, w: W.language, h: 22, data: { kind: 'column', column: 'language' } });
  nodes.push({ id: 'column:profile', x: X.profile, y: -44, w: W.profile, h: 22, data: { kind: 'column', column: 'profile' } });
  if (compositions.length > 0) nodes.push({ id: 'column:composition', x: X.composition, y: -44, w: W.composition, h: 22, data: { kind: 'column', column: 'composition' } });
  return { nodes, edges };
}
