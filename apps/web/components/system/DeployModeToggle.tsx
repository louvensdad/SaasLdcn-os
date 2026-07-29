'use client';

import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface DeployModeToggleProps {
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
  readonly label: string;
}

export function DeployModeToggle({ enabled, onChange, label }: DeployModeToggleProps) {
  return (
    <Button
      type="button"
      variant={enabled ? 'primary' : 'secondary'}
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
      className="w-full sm:w-auto"
    >
      <Rocket className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}