'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { missionsClient } from '@/lib/api/missions';
import type { MissionInstance } from '@contracts/mission.contract';

/** Loads a single Mission and exposes a reload + optimistic setter. Mirrors
 * use-project-room.ts's stale-response guard: a response for a mission the
 * caller has since navigated away from is discarded, not applied. */
export function useMission(missionId: string | null) {
  const [mission, setMission] = useState<MissionInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(missionId));
  const missionIdRef = useRef(missionId);
  useEffect(() => {
    missionIdRef.current = missionId;
  }, [missionId]);

  const reload = useCallback(async () => {
    if (!missionId) return;
    const requestedMissionId = missionId;
    setLoading(true);
    setError(null);
    try {
      const data = await missionsClient.get(requestedMissionId);
      if (missionIdRef.current !== requestedMissionId) return;
      setMission(data);
    } catch (caught) {
      if (missionIdRef.current !== requestedMissionId) return;
      setError(caught instanceof Error ? caught.message : 'error');
    } finally {
      if (missionIdRef.current === requestedMissionId) setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { mission, error, loading, reload, setMission };
}
