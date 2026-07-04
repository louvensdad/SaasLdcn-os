'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, History, Loader2, Play, RefreshCcw, Sparkles, TerminalSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { metaFactoryClient } from '@/lib/api/meta-factory';
import type { TerminalCommandRecord } from '@contracts/execution-terminal.contract';

// LDCN Execution Terminal: real, allowlisted command execution inside the
// generated project workspace — the human-intervention path when the bounded
// AI auto-repair gives up. Streams output live, keeps a persistent history.

const QUICK_COMMANDS = ['npm install', 'npm run build', 'npm run test', 'npm run lint', 'git status'] as const;
const CWD_OPTIONS = ['', 'apps/web', 'apps/api', 'apps/mobile'] as const;

type OutputLine = { id: number; stream: 'stdout' | 'stderr' | 'meta'; text: string };

export function ExecutionTerminal({ projectId, suggestedCommands, onRetryBuild, retryLoading }: {
  readonly projectId: string;
  readonly suggestedCommands?: readonly string[];
  readonly onRetryBuild?: () => void;
  readonly retryLoading?: boolean;
}) {
  const { t } = useLocale();
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [history, setHistory] = useState<TerminalCommandRecord[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lineIdRef = useRef(0);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const pushLine = useCallback((stream: OutputLine['stream'], text: string) => {
    lineIdRef.current += 1;
    setLines((prev) => [...prev, { id: lineIdRef.current, stream, text }].slice(-2000));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await metaFactoryClient.terminalHistory(projectId);
      setHistory(response.records.slice().reverse());
      setAllowed(response.allowed_commands);
    } catch {
      // History is best-effort; the terminal stays usable without it.
    }
  }, [projectId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines.length]);

  const run = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || running) return;
    setRunning(true);
    pushLine('meta', `$ ${trimmed}${cwd ? `  (${cwd})` : ''}`);
    try {
      const record = await metaFactoryClient.executeTerminalCommand(projectId, trimmed, cwd, pushLine);
      if (record.status === 'rejected') {
        pushLine('stderr', `✖ ${record.rejection_reason ?? t('terminal.rejected')}`);
      } else if (record.status === 'timeout') {
        pushLine('stderr', `✖ ${t('terminal.timeout')}`);
      } else {
        pushLine('meta', t('terminal.finished', { code: String(record.exit_code ?? '—'), ms: String(record.duration_ms) }));
      }
      await loadHistory();
    } catch (reason) {
      pushLine('stderr', `✖ ${reason instanceof Error ? reason.message : t('terminal.failed')}`);
    } finally {
      setRunning(false);
    }
  }, [projectId, cwd, running, pushLine, loadHistory, t]);

  const applyAiSuggestion = useCallback(async () => {
    for (const suggested of suggestedCommands ?? []) {
      // Sequential on purpose: each fix command sees the previous one's result.
      await run(suggested);
    }
  }, [run, suggestedCommands]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
        <TerminalSquare className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
        <h2 className="mr-auto font-semibold">{t('terminal.title')}</h2>
        <Badge tone="accent">{projectId}</Badge>
        <select
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          aria-label={t('terminal.cwd')}
        >
          {CWD_OPTIONS.map((option) => <option key={option} value={option}>{option || '.'}</option>)}
        </select>
        <Button variant="ghost" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen}>
          <History className="h-4 w-4" aria-hidden /> {t('terminal.history')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/40 p-3">
        {QUICK_COMMANDS.map((quick) => (
          <button
            key={quick}
            type="button"
            disabled={running}
            onClick={() => void run(quick)}
            className="focus-ring rounded-lg border border-border bg-background/60 px-2.5 py-1 font-mono text-xs hover:border-[color:var(--accent)] disabled:opacity-50"
          >
            {quick}
          </button>
        ))}
        {suggestedCommands?.length ? (
          <Button variant="secondary" disabled={running} onClick={() => void applyAiSuggestion()}>
            <Sparkles className="h-4 w-4" aria-hidden /> {t('terminal.applyAi')}
          </Button>
        ) : null}
        {onRetryBuild ? (
          <Button variant="primary" loading={retryLoading} disabled={running} onClick={onRetryBuild}>
            <RefreshCcw className="h-4 w-4" aria-hidden /> {t('terminal.retryBuild')}
          </Button>
        ) : null}
      </div>

      <div ref={outputRef} className="max-h-80 min-h-40 overflow-auto bg-black/40 p-3 font-mono text-xs">
        {lines.length === 0 ? (
          <p className="text-muted-foreground">{t('terminal.empty')} {allowed.length ? `(${allowed.slice(0, 4).join(' · ')} …)` : ''}</p>
        ) : lines.map((line) => (
          <p
            key={line.id}
            className={
              line.stream === 'stderr'
                ? 'whitespace-pre-wrap break-words text-[color:var(--danger)]'
                : line.stream === 'meta'
                  ? 'whitespace-pre-wrap break-words text-[color:var(--accent)]'
                  : 'whitespace-pre-wrap break-words text-foreground/90'
            }
          >
            {line.text}
          </p>
        ))}
        {running ? <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t('terminal.running')}</p> : null}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border/60 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(command);
          setCommand('');
        }}
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={t('terminal.placeholder')}
          className="w-full bg-transparent font-mono text-sm outline-none"
          aria-label={t('terminal.commandInput')}
          disabled={running}
        />
        <Button variant="primary" type="submit" disabled={running || !command.trim()}>
          <Play className="h-4 w-4" aria-hidden /> {t('terminal.run')}
        </Button>
      </form>

      {historyOpen ? (
        <div className="max-h-56 overflow-auto border-t border-border/60 p-3">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('terminal.noHistory')}</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((record) => (
                <li key={record.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{new Date(record.started_at).toLocaleTimeString()}</span>
                  <button
                    type="button"
                    className="focus-ring rounded font-mono hover:text-[color:var(--accent)]"
                    onClick={() => setCommand(record.command)}
                    title={t('terminal.reuse')}
                  >
                    {record.command}
                  </button>
                  <Badge tone={record.status === 'completed' && record.exit_code === 0 ? 'success' : record.status === 'rejected' ? 'danger' : 'warning'}>
                    {record.status === 'completed' ? `exit ${record.exit_code}` : record.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
