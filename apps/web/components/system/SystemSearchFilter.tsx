'use client';

import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

interface SystemSearchFilterProps {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function SystemSearchFilter({ label, placeholder, value, onChange }: SystemSearchFilterProps) {
  return (
    <label className="block w-full sm:max-w-sm">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-10"
          aria-label={label}
        />
      </span>
    </label>
  );
}