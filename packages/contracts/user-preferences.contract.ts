/** Opaque JSON preference blob, backend-persisted so it survives logout and
 * process restarts. The shape is owned and versioned by the frontend
 * Zustand store (Interface tab / IA tab) -- the backend only round-trips it. */
export interface UserPreferencesBlob {
  readonly data: Record<string, unknown> | null;
}
