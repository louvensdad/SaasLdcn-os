import { cn } from '@/lib/cn';

/**
 * Lightweight placeholder shown while the WebGL Canvas loads, and the static
 * fallback when WebGL is unavailable. Reuses the existing CSS glow vocabulary so
 * it never looks broken — just calmer than the 3D scene.
 */
export function SceneFallback({ className }: { readonly className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_70%)] blur-2xl" />
      <div className="cinematic-gradient-motion absolute inset-0 opacity-40" />
    </div>
  );
}
