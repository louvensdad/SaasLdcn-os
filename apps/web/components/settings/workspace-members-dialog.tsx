'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import type { WorkspaceMember } from '@/lib/api/types';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string | null;
  readonly workspaceName: string;
}

/** View-only member roster. Invite/rename/role-change are intentionally absent:
 * no backend endpoint exists for them, so exposing controls would be misleading. */
export function WorkspaceMembersDialog({ open, onClose, workspaceId, workspaceName }: Props) {
  const { t } = useLocale();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open || !workspaceId) return;
    setLoading(true);
    setError(null);
    apiClient
      .listWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [open, workspaceId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={workspaceName}
      description={t('settings.workspace.membersDescription')}
      icon={<Users className="h-5 w-5 text-[color:var(--accent)]" />}
    >
      {loading ? (
        <p className="ds-caption">{t('settings.workspace.membersLoading')}</p>
      ) : members.length === 0 ? (
        <p className="ds-caption">{t('settings.workspace.membersEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--text)]">{member.full_name}</p>
                <p className="ds-caption t-mono truncate">{member.email}</p>
              </div>
              <Badge tone="accent">{t(`settings.workspace.role.${member.role}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-3 ds-caption text-[color:var(--danger)]">
          {getApiErrorMessage(error, t('settings.workspace.membersError'))}
        </p>
      ) : null}
    </Modal>
  );
}
