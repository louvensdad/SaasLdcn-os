import type { ContractMetadata } from './shared.contract';

export interface StatusSignal extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly status: 'healthy' | 'warning' | 'blocked';
  readonly detail: string;
}

export interface PlannedExtensionStatus extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly status: 'inactive';
  readonly lifecycle: 'planned';
  readonly detail: string;
}

export interface SystemStatusResponse extends ContractMetadata {
  readonly backend_status: StatusSignal;
  readonly frontend_status: StatusSignal;
  readonly api_status: StatusSignal;
  readonly build_status: StatusSignal;
  readonly last_validation: string;
  readonly test_coverage: string;
  readonly active_modules: readonly string[];
  readonly active_engines: readonly string[];
  readonly active_templates: readonly string[];
  readonly active_skills: readonly string[];
  readonly planned_extensions: readonly PlannedExtensionStatus[];
  readonly registry_health: readonly StatusSignal[];
}
