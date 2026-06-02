import type { ContractMetadata, StackId } from './shared.contract';

export interface ArchitectureLevelContract extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly complexity_score: number;
  readonly recommended_for: readonly string[];
  readonly includes: readonly string[];
  readonly constraints: readonly string[];
  readonly supported_stacks: readonly StackId[];
  readonly required_capabilities: readonly string[];
  readonly optional_capabilities: readonly string[];
}
