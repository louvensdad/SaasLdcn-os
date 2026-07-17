'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, FolderGit2, Network, ShieldAlert, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/shell/section-header';
import {
  useDocumentationExport,
  useDocumentationGenerate,
  useDocumentationLibrary,
  useDocumentationSave,
} from '@/hooks/use-documentation-library';
import { useGeneratedFileContent } from '@/hooks/use-generated-file-content';
import { useProjects } from '@/hooks/use-projects';
import { useLocale } from '@/hooks/use-locale';
import { LlmGatedAction } from '@/components/llm/llm-gated-action';
import type { DocumentationCheck, DocumentationDoc, GeneratedDoc } from '@/lib/api/types';

const STATUS_TONE: Record<DocumentationDoc['status'], BadgeTone> = {
  missing: 'danger',
  unsafe: 'danger',
  inconsistent: 'warning',
  draft: 'warning',
  generated: 'neutral',
  validated: 'success',
  exported: 'success',
};

const CHECK_TONE: Record<DocumentationCheck['status'], BadgeTone> = {
  passed: 'success',
  warning: 'warning',
  failed: 'danger',
};

function scoreTone(score: number): BadgeTone {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export default function DocumentationPage() {
  const { t } = useLocale();
  const projectsQuery = useProjects();
  const documentedProjects = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => Boolean(project.generated_project_path)),
    [projectsQuery.data],
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [organize, setOrganize] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [generated, setGenerated] = useState<GeneratedDoc[] | null>(null);
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);

  const activeProjectId = selectedProjectId ?? documentedProjects[0]?.project_id ?? null;
  const library = useDocumentationLibrary(activeProjectId);
  const exportMutation = useDocumentationExport(activeProjectId);
  const generateMutation = useDocumentationGenerate(activeProjectId);
  const saveMutation = useDocumentationSave(activeProjectId);
  const preview = useGeneratedFileContent(activeProjectId, generated ? null : selectedDocPath);

  const docs = useMemo(() => library.data?.docs ?? [], [library.data?.docs]);
  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((doc) => doc.title.toLowerCase().includes(term) || doc.category.includes(term));
  }, [docs, search]);

  const selectedDoc = docs.find((doc) => doc.path === selectedDocPath) ?? null;
  const selectedGen = generated?.find((doc) => doc.id === selectedGenId) ?? null;
  const knowledgeMap = [
    ['documentation.map.blueprint', 'documentation.map.blueprintValue', 'documentation.map.blueprintDetail'],
    ['documentation.map.promptMaster', 'documentation.map.promptMasterValue', 'documentation.map.promptMasterDetail'],
    ['documentation.map.gatekeeper', 'documentation.map.gatekeeperValue', 'documentation.map.gatekeeperDetail'],
    ['documentation.map.registry', 'documentation.map.registryValue', 'documentation.map.registryDetail'],
  ] as const;

  const lifecycle = [
    ['documentation.lifecycle.blueprint', 'documentation.lifecycle.blueprintDetail'],
    ['documentation.lifecycle.promptMaster', 'documentation.lifecycle.promptMasterDetail'],
    ['documentation.lifecycle.gatekeeper', 'documentation.lifecycle.gatekeeperDetail'],
    ['documentation.lifecycle.registry', 'documentation.lifecycle.registryDetail'],
    ['documentation.lifecycle.readiness', 'documentation.lifecycle.readinessDetail'],
  ] as const;

  function switchProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedDocPath(null);
    setGenerated(null);
    setSelectedGenId(null);
  }

  function runGenerate() {
    generateMutation.mutate(undefined, {
      onSuccess: (data) => {
        setGenerated([...data.docs]);
        setSelectedGenId(data.docs[0]?.id ?? null);
      },
    });
  }

  function regenerate(id: string) {
    generateMutation.mutate(
      { doc_ids: [id] },
      {
        onSuccess: (data) => {
          const next = data.docs[0];
          if (next) setGenerated((prev) => (prev ?? []).map((doc) => (doc.id === next.id ? next : doc)));
        },
      },
    );
  }

  function saveGenerated() {
    if (!generated) return;
    saveMutation.mutate({ docs: generated.map((doc) => ({ id: doc.id, content: doc.content })), overwrite });
  }

  return (
    <div className="space-y-8">
      <SectionHeader title={t('documentation.title')} description={t('documentation.description')} />


      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_12%,var(--surface-1)),var(--surface-1)_48%,color-mix(in_srgb,var(--info)_7%,var(--surface-1)))] p-5 sm:p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge tone="accent">{t('documentation.map.title')}</Badge>
            <p className="text-sm leading-6 text-[color:var(--muted)]">{t('documentation.map.description')}</p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs text-[color:var(--muted)]">
              <span className="rounded-full border border-[color:var(--border)] px-3 py-1">Blueprint</span>
              <span className="rounded-full border border-[color:var(--border)] px-3 py-1">Prompt Master</span>
              <span className="rounded-full border border-[color:var(--border)] px-3 py-1">Gatekeeper</span>
              <span className="rounded-full border border-[color:var(--border)] px-3 py-1">Registry</span>
            </div>
          </div>
          <Network className="hidden h-24 w-24 shrink-0 text-[color:var(--accent)] opacity-70 xl:block" aria-hidden />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {knowledgeMap.map(([title, value, detail]) => (
            <article key={title} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/10 p-4">
              <p className="text-sm font-semibold text-[color:var(--text)]">{t(title)}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--accent)]">{t(value)}</p>
              <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">{t(detail)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="space-y-4 p-5">
          <div>
            <Badge>{t('documentation.lifecycle.title')}</Badge>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('documentation.description')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {lifecycle.map(([title, detail], index) => (
              <div key={title} className="flex gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-xs font-semibold text-[color:var(--accent)]">{index + 1}</span>
                <div>
                  <p className="text-sm font-medium text-[color:var(--text)]">{t(title)}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{t(detail)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col justify-between gap-5 p-5">
          <div className="space-y-3">
            <Badge tone={documentedProjects.length > 0 ? 'success' : 'warning'}>{t('documentation.projects')}</Badge>
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              {documentedProjects.length > 0 ? t('documentation.selectProject') : t('documentation.noProjects')}
            </p>
          </div>
          <Link href="/projects" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-[color:var(--control-hover)]">
            {t('projects.title')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Card>
      </section>
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.3fr_0.9fr]">
        {/* LEFT — projects + documents (or generated drafts) */}
        <Card className="space-y-5 p-5">
          <div className="space-y-3">
            <Badge tone="accent">{t('documentation.projects')}</Badge>
            {documentedProjects.length === 0 ? (
              <p className="text-sm leading-6 text-[color:var(--muted)]">{t('documentation.noProjects')}</p>
            ) : (
              <ul className="space-y-1">
                {documentedProjects.map((project) => {
                  const active = project.project_id === activeProjectId;
                  return (
                    <li key={project.project_id}>
                      <button
                        type="button"
                        onClick={() => switchProject(project.project_id)}
                        className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm ${
                          active
                            ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--text)]'
                            : 'text-[color:var(--muted)] hover:bg-white/5'
                        }`}
                      >
                        <FolderGit2 className="h-4 w-4 shrink-0" />
                        <span className="truncate">{project.project_name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {activeProjectId ? (
            <div className="space-y-3">
              <Badge>{generated ? t('documentation.drafts') : t('documentation.documents')}</Badge>
              {generated ? (
                <ul className="space-y-1">
                  {generated.map((doc) => {
                    const active = doc.id === selectedGenId;
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedGenId(doc.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm ${
                            active
                              ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--text)]'
                              : 'text-[color:var(--muted)] hover:bg-white/5'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{doc.title}</span>
                          </span>
                          <Badge tone={doc.mode === 'llm' ? 'accent' : 'warning'} className="shrink-0">
                            {doc.mode === 'llm' ? t('documentation.aiBadge') : t('documentation.deterministicBadge')}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <>
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('documentation.search')}
                  />
                  {library.isLoading ? (
                    <p className="text-sm text-[color:var(--muted)]">{t('documentation.loading')}</p>
                  ) : library.isError ? (
                    <p className="text-sm text-[color:var(--danger)]">{t('documentation.error')}</p>
                  ) : (
                    <ul className="space-y-1">
                      {filteredDocs.map((doc) => {
                        const active = doc.path === selectedDocPath;
                        return (
                          <li key={doc.id}>
                            <button
                              type="button"
                              disabled={!doc.present}
                              onClick={() => doc.path && setSelectedDocPath(doc.path)}
                              className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
                                active
                                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--text)]'
                                  : 'text-[color:var(--muted)] hover:bg-white/5'
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate">{doc.title}</span>
                              </span>
                              <Badge tone={STATUS_TONE[doc.status]} className="shrink-0">
                                {t(`documentation.status.${doc.status}`)}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : null}
        </Card>

        {/* CENTER — preview (real file) or AI draft review */}
        <Card className="space-y-4 p-5">
          {generated && selectedGen ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Badge tone={selectedGen.mode === 'llm' ? 'accent' : 'warning'}>
                  {selectedGen.mode === 'llm' ? t('documentation.aiBadge') : t('documentation.deterministicBadge')}
                </Badge>
                <Button
                  variant="ghost"
                  onClick={() => regenerate(selectedGen.id)}
                  loading={generateMutation.isPending}
                >
                  {t('documentation.regenerate')}
                </Button>
              </div>
              <p className="text-xs text-[color:var(--muted)]">{t('documentation.previewBeforeSave')}</p>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-black/20 p-4 text-sm leading-6 text-[color:var(--text)] [overflow-wrap:anywhere]">
                {selectedGen.content}
              </pre>
              {selectedGen.sources.length > 0 ? (
                <p className="text-xs text-[color:var(--muted)]">
                  {t('documentation.sources')}: {selectedGen.sources.join(', ')}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <Badge>{t('documentation.preview')}</Badge>
                {selectedDoc ? <span className="text-xs text-[color:var(--muted)]">{selectedDoc.path}</span> : null}
              </div>
              {!selectedDoc ? (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  {activeProjectId ? t('documentation.selectDoc') : t('documentation.selectProject')}
                </p>
              ) : !selectedDoc.present ? (
                <p className="text-sm leading-6 text-[color:var(--warning)]">{t('documentation.missingDoc')}</p>
              ) : preview.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">{t('documentation.loading')}</p>
              ) : preview.isError ? (
                <p className="text-sm text-[color:var(--danger)]">{t('documentation.error')}</p>
              ) : (
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-black/20 p-4 text-sm leading-6 text-[color:var(--text)] [overflow-wrap:anywhere]">
                  {preview.data?.content ?? ''}
                </pre>
              )}
              {selectedDoc && selectedDoc.issues.length > 0 ? (
                <div className="space-y-1 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-3">
                  <p className="text-xs font-medium text-[color:var(--warning)]">{t('documentation.issues')}</p>
                  {selectedDoc.issues.map((issue) => (
                    <p key={issue} className="text-xs leading-5 text-[color:var(--muted)]">
                      • {issue}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Card>

        {/* RIGHT — AI writer + score + validation + export */}
        <Card className="space-y-5 p-5">
          {activeProjectId ? (
            <div className="space-y-2">
              <Badge tone="accent">{t('documentation.aiSection')}</Badge>
              {generated ? (
                <>
                  <Button variant="primary" className="w-full" loading={saveMutation.isPending} onClick={saveGenerated}>
                    {saveMutation.isPending ? t('documentation.saving') : t('documentation.saveDraft')}
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                    <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                    {t('documentation.overwrite')}
                  </label>
                  <Button variant="ghost" className="w-full" onClick={() => setGenerated(null)}>
                    {t('documentation.backToLibrary')}
                  </Button>
                  {saveMutation.data ? (
                    <p className="text-xs leading-5 text-[color:var(--success)]">
                      {t('documentation.saveDone', {
                        written: saveMutation.data.saved.filter((item) => item.written).length,
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <LlmGatedAction
                  capability="documentation_generation"
                  usageLabel={t('documentation.generate')}
                  compact
                  onRun={() => runGenerate()}
                >
                  {(open) => (
                    <Button
                      variant="soft"
                      className="w-full"
                      loading={generateMutation.isPending}
                      onClick={open}
                    >
                      <Sparkles className="h-4 w-4" />
                      {generateMutation.isPending ? t('documentation.generating') : t('documentation.generate')}
                    </Button>
                  )}
                </LlmGatedAction>
              )}
            </div>
          ) : null}

          {library.data ? (
            <>
              <div className="space-y-2">
                <Badge>{t('documentation.score')}</Badge>
                <div className="flex items-baseline gap-2">
                  <span className="ds-page-title text-[color:var(--text)]">{library.data.score}</span>
                  <span className="text-sm text-[color:var(--muted)]">/ 100</span>
                  <Badge tone={scoreTone(library.data.score)} className="ml-auto">
                    {t('documentation.present', {
                      present: library.data.present_count,
                      required: library.data.required_count,
                    })}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Badge>{t('documentation.validation')}</Badge>
                <ul className="space-y-2">
                  {library.data.checks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-sm">
                      {check.status === 'passed' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success)]" />
                      ) : check.status === 'failed' ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--danger)]" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning)]" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-[color:var(--text)]">{check.label}</span>
                        <span className="block text-xs leading-5 text-[color:var(--muted)]">{check.message}</span>
                      </span>
                      <Badge tone={CHECK_TONE[check.status]} className="ml-auto shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>

              {library.data.findings.length > 0 ? (
                <div className="space-y-2">
                  <Badge tone="danger">{t('documentation.findings')}</Badge>
                  <ul className="space-y-1">
                    {library.data.findings.map((finding, index) => (
                      <li key={`${finding.code}-${index}`} className="text-xs leading-5 text-[color:var(--muted)]">
                        <span className="text-[color:var(--text)]">{finding.path ?? finding.category}</span> — {finding.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                  <input type="checkbox" checked={organize} onChange={(event) => setOrganize(event.target.checked)} />
                  {t('documentation.organize')}
                </label>
                <Button
                  variant="primary"
                  className="w-full"
                  loading={exportMutation.isPending}
                  disabled={!library.data.safe || library.data.missing_required.length > 0}
                  onClick={() => exportMutation.mutate(organize)}
                >
                  {exportMutation.isPending ? t('documentation.exporting') : t('documentation.export')}
                </Button>
                {exportMutation.data?.exported ? (
                  <p className="text-xs leading-5 text-[color:var(--success)]">
                    {t(exportMutation.data.organized ? 'documentation.organized' : 'documentation.exported', {
                      dir: exportMutation.data.docs_dir ?? '/docs',
                    })}
                  </p>
                ) : exportMutation.data?.blocked ? (
                  <p className="text-xs leading-5 text-[color:var(--danger)]">
                    {t('documentation.exportBlocked', { reason: exportMutation.data.reason ?? '' })}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-[color:var(--muted)]">{t('documentation.selectProject')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
