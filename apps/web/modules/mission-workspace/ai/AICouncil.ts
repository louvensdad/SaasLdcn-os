import { missionClient } from '../api/client';
import { ContextEngine } from '../engine/ContextEngine';
import type { AISuggestion, FieldAIAction, MissionContext, MissionGenome, MissionStepDefinition, UserAPIConfig } from '../types';

export interface AIActionResult { readonly content: string; readonly insertMode: FieldAIAction['insertMode']; readonly degraded: boolean; readonly suggestion: AISuggestion; }
export interface FieldActionAuth { readonly useUserKey: true; readonly userModelChoice: string; readonly hasValidatedUserKey: boolean; }

export class AICouncil {
  static getActiveSpecialists(genome: MissionGenome): MissionGenome['specialists'] { return genome.specialists; }
  static async validateAPIConfig(config: UserAPIConfig | FieldActionAuth): Promise<{ valid: boolean; error?: string }> {
    if (!config.hasValidatedUserKey) return { valid: false, error: 'Configure e valide sua própria API key antes de usar a IA.' };
    const model = 'model' in config ? config.model : config.userModelChoice;
    return model.trim() ? { valid: true } : { valid: false, error: 'Selecione um modelo associado à sua API key.' };
  }
  static async executeFieldAction(missionId: string, step: MissionStepDefinition, fieldId: string, action: FieldAIAction, context: MissionContext, auth: FieldActionAuth): Promise<AIActionResult> {
    const validation = await this.validateAPIConfig(auth);
    if (!validation.valid) throw new Error(validation.error);
    const result = await missionClient.executeFieldAction(missionId, {
      step_id: step.id, field_id: fieldId, action_id: action.id, specialist: step.specialist ?? null,
      interpolated_prompt: ContextEngine.interpolatePrompt(action.prompt, context), insert_mode: action.insertMode,
      user_model_choice: auth.userModelChoice, use_user_key: true,
    });
    const current = context.answers[`${step.id}.${fieldId}`] ?? null;
    return {
      content: result.content, insertMode: result.insert_mode, degraded: result.degraded,
      suggestion: {
        id: `suggestion_${Date.now().toString(36)}`, fieldId, stepId: step.id, actionId: action.id,
        actionLabel: action.label, specialist: step.specialist ?? 'software_architect', current,
        proposed: action.insertMode === 'append' && current ? `${String(current)}\n${result.content}` : result.content,
        reason: result.degraded ? 'Nenhum LLM real respondeu; a proposta está pendente de revisão.' : `Proposta do especialista para “${action.label}”.`,
        impact: 'Nenhuma alteração será aplicada antes da sua confirmação.', insertMode: action.insertMode, degraded: result.degraded,
      },
    };
  }
  static async runMissionAnalysis(): Promise<never> { throw new Error('A análise completa requer uma API key do usuário validada e será executada pelo endpoint de missão.'); }
}
