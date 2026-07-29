'use client';

import { useEffect, useState } from 'react';
import { Cpu, Sparkles } from 'lucide-react';

import { fetchAiStatus, type AiStatus } from '@/lib/api/ai-status';
import { cn } from '@/lib/cn';
import { useLocale } from '@/hooks/use-locale';

// Global honesty badge: tells the user whether the platform is running real AI
// (a server provider is configured) or the deterministic preview.
export function AiModeBadge() {
  const { t } = useLocale();
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchAiStatus()
      .then((data) => active && setStatus(data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!status) return null;

  const ai = status.ai_active;
  return (
    <span
      title={
        ai
          ? t('aiBadge.aiTooltip', { providers: status.providers.join(', ') })
          : t('aiBadge.previewTooltip')
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
        ai
          ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--text)]'
          : 'border-[color:var(--border)] bg-white/5 text-[color:var(--muted)]',
      )}
    >
      {ai ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
      {ai ? t('aiBadge.ai') : t('aiBadge.preview')}
    </span>
  );
}
