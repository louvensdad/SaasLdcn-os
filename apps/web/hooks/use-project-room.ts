'use client';

import { useCallback, useEffect, useState } from 'react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import type { ProjectRoom } from '@contracts/project-room.contract';

/** Loads a single Project Room and exposes a reload + optimistic setter. Shared
 * by the Architect Engine and the Engineering Review Center so the fetch logic
 * lives in one place. */
export function useProjectRoom(roomId: string | null) {
  const [room, setRoom] = useState<ProjectRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(roomId));

  const reload = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      setRoom(await projectRoomsClient.get(roomId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { room, error, loading, reload, setRoom };
}
