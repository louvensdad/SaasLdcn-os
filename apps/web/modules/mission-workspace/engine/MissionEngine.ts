import { getMissionGenome } from '../registry';
import { coerceToStringArray, createEmptyMissionContext } from '../types';
import type {
  Gap, ImpactedStep, Inconsistency, JourneyState, JourneyStep, MissionContext,
  MissionFieldDefinition, MissionGenome, MissionInstance, MissionStepDefinition,
  MissionTypeId, Risk, ValidationError, ValidationResult,
} from '../types';

function answerFor(context: MissionContext, stepId: string, fieldId: string): unknown {
  const exact = context.answers[`${stepId}.${fieldId}`];
  if (exact !== undefined) return exact;
  return Object.entries(context.answers).find(([key]) => key.endsWith(`.${fieldId}`))?.[1];
}
function answered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
function fieldVisible(context: MissionContext, stepId: string, field: MissionFieldDefinition): boolean {
  return !field.dependsOn || answerFor(context, stepId, field.dependsOn.fieldId) === field.dependsOn.value;
}
function requiredFields(step: MissionStepDefinition, context: MissionContext): readonly MissionFieldDefinition[] {
  return step.fields.filter((field) => field.required && fieldVisible(context, step.id, field));
}
function stepComplete(step: MissionStepDefinition, context: MissionContext): boolean {
  return requiredFields(step, context).every((field) => answered(answerFor(context, step.id, field.id)));
}
function now(): string { return new Date().toISOString(); }

export class MissionEngine {
  static resolveActiveSteps(genome: MissionGenome, context: MissionContext): MissionStepDefinition[] {
    const steps = [...genome.steps.filter((step) => !step.condition || step.condition(context))];
    for (const conditional of genome.conditionalSteps) {
      if (!conditional.condition(context)) continue;
      const materialized: MissionStepDefinition = {
        id: conditional.id, title: conditional.title, description: conditional.description ?? '',
        fields: conditional.fields ?? [], isConditional: true, specialist: conditional.specialist,
      };
      const anchor = steps.findIndex((step) => step.id === conditional.insertAfter);
      steps.splice(anchor < 0 ? steps.length : anchor + 1, 0, materialized);
    }
    return steps;
  }

  static createMission(typeId: MissionTypeId, userId: string, workspaceId: string): MissionInstance {
    const genome = getMissionGenome(typeId);
    if (!genome) throw new Error(`Tipo de missão não registrado: ${typeId}`);
    const context = createEmptyMissionContext();
    const timestamp = now();
    return {
      id: `mission_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
      type: typeId, userId, workspaceId, status: 'active', mode: genome.executionModes[0] ?? 'guided',
      experienceLevel: 'intermediate', title: genome.title, context,
      journey: this.computeJourney(genome, context), artifacts: [], degraded: false,
      createdAt: timestamp, updatedAt: timestamp, version: 1,
    };
  }

  static computeJourney(genome: MissionGenome, context: MissionContext, preferredStepId?: string | null): JourneyState {
    const definitions = this.resolveActiveSteps(genome, context);
    const incomplete = definitions.find((step) => !stepComplete(step, context));
    const preferred = definitions.find((step) => step.id === preferredStepId);
    const currentStepId = preferred?.id ?? incomplete?.id ?? definitions.at(-1)?.id ?? null;
    const completedCount = definitions.filter((step) => stepComplete(step, context)).length;
    const steps: JourneyStep[] = definitions.map((step) => {
      const complete = stepComplete(step, context);
      const hasGap = context.gaps.some((gap) => gap.relatedStepId === step.id && gap.status === 'open');
      const hasRisk = context.risks.some((risk) => !risk.dismissed && risk.affectedSteps.includes(step.id));
      const hasBlocking = context.inconsistencies.some((item) => item.blocking && item.affectedFields.some((field) => field.startsWith(`${step.id}.`)));
      const alerts = [
        ...(hasGap ? [{ id: `gap_${step.id}`, tone: 'warning' as const, message: 'Há uma lacuna aberta nesta etapa.' }] : []),
        ...(hasRisk ? [{ id: `risk_${step.id}`, tone: 'danger' as const, message: 'Há um risco ativo nesta etapa.' }] : []),
      ];
      const status: JourneyStep['status'] = hasBlocking ? 'blocked' : hasGap || hasRisk ? 'attention' : complete ? 'completed' : step.id === currentStepId ? 'active' : 'pending';
      return { definitionId: step.id, status, completedAt: complete ? now() : null, validationStatus: hasBlocking ? 'invalid' : hasGap || hasRisk ? 'warning' : complete ? 'valid' : undefined, alerts };
    });
    return { steps, currentStepId, progress: definitions.length ? Math.round((completedCount / definitions.length) * 100) : 0 };
  }

  static validateCurrentStep(genome: MissionGenome, journey: JourneyState, context: MissionContext): ValidationResult {
    const current = this.resolveActiveSteps(genome, context).find((step) => step.id === journey.currentStepId);
    if (!current) return { valid: true, errors: [] };
    const errors: ValidationError[] = [];
    for (const field of current.fields.filter((item) => fieldVisible(context, current.id, item))) {
      const value = answerFor(context, current.id, field.id);
      if (field.required && !answered(value)) errors.push({ fieldId: field.id, message: `“${field.label}” é obrigatório.` });
      if (typeof value === 'string' && field.validation?.minLength && value.length < field.validation.minLength) errors.push({ fieldId: field.id, message: field.validation.message ?? `Use pelo menos ${field.validation.minLength} caracteres.` });
      if (typeof value === 'string' && field.validation?.maxLength && value.length > field.validation.maxLength) errors.push({ fieldId: field.id, message: field.validation.message ?? `Use no máximo ${field.validation.maxLength} caracteres.` });
      if (typeof value === 'string' && field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) errors.push({ fieldId: field.id, message: field.validation.message ?? 'Formato inválido.' });
    }
    for (const rule of genome.validations.filter((item) => item.severity === 'error' && (!item.relatedStepId || item.relatedStepId === current.id))) {
      if (!rule.check(context)) errors.push({ fieldId: rule.relatedStepId ?? current.id, message: rule.message });
    }
    return { valid: errors.length === 0, errors };
  }

  static advanceStep(genome: MissionGenome, journey: JourneyState, context: MissionContext): { success: boolean; errors?: readonly ValidationError[]; journey?: JourneyState } {
    const validation = this.validateCurrentStep(genome, journey, context);
    if (!validation.valid) return { success: false, errors: validation.errors };
    const steps = this.resolveActiveSteps(genome, context);
    const index = steps.findIndex((step) => step.id === journey.currentStepId);
    return { success: true, journey: this.computeJourney(genome, context, steps[index + 1]?.id ?? journey.currentStepId) };
  }

  static updateAnswer(context: MissionContext, stepId: string, fieldId: string, value: unknown): MissionContext {
    return { ...context, answers: { ...context.answers, [`${stepId}.${fieldId}`]: value } };
  }

  static resolveFieldDefinition(genome: MissionGenome, context: MissionContext, stepId: string, fieldId: string): MissionFieldDefinition | undefined {
    return this.resolveActiveSteps(genome, context).find((step) => step.id === stepId)?.fields.find((field) => field.id === fieldId);
  }

  /** chips/multiselect fields must store `string[]` -- the manual chip UI
   * already sends that, but AI suggestions are always LLM text, so an
   * accepted suggestion for one of these fields needs the same coercion
   * before it lands in `context.answers`, or every downstream rule that
   * expects an array crashes the whole mission. */
  static normalizeAnswerValue(genome: MissionGenome, context: MissionContext, stepId: string, fieldId: string, value: unknown): unknown {
    const field = this.resolveFieldDefinition(genome, context, stepId, fieldId);
    if (field?.type === 'chips' || field?.type === 'multiselect') return coerceToStringArray(value);
    return value;
  }

  static fieldsDependentOn(genome: MissionGenome, context: MissionContext, fieldId: string): ImpactedStep[] {
    const impacts = new Map<string, ImpactedStep>();
    for (const step of this.resolveActiveSteps(genome, context)) {
      for (const field of step.fields) {
        if (!answered(answerFor(context, step.id, field.id))) continue;
        const promptDepends = field.aiActions.some((action) => action.prompt.includes(`{{${fieldId}}}`));
        if (field.dependsOn?.fieldId === fieldId || promptDepends) {
          impacts.set(step.id, { stepId: step.id, fieldIds: [field.id], reason: `“${field.label}” usa a decisão “${fieldId}” e precisa ser revisado.` });
        }
      }
    }
    return [...impacts.values()];
  }

  static detectGaps(genome: MissionGenome, context: MissionContext): Gap[] {
    const previous = new Map(context.gaps.map((gap) => [gap.id, gap]));
    return genome.gapRules.filter((rule) => rule.check(context)).map((rule) => ({
      id: rule.id, title: rule.title, description: rule.description ?? rule.title, severity: rule.severity,
      relatedStepId: rule.relatedStepId ?? null, suggestedAction: rule.suggestedAction,
      status: previous.get(rule.id)?.status ?? 'open', dismissReason: previous.get(rule.id)?.dismissReason ?? null,
    }));
  }
  static detectRisks(genome: MissionGenome, context: MissionContext): Risk[] {
    const previous = new Map(context.risks.map((risk) => [risk.id, risk]));
    return genome.riskRules.filter((rule) => rule.check(context)).map((rule) => ({
      id: rule.id, severity: rule.severity, category: rule.category, title: rule.title, description: rule.description,
      affectedSteps: rule.affectedSteps ?? [], suggestedAction: rule.suggestedAction, autoDetected: true,
      dismissed: previous.get(rule.id)?.dismissed ?? false,
    }));
  }
  static detectInconsistencies(genome: MissionGenome, context: MissionContext): Inconsistency[] {
    const result: Inconsistency[] = [];
    for (const step of this.resolveActiveSteps(genome, context)) {
      for (const field of step.fields) {
        if (!field.dependsOn || !answered(answerFor(context, step.id, field.id)) || fieldVisible(context, step.id, field)) continue;
        result.push({ id: `stale_${step.id}_${field.id}`, title: `“${field.label}” pode estar desatualizado`, description: `A decisão depende de “${field.dependsOn.fieldId}” = ${String(field.dependsOn.value)}.`, affectedFields: [`${step.id}.${field.id}`], suggestedFix: `Revise “${field.label}” antes de continuar.`, blocking: false });
      }
    }
    return result;
  }
  static computeProgress(instance: MissionInstance): number { return instance.journey.progress; }
  static async generateArtifacts(instance: MissionInstance): Promise<readonly MissionInstance['artifacts'][number][]> { return instance.artifacts; }
}
