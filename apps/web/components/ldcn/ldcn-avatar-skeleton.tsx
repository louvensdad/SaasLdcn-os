'use client';

import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function AvatarRing({
  className,
  tone,
}: {
  readonly className?: string;
  readonly tone: 'accent' | 'warning' | 'muted';
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
      : tone === 'warning'
        ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]'
        : 'border-white/10 bg-white/[0.04]';

  return <div className={cn('absolute rounded-full border shadow-[0_0_28px_var(--glow)]', toneClass, className)} />;
}

export function LDCNAvatarSkeleton({ className }: { readonly className?: string }) {
  const { t } = useLocale();
  const avatarState = useLDCNStore((state) => state.avatarState);
  const mode = avatarState.enabled ? avatarState.status : 'reserved';
  const tone = avatarState.enabled ? 'accent' : avatarState.status === 'disabled' ? 'muted' : 'warning';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-xl)] border border-white/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_92%,black_8%),color-mix(in_srgb,var(--surface-2)_90%,black_10%))] p-3',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_42%)]" />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('ldcn.avatar.title')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{t('ldcn.avatar.description')}</p>
          </div>
          <Badge className="border-white/10 text-[color:var(--muted)]">{avatarState.status}</Badge>
        </div>

        <div className="relative mx-auto flex aspect-[2.2/1] w-full max-w-[13rem] items-center justify-end overflow-hidden rounded-[var(--radius-xl)] border border-white/10 bg-black/10 px-4 py-3">
          <div className="absolute inset-y-0 left-0 w-[58%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.02))]" />
          <div className="relative flex items-center gap-3">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <AvatarRing tone={tone} className="inset-[18%]" />
              <AvatarRing tone={tone} className="inset-[30%] opacity-70" />
              <div className="absolute inset-[42%] rounded-full bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] shadow-[0_0_10px_var(--glow)]" />
            </div>
            <div className="grid gap-1 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{t('ldcn.avatar.telemetry')}</p>
              <p className="text-xs font-semibold text-[color:var(--text)]">{t('ldcn.avatar.observer')}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{t('ldcn.avatar.mode')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{mode.replaceAll('_', ' ')}</p>
          </div>
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{t('ldcn.avatar.style')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{avatarState.style ?? t('ldcn.avatar.abstract')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
