// Mirrors app/schemas/billing_catalog.py exactly -- see app/models/billing.py
// for why price_cents is nullable on Básico/Avançado/Pro (vault 56's own
// pricing table lists them as "política comercial", genuinely undefined).
export interface PlanView {
  readonly code: string;
  readonly name: string;
  readonly audience: string;
  readonly price_cents: number | null;
  readonly currency: string;
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number | null>>;
}

export interface SubscriptionView {
  readonly id: string;
  readonly organization_id: string;
  readonly plan_code: string;
  readonly status: string;
  readonly started_at: string;
  readonly current_period_end?: string | null;
  readonly cancelled_at?: string | null;
  readonly created_by_user_id: string;
}

export interface TrialView {
  readonly status: string;
  readonly started_at: string;
  readonly expires_at: string;
  readonly converted_at?: string | null;
}

export interface SubscribeRequest {
  readonly plan_code: string;
  readonly organization_id?: string | null;
}

// Vault error contract for commercial denials (TRIAL_EXPIRED,
// SUBSCRIPTION_REQUIRED, PLAN_FEATURE_NOT_AVAILABLE, *_LIMIT_REACHED, ...).
export interface PlanAccessErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlation_id: string;
  readonly timestamp: string;
}
