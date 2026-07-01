'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Archive, Loader2, MessagesSquare, Plus, Sparkles, Upload } from 'lucide-react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import type { ProjectRoomStatus, ProjectRoomSummary } from '@contracts/project-room.contract';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';

type Phase = 'discovery' | 'approved' | 'generating' | 'generated' | 'archived';

const STATUS_PHASE: Record<ProjectRoomStatus, Phase> = {
  DRAFT: 'discovery',
  UNDER_REVIEW: 'discovery',
  PROMPT_READY: 'discovery',
  PROMPT_APPROVED: 'approved',
  BLUEPRINT_GENERATING: 'approved',
  BLUEPRINT_READY: 'approved',
  ENGINEERING_REVIEW: 'approved',
  ENGINEERING_APPROVED: 'approved',
  WAITING_META_FACTORY: 'generating',
  META_FACTORY_RUNNING: 'generating',
  GENERATING: 'generating',
  VALIDATING: 'generating',
  READY: 'generated',
  FAILED: 'generating',
  ARCHIVED: 'archived',
};

const PHASE_DOT: Record<Phase, string> = {
  discovery: 'bg-yellow-400',
  approved: 'bg-green-400',
  generating: 'bg-blue-400',
  generated: 'bg-purple-400',
  archived: 'bg-zinc-500',
};

export default function ProjectRoomsPage() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<ProjectRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const syncProjectCaches = useProjectCacheSync();

  useEffect(() => {
    let active = true;
    projectRoomsClient
      .list()
      .then((data) => active && setRooms(data))
      .catch(() => active && setError(t('projectRooms.loadError')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t]);

  async function handleArchive(roomId: string) {
    setArchiving(roomId);
    try {
      const updated = await projectRoomsClient.archive(roomId);
      setRooms((current) => current.map((room) => (room.room_id === roomId ? { ...room, status: updated.status } : room)));
      syncProjectCaches();
    } catch {
      setError(t('projectRooms.actionError'));
    } finally {
      setArchiving(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="type-label mb-2 flex items-center gap-2 text-[color:var(--muted)]">
            <Sparkles className="h-4 w-4" />
            {t('projectRooms.title')}
          </div>
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">{t('projectRooms.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--muted)]">{t('projectRooms.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/project-rooms/import">
            <Button variant="secondary">
              <Upload className="h-4 w-4" />
              {t('projectRooms.importButton')}
            </Button>
          </Link>
          <Link href="/project-rooms/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              {t('projectRooms.newRoomButton')}
            </Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : error ? (
        <Card className="p-6 text-sm text-[color:var(--danger,#f87171)]">{error}</Card>
      ) : rooms.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          <MessagesSquare className="h-10 w-10 text-[color:var(--muted)]" />
          <p className="text-sm text-[color:var(--muted)]">{t('projectRooms.empty')}</p>
          <Link href="/project-rooms/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              {t('projectRooms.newRoomButton')}
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rooms.map((room) => {
            const phase = STATUS_PHASE[room.status];
            return (
              <Card key={room.room_id} className="flex items-center justify-between gap-4 p-5">
                <Link href={`/project-rooms/${room.room_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-[color:var(--text)]">{room.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {new Date(room.updated_at).toLocaleString()}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  {room.degraded ? (
                    <span className="text-xs text-yellow-400/90">{t('projectRooms.deterministic')}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-2 text-xs text-[color:var(--text)]/90">
                    <span className={`h-2.5 w-2.5 rounded-full ${PHASE_DOT[phase]}`} />
                    {t(`projectRooms.phase.${phase}`)}
                  </span>
                  {room.status !== 'ARCHIVED' ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleArchive(room.room_id)}
                      disabled={archiving === room.room_id}
                      className="px-2 py-1.5"
                      aria-label={t('projectRooms.archive')}
                      title={t('projectRooms.archive')}
                    >
                      {archiving === room.room_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
