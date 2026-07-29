'use client';

import { useEffect, useRef, useState } from 'react';

import { apiEndpoints } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';

type TelemetryStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
export interface RuntimeTelemetryComponent {
  readonly name: string;
  readonly status: TelemetryStatus;
  readonly timestamp: string;
  readonly latency_ms?: number | null;
  readonly activeJobs?: number | null;
  readonly queuedJobs?: number | null;
  readonly activeWorkers?: number | null;
  readonly idleWorkers?: number | null;
  readonly failedJobs?: number | null;
  readonly sandboxStatus?: string | null;
  readonly storageStatus?: string | null;
  readonly detail?: string | null;
}
export interface RuntimeTelemetry {
  readonly contractVersion: string;
  readonly collectedAt: string;
  readonly components: readonly RuntimeTelemetryComponent[];
}

type Transport = 'sse' | 'polling' | 'offline';
interface StreamState {
  readonly telemetry: RuntimeTelemetry | null;
  readonly transport: Transport;
  readonly lastEventAt: number | null;
  readonly reconnectAttempt: number;
  readonly error: string | null;
}

const INITIAL: StreamState = { telemetry: null, transport: 'offline', lastEventAt: null, reconnectAttempt: 0, error: null };
const STALE_AFTER_MS = 20_000;
const POLL_INTERVAL_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export function useRuntimeTelemetryStream(): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    let attempt = 0;
    const lastEventAt = { current: null as number | null };

    const update = (next: Partial<StreamState>) => { if (mounted.current) setState((current) => ({ ...current, ...next })); };
    const poll = async () => {
      try {
        const response = await fetch(apiEndpoints.runtimeTelemetry, { headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined, credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (response.status === 401 && await refreshAccessToken()) return poll();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const telemetry = await response.json() as RuntimeTelemetry;
        lastEventAt.current = Date.now();
        update({ telemetry, transport: 'polling', lastEventAt: lastEventAt.current, error: null });
      } catch (error) {
        if (!controller.signal.aborted) update({ transport: 'offline', error: error instanceof Error ? error.message : 'Telemetry unavailable.' });
      }
    };
    const startPolling = () => {
      if (pollTimer) return;
      void poll();
      pollTimer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; } };
    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** Math.min(attempt, 5)));
      attempt += 1;
      update({ transport: 'polling', reconnectAttempt: attempt });
      startPolling();
      retryTimer = setTimeout(() => { void connect(); }, delay);
    };
    const connect = async (): Promise<void> => {
      if (stopped) return;
      stopPolling();
      try {
        let response = await fetch(apiEndpoints.runtimeTelemetryStream, { headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined, credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (response.status === 401 && await refreshAccessToken()) {
          response = await fetch(apiEndpoints.runtimeTelemetryStream, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: 'include', cache: 'no-store', signal: controller.signal });
        }
        if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`);
        attempt = 0;
        update({ transport: 'sse', reconnectAttempt: 0, error: null });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) throw new Error('SSE stream closed.');
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((entry) => entry.startsWith('data:'));
            if (!line) continue;
            try { lastEventAt.current = Date.now();
              update({ telemetry: JSON.parse(line.slice(5).trim()) as RuntimeTelemetry, transport: 'sse', lastEventAt: lastEventAt.current, error: null }); } catch { update({ error: 'Invalid telemetry event.' }); }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) { update({ error: error instanceof Error ? error.message : 'SSE unavailable.' }); schedule(); }
      }
    };
    void connect();
    const staleTimer = setInterval(() => {
      if (!mounted.current || stopped) return;
      if (!lastEventAt.current || Date.now() - lastEventAt.current > STALE_AFTER_MS) update({ transport: 'offline', error: 'Telemetry is stale.' });
    }, 5000);
    return () => { stopped = true; mounted.current = false; controller.abort(); if (retryTimer) clearTimeout(retryTimer); stopPolling(); clearInterval(staleTimer); };
  // The stream lifecycle intentionally starts once per mounted Runtime surface.
  }, []);

  return state;
}
