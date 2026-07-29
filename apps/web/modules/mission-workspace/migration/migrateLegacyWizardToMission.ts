import { ContextEngine } from '../engine/ContextEngine';
import { MissionEngine } from '../engine/MissionEngine';
import type { MissionInstance } from '../types';

export interface LegacyWizardData {
  readonly projectName?: string;
  readonly goal?: string;
  readonly businessContext?: string;
  readonly targetUsers?: readonly string[];
  readonly businessRules?: string;
  readonly workflows?: string;
  readonly language?: string;
  readonly framework?: string;
  readonly architecture?: string;
  readonly modules?: readonly string[];
  readonly entities?: unknown;
  readonly endpoints?: string;
  readonly infrastructure?: string;
  readonly [key: string]: unknown;
}

export function migrateLegacyWizardToMission(legacy: LegacyWizardData, userId: string, workspaceId: string): MissionInstance {
  let mission = MissionEngine.createMission('software.build', userId, workspaceId);
  const mappings: ReadonlyArray<readonly [string, string, unknown]> = [
    ['vision', 'project_name', legacy.projectName],
    ['vision', 'vision_description', legacy.goal ?? legacy.businessContext],
    ['vision', 'problem', legacy.businessContext],
    ['users', 'user_types', legacy.targetUsers],
    ['business_rules', 'main_rules', legacy.businessRules],
    ['business_rules', 'operational_flows', legacy.workflows],
    ['technology', 'language', legacy.language],
    ['technology', 'framework', legacy.framework],
    ['architecture', 'architecture_style', legacy.architecture],
    ['architecture', 'modules', legacy.modules],
    ['data_model', 'entities', legacy.entities],
    ['apis', 'main_endpoints', legacy.endpoints],
    ['infrastructure', 'infrastructure_type', legacy.infrastructure],
  ];
  for (const [stepId, fieldId, value] of mappings) {
    if (value === undefined || value === null || value === '') continue;
    mission = { ...mission, context: MissionEngine.updateAnswer(mission.context, stepId, fieldId, value) };
  }
  mission = { ...mission, context: { ...mission.context, derived: { ...mission.context.derived, migratedFrom: 'legacy_wizard', legacySnapshot: legacy } } };
  return { ...mission, context: ContextEngine.recordDecision(mission.context, 'migration', 'legacy_import', true, 'default', 'Imported from the legacy wizard.') };
}
