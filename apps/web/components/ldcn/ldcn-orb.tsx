'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LdcnPresenceState } from '@contracts/ldcn.contract';

import { cn } from '@/lib/cn';

const ORB_STYLES: Record<LdcnPresenceState, string> = {
  idle: 'border-white/10 bg-white/[0.04]',
  observing: 'border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]',
  thinking: 'border-[color-mix(in_srgb,var(--accent-2)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent-2)_10%,transparent)]',
  speaking_future: 'border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]',
  blocked: 'border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
  offline: 'border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
};

interface LDCNOrbProps {
  readonly state?: LdcnPresenceState;
  readonly className?: string;
  readonly variant?: 'default' | 'ambient';
}

export function LDCNOrb({ className, state = 'observing', variant = 'default' }: LDCNOrbProps) {
  const shouldReduceMotion = useReducedMotion();
  const isAmbient = variant === 'ambient';

  return (
    <motion.div
      aria-hidden
      className={cn(
        'ai-orb relative overflow-hidden rounded-full border shadow-[0_0_24px_var(--glow)]',
        ORB_STYLES[state],
        isAmbient && 'shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_28%,transparent)]',
        className,
      )}
      animate={
        shouldReduceMotion
          ? { opacity: 1 }
          : {
              opacity: state === 'offline' ? 0.84 : state === 'blocked' ? 0.92 : 1,
              scale: state === 'thinking' ? [1, 1.01, 1] : state === 'warning' ? [1, 1.008, 1] : [1, 1.018, 1],
            }
      }
      transition={shouldReduceMotion ? { duration: 0 } : { duration: isAmbient ? 7.2 : 6.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_32%,rgba(255,255,255,0.16),transparent_18%),radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_70%)]" />
      <span className="absolute inset-[18%] rounded-full border border-white/10 bg-black/20" />
      <span className="absolute inset-[34%] rounded-full bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] shadow-[0_0_12px_var(--glow)]" />
    </motion.div>
  );
}
