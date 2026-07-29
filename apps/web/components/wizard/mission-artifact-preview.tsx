'use client';

import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import type { MissionArtifact } from '@contracts/mission.contract';

interface Props {
  readonly artifact: MissionArtifact;
  readonly fileBaseName: string;
}

export function MissionArtifactPreview({ artifact, fileBaseName }: Props) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleExport() {
    const blob = new Blob([artifact.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBaseName}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={handleCopy} className="px-2 py-1 text-xs">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('missions.artifact.copied') : t('missions.artifact.copy')}
        </Button>
        <Button variant="secondary" onClick={handleExport} className="px-2 py-1 text-xs">
          <Download className="h-3.5 w-3.5" />
          {t('missions.artifact.export')}
        </Button>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-4 text-xs leading-6 text-[color:var(--text)]">
        {artifact.content}
      </pre>
    </div>
  );
}
