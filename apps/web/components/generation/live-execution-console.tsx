'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock3, Copy, FileCode2,
  Loader2, Terminal, XCircle,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { GenerationExecutionEvent } from '@contracts/generation-job.contract';

interface LiveExecutionConsoleProps {
  readonly events: readonly GenerationExecutionEvent[];
  readonly currentStage: string;
  readonly running: boolean;
}

function levelColor(level: string, stream?: string | null): string {
  if (level === 'error' || stream === 'stderr') return 'text-[color:var(--danger)]';
  if (level === 'warning') return 'text-[color:var(--warning)]';
  return 'text-[color:var(--muted)]';
}

function exitTone(code: number | null | undefined): BadgeTone {
  if (code === 0) return 'success';
  if (code == null) return 'warning';
  return 'danger';
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function plainText(events: readonly GenerationExecutionEvent[]): string {
  return events
    .map((event) => {
      if (event.type === 'command_started') return `$ ${event.command ?? ''}`;
      if (event.type === 'command_finished') return `[exit ${event.exitCode ?? '—'}] ${formatDuration(event.durationMs)}`;
      return event.message;
    })
    .join('\n');
}

export function LiveExecutionConsole({ events, currentStage, running }: LiveExecutionConsoleProps) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(
      (event) => `${event.message} ${event.command ?? ''} ${event.stage}`.toLowerCase().includes(needle),
    );
  }, [events, query]);

  // Auto-scroll to the newest line while the user is pinned to the bottom.
  useEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, pinned]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setPinned(atBottom);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(plainText(events));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const lastEvent = events[events.length - 1];

  return (
    <section className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_76%,transparent)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/40 text-[color:var(--accent)]">
            <Terminal className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--text)]">Console de execução</p>
            <p className="t-caption">Etapa: {currentStage || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <Badge tone="accent"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Executando</Badge>
          ) : (
            <Badge tone="neutral">Aguardando</Badge>
          )}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar…"
            className="focus-ring h-8 w-36 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-transparent px-2.5 text-xs text-[color:var(--text)]"
          />
          <Button variant="ghost" onClick={() => void copyAll()}>
            <Copy className="h-3.5 w-3.5" /> {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[420px] min-h-[160px] overflow-auto bg-black/40 p-4 font-mono text-xs leading-relaxed"
      >
        {filtered.length === 0 ? (
          <p className="text-[color:var(--muted-2)]">Sem eventos de execução ainda. A saída em tempo real aparece aqui durante a geração e o build.</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((event) => <ConsoleRow key={event.id} event={event} />)}
          </ul>
        )}
        {running && lastEvent ? (
          <div className="mt-2 flex items-center gap-2 text-[color:var(--muted-2)]">
            <Loader2 className="h-3 w-3 animate-spin" /> …
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ConsoleRow({ event }: { readonly event: GenerationExecutionEvent }) {
  if (event.type === 'command_started') {
    return (
      <li className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[color:var(--text)]">
        <span className="text-[color:var(--accent)]">$</span>
        <span className="font-semibold">{event.command}</span>
        {event.cwd ? <span className="text-[color:var(--muted-2)]">({event.cwd})</span> : null}
      </li>
    );
  }
  if (event.type === 'command_finished') {
    return (
      <li className="mb-1 flex items-center gap-2">
        {event.exitCode === 0 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-[color:var(--danger)]" />
        )}
        <Badge tone={exitTone(event.exitCode)}>exit {event.exitCode ?? '—'}</Badge>
        <span className="inline-flex items-center gap-1 text-[color:var(--muted-2)]">
          <Clock3 className="h-3 w-3" /> {formatDuration(event.durationMs)}
        </span>
      </li>
    );
  }
  if (event.type === 'command_skipped') {
    return (
      <li className="flex items-center gap-2 text-[color:var(--warning)]">
        <AlertTriangle className="h-3.5 w-3.5" /> {event.message}
      </li>
    );
  }
  if (event.type === 'stage_started' || event.type === 'stage_finished') {
    return (
      <li className="mt-2 flex items-center gap-2 border-t border-[color:var(--border)] pt-2 text-[color:var(--muted)]">
        <ChevronRight className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        <span className="uppercase tracking-[0.12em]">{event.message}</span>
      </li>
    );
  }
  if (event.type === 'artifact_written') {
    return (
      <li className="flex items-center gap-2 text-[color:var(--muted)]">
        <FileCode2 className="h-3.5 w-3.5" /> {event.artifactPath ?? event.message}
      </li>
    );
  }
  if (event.type === 'error' || event.type === 'stalled' || event.type === 'timeout') {
    return (
      <li className="my-1 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-2 py-1 text-[color:var(--danger)]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {event.message}
      </li>
    );
  }
  // command_output / agent_* / info
  return (
    <li className={cn('whitespace-pre-wrap break-words', levelColor(event.level, event.stream))}>
      {event.type === 'command_output' ? event.message : <span className="text-[color:var(--muted-2)]">{event.message}</span>}
    </li>
  );
}
