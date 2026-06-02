import { ApiClientError } from '@/lib/api/client';

export function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function isApiOffline(error: unknown) {
  return error instanceof ApiClientError && error.isOffline;
}
