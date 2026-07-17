'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly content: ReactNode;
}

interface TabsProps {
  readonly items: readonly TabItem[];
  readonly defaultTab?: string;
  readonly className?: string;
  readonly queryParam?: string;
}

export function Tabs({ items, defaultTab, className, queryParam }: TabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = queryParam ? searchParams.get(queryParam) : null;
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const reduce = useReducedMotion();
  const base = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeItem = items.find((item) => item.id === active) ?? items[0];

  useEffect(() => {
    if (requestedTab && items.some((item) => item.id === requestedTab)) setActive(requestedTab);
  }, [items, requestedTab]);

  function selectTab(id: string) {
    setActive(id);
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    let next = -1;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === -1) return;
    event.preventDefault();
    const target = items[next];
    selectTab(target.id);
    tabRefs.current[target.id]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-orientation="horizontal" className="flex gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] p-1">
        {items.map((item, index) => {
          const selected = item.id === active;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              ref={(node) => { tabRefs.current[item.id] = node; }}
              role="tab"
              type="button"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn('focus-ring relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium transition-colors', selected ? 'text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:text-[color:var(--text)]')}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
              {item.label}
              {selected ? <motion.span layoutId={`${base}-active-tab`} className="absolute inset-0 -z-10 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} /> : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${activeItem?.id}`} aria-labelledby={`${base}-tab-${activeItem?.id}`} tabIndex={0} className="mt-6 focus:outline-none">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            {activeItem?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}