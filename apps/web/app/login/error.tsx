'use client';

import { RouteError } from '@/components/shell/route-error';

export default function LoginError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return <RouteError error={error} reset={reset} />;
}
