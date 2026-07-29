'use client';

import { useMutation } from '@tanstack/react-query';

import { metaFactoryClient, type OrchestrateResponse, type PriorAnswer } from '@/lib/api/meta-factory';

export interface ProjectSpecVars {
  readonly rawIntent: string;
  readonly priorAnswers?: PriorAnswer[];
  readonly model?: string;
  readonly useUserKey?: boolean;
}

/**
 * Runs the meta-factory orchestrator (a real LLM call, key-gated) that turns a
 * natural-language system description into a structured ProjectSpec. Reused by
 * the wizard's AI intake to seed Step 1.
 */
export function useProjectSpec() {
  return useMutation<OrchestrateResponse, Error, ProjectSpecVars>({
    mutationFn: ({ rawIntent, priorAnswers = [], model, useUserKey = false }) =>
      metaFactoryClient.orchestrate(rawIntent, priorAnswers, model || undefined, useUserKey),
  });
}
