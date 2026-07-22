import type { MissionCategory, MissionGenome, MissionTypeId } from '../types';
import { architectureReviewGenome } from './missions/architecture.review';
import { automationCreateGenome } from './missions/automation.create';
import { documentationCreateGenome } from './missions/documentation.create';
import { errorDiagnoseGenome } from './missions/error.diagnose';
import { projectAnalyzeGenome } from './missions/project.analyze';
import { projectPlanGenome } from './missions/project.plan';
import { softwareBuildGenome } from './missions/software.build';
import { systemModernizeGenome } from './missions/system.modernize';
import { EXPANDED_MISSION_REGISTRY } from './expanded';

export const MISSION_REGISTRY: Record<string, MissionGenome> = {
  'software.build': softwareBuildGenome,
  'error.diagnose': errorDiagnoseGenome,
  'project.analyze': projectAnalyzeGenome,
  'automation.create': automationCreateGenome,
  'project.plan': projectPlanGenome,
  'architecture.review': architectureReviewGenome,
  'system.modernize': systemModernizeGenome,
  'documentation.create': documentationCreateGenome,
  ...EXPANDED_MISSION_REGISTRY,
};

export function isRegisteredMissionType(typeId: string): typeId is MissionTypeId {
  return Object.prototype.hasOwnProperty.call(MISSION_REGISTRY, typeId);
}
export function getMissionGenome(typeId: string): MissionGenome | null {
  return isRegisteredMissionType(typeId) ? MISSION_REGISTRY[typeId] ?? null : null;
}
export function getMissionsByCategory(category: MissionCategory): MissionGenome[] {
  return Object.values(MISSION_REGISTRY).filter((genome) => genome.category === category);
}
export function getRegisteredMissionTypes(): MissionTypeId[] {
  return Object.keys(MISSION_REGISTRY) as MissionTypeId[];
}
