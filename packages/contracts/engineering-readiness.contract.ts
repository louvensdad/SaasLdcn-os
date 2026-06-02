import type { ContractMetadata } from './shared.contract';

export type EngineeringBand = 'low' | 'medium' | 'high' | 'enterprise';
export type TeamSeniority = 'mid' | 'senior' | 'senior_plus' | 'staff';
export type EngineeringRiskSeverity = 'info' | 'warning' | 'critical';
export type DeliveryTarget = 'prototype' | 'mvp' | 'production_ready' | 'enterprise_ready';

export interface SkillRequirement extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly priority: 'required' | 'recommended' | 'optional';
  readonly rationale: string;
}

export interface TeamRole extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly recommended_level: TeamSeniority;
  readonly required_skills: readonly SkillRequirement[];
  readonly optional_skills: readonly SkillRequirement[];
}

export interface TeamRecommendation extends ContractMetadata {
  readonly team_size: number;
  readonly required_seniority: TeamSeniority;
  readonly roles: readonly TeamRole[];
  readonly required_expertise: readonly SkillRequirement[];
  readonly rationale: readonly string[];
}

export interface OperationalBurden extends ContractMetadata {
  readonly score: number;
  readonly level: EngineeringBand;
  readonly service_ownership: number;
  readonly deployment_burden: number;
  readonly observability_burden: number;
  readonly incident_burden: number;
  readonly maintenance_effort: EngineeringBand;
  readonly signals: readonly string[];
}

export interface DeliveryComplexity extends ContractMetadata {
  readonly score: number;
  readonly level: EngineeringBand;
  readonly maintenance_effort: EngineeringBand;
  readonly onboarding_effort: EngineeringBand;
  readonly deployment_burden: EngineeringBand;
  readonly complexity_drivers: readonly string[];
}

export interface LearningCurveProfile extends ContractMetadata {
  readonly score: number;
  readonly level: EngineeringBand;
  readonly onboarding_complexity: EngineeringBand;
  readonly ramp_up_weeks: number;
  readonly learning_focus: readonly string[];
}

export interface ProductionReadiness extends ContractMetadata {
  readonly score: number;
  readonly readiness: DeliveryTarget;
  readonly production_ready: boolean;
  readonly enterprise_ready: boolean;
  readonly deployment_readiness: number;
  readonly operational_readiness: number;
  readonly team_readiness: number;
  readonly missing_baselines: readonly string[];
}

export interface EngineeringRisk extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly severity: EngineeringRiskSeverity;
  readonly category: 'production' | 'operations' | 'maintenance' | 'scaling' | 'team';
  readonly summary: string;
  readonly related_ids: readonly string[];
}

export interface DeliveryEstimate extends ContractMetadata {
  readonly target: DeliveryTarget;
  readonly estimated_weeks: number;
  readonly confidence: EngineeringBand;
  readonly complexity: DeliveryComplexity;
  readonly phases: readonly {
    readonly id: string;
    readonly label: string;
    readonly weeks: number;
  }[];
}

export interface EngineeringReadinessProfile extends ContractMetadata {
  readonly overall_readiness: number;
  readonly team_size: number;
  readonly recommended_roles: readonly TeamRole[];
  readonly required_seniority: TeamSeniority;
  readonly onboarding_complexity: EngineeringBand;
  readonly production_risk: number;
  readonly operational_risk: number;
  readonly maintenance_risk: number;
  readonly scaling_risk: number;
  readonly delivery_estimate: DeliveryEstimate;
  readonly learning_curve: LearningCurveProfile;
  readonly enterprise_readiness: number;
  readonly deployment_readiness: number;
  readonly team_recommendation: TeamRecommendation;
  readonly operational_burden: OperationalBurden;
  readonly delivery_complexity: DeliveryComplexity;
  readonly production_readiness: ProductionReadiness;
  readonly engineering_risks: readonly EngineeringRisk[];
}
