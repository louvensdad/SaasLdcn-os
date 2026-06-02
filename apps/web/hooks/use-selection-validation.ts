'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  SelectionValidationResponse,
  ValidateSelectionPayload,
} from '@/lib/api/types';

export function useSelectionValidation() {
  return useMutation<SelectionValidationResponse, Error, ValidateSelectionPayload>({
    mutationFn: (payload) => apiClient.validateSelection(payload),
  });
}
