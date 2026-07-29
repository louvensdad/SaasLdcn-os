// Mirrors app/schemas/automation.py -- minimal slice used today by the
// Marketplace "publish" picker (project-experience-v2 has no dedicated
// Automations management UI yet, see automation-project-type-2026-07-20
// memory: this feature shipped backend-only).
export type AutomationTriggerType = 'manual' | 'scheduled';
export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface Automation {
  readonly id: string;
  readonly workspace_id?: string | null;
  readonly title: string;
  readonly description: string;
  readonly trigger_type: AutomationTriggerType;
  readonly action_type: string;
  readonly status: AutomationStatus;
  readonly created_at: string;
  readonly updated_at: string;
}
