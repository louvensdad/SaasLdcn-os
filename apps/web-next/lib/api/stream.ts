import type { GenerationExecutionEvent, ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { GenerationNotification } from '@contracts/generation-notification.contract';

import { getAccessToken, refreshSession } from './http';

/**
 * The mission stream: `GET /api/meta-factory/jobs/{id}/events` sends five frame types over one connection
 * (execution_event, notification, generation_job, heartbeat, stream_timeout, plus error). EventSource cannot carry the
 * bearer token, so the body is read by hand — which is also what makes `Last-Event-ID` resume possible after a drop.
 */
export type StreamFrame =
  | { readonly type: 'generation_job'; readonly job: ResilientGenerationJob }
  | { readonly type: 'execution_event'; readonly event: GenerationExecutionEvent }
  | { readonly type: 'notification'; readonly notification: GenerationNotification }
  | { readonly type: 'heartbeat'; readonly jobId: string; readonly stage: string }
  | { readonly type: 'stream_timeout'; readonly jobId: string; readonly message: string }
  | { readonly type: 'error'; readonly detail: string };

/** What the interface is allowed to claim about the connection. `ended` means the backend closed it on a terminal status. */
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'timeout' | 'failed';

export interface StreamHandlers {
  readonly onFrame: (frame: StreamFrame) => void;
  readonly onState: (state: StreamState, detail?: { readonly lastEventId?: string; readonly message?: string }) => void;
}

const TERMINAL = new Set(['READY', 'FAILED', 'PAUSED', 'NEEDS_USER_ACTION', 'STALLED']);

export function streamMission(jobId: string, handlers: StreamHandlers): () => void {
  const controller = new AbortController();
  let lastEventId: string | undefined;
  let terminal = false;
  let delay = 500;

  const wait = (ms: number) => new Promise<void>((resolve) => {
    if (controller.signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  const readStream = async (allowRefresh: boolean): Promise<void> => {
    const token = getAccessToken();
    const response = await fetch(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/events`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 401 && allowRefresh && (await refreshSession())) return readStream(false);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    handlers.onState('live', { lastEventId });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        const dataLine = raw.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        const idLine = raw.split('\n').find((line) => line.startsWith('id: '));
        if (idLine) lastEventId = idLine.slice(4).trim() || lastEventId;
        let frame: StreamFrame;
        try {
          frame = JSON.parse(dataLine.slice(6)) as StreamFrame;
        } catch {
          continue;
        }
        if (frame.type === 'generation_job') terminal = TERMINAL.has(frame.job.status);
        if (frame.type === 'stream_timeout') handlers.onState('timeout', { message: frame.message, lastEventId });
        handlers.onFrame(frame);
      }
    }
  };

  void (async () => {
    handlers.onState('connecting');
    while (!controller.signal.aborted && !terminal) {
      try {
        await readStream(true);
        delay = 500;
      } catch (reason) {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : '';
        // A 4xx that is not a timeout or rate limit will not fix itself by reconnecting.
        if (/^HTTP 4\d\d$/.test(message) && !/^HTTP (408|429)$/.test(message)) {
          handlers.onState('failed', { message });
          return;
        }
      }
      if (terminal || controller.signal.aborted) break;
      handlers.onState('reconnecting', { lastEventId });
      await wait(delay);
      delay = Math.min(5_000, delay * 2);
    }
    if (!controller.signal.aborted) handlers.onState('ended', { lastEventId });
  })();

  return () => controller.abort();
}
