'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { useUiStore, type ToastTone } from '@/stores/use-ui-store';

interface ToastConfig {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
}

type ToastFactory<T, V> = ToastConfig | ((data: T, vars: V) => ToastConfig | null);
type ErrorToastFactory<V> = ToastConfig | ((error: Error, vars: V) => ToastConfig | null);
type KeysFactory<T, V> =
  | readonly (readonly unknown[])[]
  | ((data: T, vars: V) => readonly (readonly unknown[])[]);

export interface AppMutationOptions<TData, TVars> {
  /** The API call. Step 1 of the standard flow. */
  readonly mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * Step 2 — validate the response. Throw to treat an HTTP-200 response as a
   * failure (e.g. a body that reports `ok: false`).
   */
  readonly validate?: (data: TData, vars: TVars) => void;
  /** Step 3 — query keys to invalidate so every dependent surface refetches. */
  readonly invalidateKeys?: KeysFactory<TData, TVars>;
  /** Step 4a — success toast. */
  readonly successToast?: ToastFactory<TData, TVars>;
  /** Step 4b — error toast. Defaults to a generic error toast when omitted. */
  readonly errorToast?: ErrorToastFactory<TVars>;
  /** Step 5 — local state updates, navigation, optimistic commits, etc. */
  readonly onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
  readonly onError?: (error: Error, vars: TVars) => void;
  /** Step 6 — console label so every mutation leaves a trace. */
  readonly logLabel?: string;
}

function resolveToast<T, V>(factory: ToastFactory<T, V> | undefined, data: T, vars: V): ToastConfig | null {
  if (!factory) return null;
  return typeof factory === 'function' ? factory(data, vars) : factory;
}

/**
 * The single mutation standard for the platform. Every mutation that changes
 * server state should go through this so it follows one flow:
 *
 *   API call → validate response → invalidate caches → toast → local update → log
 *
 * This removes the "backend changed but the UI is stale until F5" class of bug
 * by making cache invalidation a first-class, declarative step instead of
 * something each caller remembers (or forgets) to do.
 */
export function useAppMutation<TData, TVars = void>(
  options: AppMutationOptions<TData, TVars>,
): UseMutationResult<TData, Error, TVars> {
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);

  return useMutation<TData, Error, TVars>({
    mutationFn: options.mutationFn,
    onSuccess: async (data, vars) => {
      // Step 2 — validate
      options.validate?.(data, vars);

      // Step 3 — invalidate caches
      const keys =
        typeof options.invalidateKeys === 'function'
          ? options.invalidateKeys(data, vars)
          : options.invalidateKeys;
      if (keys) {
        await Promise.all(
          keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
      }

      // Step 4a — success toast
      const toast = resolveToast(options.successToast, data, vars);
      if (toast) addToast({ tone: toast.tone ?? 'success', title: toast.title, description: toast.description });

      // Step 6 — log
      if (options.logLabel) console.info(`[mutation] ${options.logLabel} ✓`);

      // Step 5 — local update / navigation
      await options.onSuccess?.(data, vars);
    },
    onError: (error, vars) => {
      // Toasts are opt-in: only surface one when the caller configured
      // `errorToast`, so migrating an existing hook never silently changes its
      // UX. Callers that want the default error UI pass an explicit config.
      const factory = options.errorToast;
      const toast =
        typeof factory === 'function' ? factory(error, vars) : factory ?? null;
      if (toast) {
        addToast({
          tone: toast.tone ?? 'error',
          title: toast.title,
          description: toast.description ?? error.message,
        });
      }
      if (options.logLabel) console.error(`[mutation] ${options.logLabel} ✗`, error);
      options.onError?.(error, vars);
    },
  });
}
