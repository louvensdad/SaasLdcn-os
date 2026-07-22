import { missionClient } from '../api/client';
import { MissionEngine } from './MissionEngine';
import type { Decision, DecisionSource, ImpactAnalysis, MissionContext, MissionGenome, MissionInstance, MissionInstanceSummary, Rejection } from '../types';

const TOKEN_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
function id(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export class ContextEngine {
  static recordDecision(context: MissionContext, stepId: string, fieldId: string, value: unknown, source: DecisionSource, reason?: string, impacts: Decision['impacts'] = []): MissionContext {
    const decision: Decision = { id: id('dec'), stepId, fieldId, value, source, reason: reason ?? null, timestamp: new Date().toISOString(), impacts };
    return { ...context, decisions: [...context.decisions, decision] };
  }
  static recordRejection(context: MissionContext, suggestionId: string, reason?: string): MissionContext {
    const rejection: Rejection = { id: id('rej'), suggestionId, reason, timestamp: new Date().toISOString() };
    return { ...context, rejections: [...context.rejections, rejection] };
  }
  static analyzeImpact(genome: MissionGenome, context: MissionContext, stepId: string, fieldId: string, newValue?: unknown): ImpactAnalysis {
    const impactedSteps = MissionEngine.fieldsDependentOn(genome, context, fieldId).filter((impact) => impact.stepId !== stepId || impact.fieldIds?.some((id) => id !== fieldId));
    if (newValue !== undefined) {
      const next = MissionEngine.updateAnswer(context, stepId, fieldId, newValue);
      for (const conditional of genome.conditionalSteps) {
        if (conditional.condition(context) !== conditional.condition(next)) impactedSteps.push({ stepId: conditional.id, reason: `A mudança inclui ou remove a etapa “${conditional.title}”.` });
      }
    }
    return { hasImpact: impactedSteps.length > 0, impactedSteps, message: impactedSteps.length ? `Esta mudança afeta ${impactedSteps.length} etapa(s) e exige revisão.` : '' };
  }
  static interpolatePrompt(template: string, context: MissionContext): string {
    return template.replace(TOKEN_PATTERN, (_match, token: string) => {
      const direct = context.answers[token] ?? context.derived[token];
      const matches = direct === undefined ? Object.entries(context.answers).filter(([key]) => key.endsWith(`.${token}`)) : [];
      const value = direct ?? (matches.length === 1 ? matches[0][1] : undefined);
      if (value === undefined || value === null || value === '') return '[pendente]';
      if (Array.isArray(value)) return value.length ? value.join(', ') : '[pendente]';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
  static save(missionId: string, changes: { title?: string; context?: MissionContext; journey?: MissionInstance['journey']; version?: number }): Promise<MissionInstance> { return missionClient.autosave(missionId, changes); }
  static load(missionId: string): Promise<MissionInstance> { return missionClient.get(missionId); }
  static listUserMissions(): Promise<MissionInstanceSummary[]> { return missionClient.list(); }
}
