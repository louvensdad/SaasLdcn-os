// Mirrors app/schemas/live_preview.py exactly.
export type LivePreviewStatus = 'starting' | 'running' | 'failed' | 'stopped' | 'unsupported';

export interface LivePreviewSession {
  readonly session_id: string;
  readonly project_id: string;
  readonly status: LivePreviewStatus;
  readonly reason: string;
  // Direct http://127.0.0.1:{port}/ URL for the iframe; null until running.
  readonly preview_url: string | null;
  readonly started_at: string;
  readonly last_activity_at: string;
}

// Mirrors app/schemas/live_preview.py's ConsoleLogEntry. Backed by a real
// headless Chromium page (preview_inspector.py), not the iframe itself --
// the parent page can never legally read a cross-origin iframe's console.
export interface ConsoleLogEntry {
  readonly type: string;
  readonly text: string;
  readonly at: string;
}
