import type {
  ContractMetadata,
  FrameworkId,
  LanguageId,
  RuntimeId,
} from './shared.contract';
import type { PerformanceProfile } from './language.contract';

export enum DeploymentProfile {
  LOCAL_FIRST = 'local_first',
  CONTAINER = 'container',
  SERVERLESS = 'serverless',
  VM = 'vm',
  EDGE = 'edge',
}

export interface RuntimeContract extends ContractMetadata {
  readonly id: RuntimeId;
  readonly name: string;
  readonly language_id: LanguageId;
  readonly description: string;
  readonly supported_frameworks: readonly FrameworkId[];
  readonly deployment_profiles: readonly DeploymentProfile[];
  readonly performance_profile: PerformanceProfile;
}
