'use client';

import {
  Binary,
  Bot,
  Braces,
  Check,
  ChevronDown,
  CircleDot,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  Network,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Table2,
  UploadCloud,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import {
  SAMPLE_DATASET,
  analyzeDataset,
  datasetToCsv,
  parseDatasetText,
  type DatasetAnalysis,
  type DatasetCell,
} from '@/lib/analytics/local-dataset';

type WorkbenchView = 'overview' | 'columns' | 'correlations' | 'data';
type SortDirection = 'ascending' | 'descending';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const TOOLS = [
  { icon: Braces, title: 'Perfil de schema', detail: 'Tipos, cardinalidade e campos ausentes.' },
  { icon: ShieldCheck, title: 'Auditoria de qualidade', detail: 'Completude, duplicatas e riscos de uso.' },
  { icon: Network, title: 'Explorador de correlação', detail: 'Associações lineares entre variáveis numéricas.' },
  { icon: ScanSearch, title: 'Scanner de anomalias', detail: 'Valores além de três desvios-padrão.' },
  { icon: Table2, title: 'Tabela de investigação', detail: 'Preview ordenável e rastreável por coluna.' },
  { icon: Download, title: 'Exportador', detail: 'Relatório JSON e dados normalizados em CSV.' },
] as const;

function formatCell(value: DatasetCell): string {
  if (value === null) return '—';
  if (typeof value === 'number') return NUMBER_FORMAT.format(value);
  return String(value);
}

function fileSize(bytes: number): string {
  if (!bytes) return 'amostra interna';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Pipeline({ ready }: { readonly ready: boolean }) {
  const steps = ['Fonte', 'Schema', 'Qualidade', 'Padrões', 'Relatório'];
  return (
    <ol className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-5" aria-label="Pipeline de análise">
      {steps.map((step, index) => (
        <li key={step} className="flex min-h-14 items-center gap-3 bg-[color:var(--surface-2)] px-4 py-3">
          <span className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[0.625rem]',
            ready
              ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface-3))] text-[color:var(--accent)]'
              : index === 0
                ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                : 'border-[color:var(--border)] text-[color:var(--muted)]',
          )}>
            {ready ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span className="text-xs font-medium text-[color:var(--text)]">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function ToolGrid() {
  return (
    <section aria-labelledby="analysis-tools-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">Ferramentas</p>
          <h3 id="analysis-tools-title" className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[color:var(--text)]">Kit analítico disponível</h3>
        </div>
        <span className="text-xs text-[color:var(--muted)]">6 ferramentas locais</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="flex min-h-24 gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)]">
              <Icon className="h-4 w-4 text-[color:var(--accent)]" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyWorkbench({
  dragging,
  loading,
  error,
  onDrop,
  onDragState,
  onBrowse,
  onSample,
}: {
  readonly dragging: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragState: (dragging: boolean) => void;
  readonly onBrowse: () => void;
  readonly onSample: () => void;
}) {
  return (
    <div className="space-y-5">
      <div
        className={cn(
          'relative grid min-h-72 place-items-center overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-10 text-center transition-colors duration-200',
          dragging
            ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]'
            : 'border-[color:var(--border-strong)] bg-[color:var(--surface)]',
        )}
        onDragEnter={(event) => { event.preventDefault(); onDragState(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) onDragState(false); }}
        onDrop={onDrop}
      >
        <div className="max-w-xl">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--border-strong)] bg-[color:var(--surface-3)]">
            {loading ? <RefreshCw className="h-6 w-6 animate-spin text-[color:var(--accent)]" /> : <UploadCloud className="h-6 w-6 text-[color:var(--accent)]" />}
          </span>
          <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-semibold text-[color:var(--text)]">Carregue uma base para iniciar</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[color:var(--muted)]">
            CSV, TSV ou JSON até 15 MB. O arquivo é analisado localmente no navegador e não é enviado ao servidor.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={onBrowse} disabled={loading}>
              <UploadCloud className="h-4 w-4" /> Selecionar arquivo
            </Button>
            <Button variant="secondary" onClick={onSample} disabled={loading}>
              <FlaskConical className="h-4 w-4" /> Usar dados de demonstração
            </Button>
          </div>
          {error ? <p className="mt-4 text-sm font-medium text-[color:var(--danger)]" role="alert">{error}</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> CSV / TSV</span>
            <span className="inline-flex items-center gap-1.5"><FileJson className="h-3.5 w-3.5" /> JSON</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Processamento local</span>
          </div>
        </div>
      </div>
      <Pipeline ready={false} />
      <ToolGrid />
    </div>
  );
}

function Metric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <p className="text-xs font-medium text-[color:var(--muted)]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[color:var(--text)]">{value}</p>
      <p className="mt-1 text-xs text-[color:var(--muted)]">{detail}</p>
    </div>
  );
}

function AgentRail({ dataset }: { readonly dataset: DatasetAnalysis }) {
  const agents = [
    { icon: Database, name: 'Agente de ingestão', result: `${dataset.rows.length.toLocaleString('pt-BR')} linhas normalizadas` },
    { icon: Binary, name: 'Agente de schema', result: `${dataset.numericColumns} variáveis numéricas detectadas` },
    { icon: ShieldCheck, name: 'Agente de qualidade', result: `${dataset.completeness.toFixed(1)}% de completude` },
    { icon: ScanSearch, name: 'Agente estatístico', result: `${dataset.anomalyCount} anomalias sinalizadas` },
    { icon: Sparkles, name: 'Agente de síntese', result: `${dataset.insights.length} conclusões rastreáveis` },
  ];
  return (
    <aside className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4" aria-labelledby="analysis-agents-title">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] pb-4">
        <div>
          <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">Orquestração</p>
          <h3 id="analysis-agents-title" className="mt-1 font-semibold text-[color:var(--text)]">Agentes da análise</h3>
        </div>
        <Bot className="h-5 w-5 text-[color:var(--accent)]" />
      </div>
      <div className="mt-3 space-y-2">
        {agents.map(({ icon: Icon, name, result }) => (
          <div key={name} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-[color:var(--accent)]" />
              <p className="text-xs font-semibold text-[color:var(--text)]">{name}</p>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" aria-label="Concluído" />
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{result}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">
        Cada resultado é calculado a partir da base carregada; nenhuma conclusão é inventada.
      </p>
    </aside>
  );
}

export function DataAnalysisWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dataset, setDataset] = useState<DatasetAnalysis | null>(null);
  const [view, setView] = useState<WorkbenchView>('overview');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');

  const previewRows = useMemo(() => {
    if (!dataset) return [];
    const rows = dataset.rows.slice(0, 500);
    if (!sortColumn) return rows.slice(0, 100);
    return rows.toSorted((left, right) => {
      const leftValue = left[sortColumn];
      const rightValue = right[sortColumn];
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'pt-BR');
      return sortDirection === 'ascending' ? result : -result;
    }).slice(0, 100);
  }, [dataset, sortColumn, sortDirection]);

  async function loadFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('O arquivo excede 15 MB. Reduza o recorte ou divida a base antes de continuar.');
      return;
    }
    setLoading(true);
    try {
      const rows = parseDatasetText(file.name, await file.text());
      setDataset(analyzeDataset(file.name, rows, file.size));
      setView('overview');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível interpretar o arquivo.');
    } finally {
      setLoading(false);
      setDragging(false);
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
    else setDragging(false);
  }

  function useSample() {
    setError(null);
    setDataset(analyzeDataset('receita-regional-demo.csv', SAMPLE_DATASET));
    setView('overview');
  }

  function sortBy(column: string) {
    if (sortColumn === column) setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending');
    else { setSortColumn(column); setSortDirection('ascending'); }
  }

  function exportReport() {
    if (!dataset) return;
    downloadBlob(JSON.stringify({
      generated_at: new Date().toISOString(),
      source: { name: dataset.name, bytes: dataset.bytes, rows: dataset.rows.length, columns: dataset.columns.length },
      quality: { completeness: dataset.completeness, duplicate_rows: dataset.duplicateRows, anomalies: dataset.anomalyCount },
      profiles: dataset.profiles,
      correlations: dataset.correlations,
      insights: dataset.insights,
    }, null, 2), `${dataset.name.replace(/\.[^.]+$/, '')}-analysis.json`, 'application/json');
  }

  const tabs: readonly { id: WorkbenchView; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'columns', label: 'Colunas' },
    { id: 'correlations', label: 'Correlações' },
    { id: 'data', label: 'Dados' },
  ];

  return (
    <section className="space-y-5" aria-labelledby="data-workbench-title">
      <input ref={inputRef} type="file" accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json" className="sr-only" onChange={handleInput} />
      <header className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-2)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-data inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--accent)]">
                <CircleDot className="h-3.5 w-3.5" /> Sala de análise 01
              </span>
              <span className="rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--muted)]">Processamento local</span>
            </div>
            <h1 id="data-workbench-title" className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.035em] text-[color:var(--text)] sm:text-4xl">
              Da base bruta à decisão, em um fluxo auditável.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Carregue dados, valide a qualidade, investigue relações e exporte um relatório reproduzível. Cada agente mostra exatamente o que calculou.
            </p>
          </div>
          <div className="flex flex-col justify-between border-t border-[color:var(--border)] bg-[color:var(--surface)] p-6 lg:border-l lg:border-t-0">
            <div>
              <p className="type-data text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">Privacidade</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">Seus dados não saem do navegador.</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">Análise local, sem upload silencioso ou persistência automática.</p>
            </div>
            <Button variant="primary" className="mt-5 w-full" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="h-4 w-4" /> {dataset ? 'Substituir base' : 'Carregar dados'}
            </Button>
          </div>
        </div>
      </header>

      {!dataset ? (
        <EmptyWorkbench
          dragging={dragging}
          loading={loading}
          error={error}
          onDrop={handleDrop}
          onDragState={setDragging}
          onBrowse={() => inputRef.current?.click()}
          onSample={useSample}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--text)]">{dataset.name}</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">{fileSize(dataset.bytes)} · análise concluída no navegador</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadBlob(datasetToCsv(dataset), `${dataset.name.replace(/\.[^.]+$/, '')}-normalized.csv`, 'text/csv;charset=utf-8')}>
                <Download className="h-4 w-4" /> CSV normalizado
              </Button>
              <Button variant="primary" onClick={exportReport}>
                <Download className="h-4 w-4" /> Relatório JSON
              </Button>
            </div>
          </div>
          <Pipeline ready />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Linhas" value={dataset.rows.length.toLocaleString('pt-BR')} detail="Registros analisados" />
            <Metric label="Colunas" value={String(dataset.columns.length)} detail={`${dataset.numericColumns} numéricas`} />
            <Metric label="Completude" value={`${dataset.completeness.toFixed(1)}%`} detail="Células preenchidas" />
            <Metric label="Duplicatas" value={dataset.duplicateRows.toLocaleString('pt-BR')} detail="Linhas idênticas" />
            <Metric label="Anomalias" value={dataset.anomalyCount.toLocaleString('pt-BR')} detail="Acima de 3σ" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Card className="min-w-0 overflow-hidden p-0">
              <div className="flex overflow-x-auto border-b border-[color:var(--border)] p-2" role="tablist" aria-label="Visões da análise">
                {tabs.map((tab) => (
                  <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)}
                    className={cn('focus-ring min-h-11 shrink-0 rounded-[var(--radius-sm)] px-4 text-sm font-medium transition-colors',
                      view === tab.id ? 'bg-[color:var(--surface-3)] text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:text-[color:var(--text)]')}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {view === 'overview' ? (
                <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="type-data text-xs uppercase tracking-[0.16em] text-[color:var(--accent)]">Conclusões rastreáveis</p>
                    <div className="mt-3 space-y-2">
                      {dataset.insights.map((insight, index) => (
                        <div key={insight} className="flex gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                          <span className="font-mono text-xs text-[color:var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
                          <p className="text-sm leading-6 text-[color:var(--text)]">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="type-data text-xs uppercase tracking-[0.16em] text-[color:var(--accent)]">Qualidade por coluna</p>
                    <div className="mt-3 space-y-3">
                      {dataset.profiles.slice(0, 8).map((profile) => (
                        <div key={profile.name}>
                          <div className="mb-1 flex justify-between gap-3 text-xs">
                            <span className="truncate text-[color:var(--text)]">{profile.name}</span>
                            <span className="font-mono text-[color:var(--muted)]">{profile.completeness.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-3)]">
                            <div className="h-full bg-[color:var(--accent)]" style={{ width: `${profile.completeness}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {view === 'columns' ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead><tr className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]">
                      {['Coluna', 'Tipo', 'Completude', 'Distintos', 'Ausentes', 'Mínimo', 'Média', 'Máximo'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
                    </tr></thead>
                    <tbody>{dataset.profiles.map((profile) => (
                      <tr key={profile.name} className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--surface-2)]">
                        <th scope="row" className="px-4 py-3 font-mono font-medium text-[color:var(--text)]">{profile.name}</th>
                        <td className="px-4 py-3 text-[color:var(--muted)]">{profile.kind}</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.completeness.toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.distinct}</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.missing}</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.minimum === null ? '—' : NUMBER_FORMAT.format(profile.minimum)}</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.mean === null ? '—' : NUMBER_FORMAT.format(profile.mean)}</td>
                        <td className="px-4 py-3 font-mono text-[color:var(--text)]">{profile.maximum === null ? '—' : NUMBER_FORMAT.format(profile.maximum)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null}

              {view === 'correlations' ? (
                <div className="p-5">
                  {dataset.correlations.length ? (
                    <div className="space-y-3">
                      {dataset.correlations.slice(0, 20).map((pair) => (
                        <div key={`${pair.left}-${pair.right}`} className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
                          <div>
                            <p className="text-sm font-medium text-[color:var(--text)]">{pair.left} × {pair.right}</p>
                            <p className="mt-1 text-xs text-[color:var(--muted)]">{pair.samples} observações pareadas</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-3)]">
                              <div className={cn('h-full', pair.coefficient >= 0 ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--warning)]')} style={{ width: `${Math.abs(pair.coefficient) * 100}%` }} />
                            </div>
                            <span className="w-10 text-right font-mono text-xs text-[color:var(--text)]">{pair.coefficient.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] p-6 text-sm text-[color:var(--muted)]">São necessárias pelo menos duas colunas numéricas com três observações pareadas.</p>}
                </div>
              ) : null}

              {view === 'data' ? (
                <div>
                  <div className="border-b border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">Prévia das primeiras 100 linhas; ordenação considera até 500.</div>
                  <div className="max-h-[34rem] overflow-auto">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[color:var(--surface-2)]"><tr>
                        {dataset.columns.map((column) => (
                          <th key={column} aria-sort={sortColumn === column ? sortDirection : 'none'} className="border-b border-r border-[color:var(--border)] p-0 last:border-r-0">
                            <button type="button" onClick={() => sortBy(column)} className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 whitespace-nowrap px-3 font-mono font-semibold text-[color:var(--text)]">
                              {column}<ChevronDown className={cn('h-3.5 w-3.5 text-[color:var(--muted)]', sortColumn === column && sortDirection === 'ascending' && 'rotate-180')} />
                            </button>
                          </th>
                        ))}
                      </tr></thead>
                      <tbody>{previewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-[color:var(--border)] hover:bg-[color:var(--surface-2)]">
                          {dataset.columns.map((column) => <td key={column} className="max-w-72 truncate border-r border-[color:var(--border)] px-3 py-2.5 font-mono text-[color:var(--text)] last:border-r-0" title={formatCell(row[column] ?? null)}>{formatCell(row[column] ?? null)}</td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </Card>
            <AgentRail dataset={dataset} />
          </div>
          <ToolGrid />
        </>
      )}
    </section>
  );
}
