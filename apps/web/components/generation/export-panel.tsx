'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, GitBranch, Github, Loader2, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGitProviderConnection } from '@/hooks/use-git-providers';
import { useLocale } from '@/hooks/use-locale';
import {
  generatedExportClient,
  type GenerationSurface,
  type GeneratedProjectExportResponse,
} from '@/lib/api/generated-export';
import type { GitProvider } from '@contracts/git-provider.contract';

interface ExportPanelProps {
  readonly surface: GenerationSurface;
  readonly projectId: string;
  readonly defaultRepoName: string;
}

export function ExportPanel({ surface, projectId, defaultRepoName }: ExportPanelProps) {
  const { t } = useLocale();
  const github = useGitProviderConnection('github');
  const gitlab = useGitProviderConnection('gitlab');
  const [namespace, setNamespace] = useState('');
  const [repoName, setRepoName] = useState(defaultRepoName);
  const [branch, setBranch] = useState('main');
  const [visibility, setVisibility] = useState<'private' | 'public' | 'internal'>('private');
  const [busy, setBusy] = useState<GitProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedProjectExportResponse | null>(null);

  const preferredNamespace = useMemo(() => {
    const connected = [github.data, gitlab.data].find((item) => item?.status === 'connected');
    return connected?.username ?? connected?.namespaces?.[0] ?? '';
  }, [github.data, gitlab.data]);

  useEffect(() => {
    if (!namespace && preferredNamespace) setNamespace(preferredNamespace);
  }, [namespace, preferredNamespace]);

  async function handleExport(provider: GitProvider) {
    setBusy(provider);
    setError(null);
    setResult(null);
    try {
      const exported = await generatedExportClient.exportProject(surface, projectId, provider, {
        namespace: namespace.trim(),
        repo_name: repoName.trim(),
        branch: branch.trim() || 'main',
        commit_message: 'Initial generated project export',
        visibility,
      });
      setResult(exported);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generationExport.error'));
    } finally {
      setBusy(null);
    }
  }

  const githubConnected = github.data?.status === 'connected';
  const gitlabConnected = gitlab.data?.status === 'connected';
  const formReady = namespace.trim().length > 0 && repoName.trim().length > 0 && branch.trim().length > 0;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('generationExport.title')}</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium text-muted-foreground">
          {t('generationExport.namespace')}
          <Input value={namespace} onChange={(e) => setNamespace(e.target.value)} className="mt-1 h-10 rounded-xl" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          {t('generationExport.repository')}
          <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} className="mt-1 h-10 rounded-xl" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          {t('generationExport.branch')}
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1 h-10 rounded-xl" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'private' | 'public' | 'internal')}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="private">{t('generationExport.private')}</option>
          <option value="public">{t('generationExport.public')}</option>
          <option value="internal">{t('generationExport.internal')}</option>
        </select>
        <Button
          type="button"
          onClick={() => void handleExport('github')}
          disabled={!formReady || !githubConnected || busy !== null}
          className="rounded-xl"
        >
          {busy === 'github' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          GitHub
        </Button>
        <Button
          type="button"
          onClick={() => void handleExport('gitlab')}
          disabled={!formReady || !gitlabConnected || busy !== null}
          className="rounded-xl"
        >
          {busy === 'gitlab' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
          GitLab
        </Button>
        {(!githubConnected || !gitlabConnected) && (
          <a href="/settings#integrations" className="text-xs font-medium text-indigo-500 hover:underline">
            {t('generationExport.connectProvider')}
          </a>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">{error}</p>}
      {result?.repo_url && (
        <a
          href={result.repo_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
        >
          {t('generationExport.exported')}: {result.repo_url}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </section>
  );
}
