'use client';

import type { GenerationExecutionEvent, ResilientGenerationJob } from '@contracts/generation-job.contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api/api';
import { streamMission, type StreamState } from '@/lib/api/stream';

/** Enough history to read what just happened without holding a whole build in memory. */
const MAX_EVENTS = 500;

export function useMission(jobId: string) {
  const snapshot = useQuery({ queryKey: ['job', jobId], queryFn: () => api.job(jobId), retry: false });
  const [live, setLive] = useState<ResilientGenerationJob | null>(null);
  const [events, setEvents] = useState<readonly GenerationExecutionEvent[]>([]);
  const [state, setState] = useState<StreamState>('connecting');
  const [lastEventId, setLastEventId] = useState<string | undefined>(undefined);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    seen.current = new Set();
    setEvents([]);
    setLive(null);
    const stop = streamMission(jobId, {
      onFrame: (frame) => {
        if (frame.type === 'generation_job') setLive(frame.job);
        else if (frame.type === 'execution_event') {
          const event = frame.event;
          if (seen.current.has(event.id)) return;
          seen.current.add(event.id);
          setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));
        }
      },
      onState: (next, detail) => {
        setState(next);
        if (detail?.lastEventId) setLastEventId(detail.lastEventId);
        if (next === 'timeout') setTimeoutMessage(detail?.message ?? null);
      },
    });
    return stop;
  }, [jobId]);

  /** The stream's snapshot wins while it is connected; the one-shot read is what the screen starts from. */
  const job = live ?? snapshot.data ?? null;

  return {
    job,
    /** The persisted events replay first, so this is the whole console, newest first. */
    events: events.length > 0 ? events : (snapshot.data?.events ?? []).slice().reverse(),
    state,
    lastEventId,
    timeoutMessage,
    isPending: snapshot.isPending && !live,
    isError: snapshot.isError && !live,
    refetch: snapshot.refetch,
  };
}
