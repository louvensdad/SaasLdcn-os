'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import type { ProjectRoom } from '@contracts/project-room.contract';

/** Loads a single Project Room and exposes a reload + optimistic setter. Shared
 * by the Architect Engine and the Engineering Review Center so the fetch logic
 * lives in one place. */
export function useProjectRoom(roomId: string | null) {
  const [room, setRoom] = useState<ProjectRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(roomId));
  // Tracks the roomId this hook should currently be showing, so a response
  // for a room the caller has since navigated away from is discarded instead
  // of overwriting the newer room's data (stale-closure race). Synced in an
  // effect (never during render) per the rules of React refs.
  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const reload = useCallback(async () => {
    if (!roomId) return;
    const requestedRoomId = roomId;
    setLoading(true);
    setError(null);
    try {
      const data = await projectRoomsClient.get(requestedRoomId);
      if (roomIdRef.current !== requestedRoomId) return;
      setRoom(data);
    } catch (caught) {
      if (roomIdRef.current !== requestedRoomId) return;
      setError(caught instanceof Error ? caught.message : 'error');
    } finally {
      if (roomIdRef.current === requestedRoomId) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { room, error, loading, reload, setRoom };
}
