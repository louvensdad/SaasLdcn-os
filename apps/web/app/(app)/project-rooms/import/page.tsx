'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, FileUp, Loader2, Upload } from 'lucide-react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import type { ImportPromptMasterFormat } from '@contracts/project-room.contract';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useLocale } from '@/hooks/use-locale';

type Tab = 'upload' | 'paste' | 'json';

const TAB_FORMAT: Record<Tab, ImportPromptMasterFormat> = {
  upload: 'markdown',
  paste: 'text',
  json: 'json',
};

export default function ImportPromptMasterPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upload');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setContent(await file.text());
    if (!title) setTitle(file.name.replace(/\.md$/i, ''));
  }

  async function handleImport() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const room = await projectRoomsClient.importPromptMaster({
        format: TAB_FORMAT[tab],
        content,
        title: title.trim() || t('projectRooms.import.title'),
        locale,
      });
      // Unified journey: jump straight into the Meta-Factory with the project loaded.
      router.push(`/meta-factory?projectId=${room.room_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('projectRooms.actionError'));
      setSubmitting(false);
    }
  }

  const tabs: Tab[] = ['upload', 'paste', 'json'];
  const tabLabel: Record<Tab, string> = {
    upload: t('projectRooms.import.tabUpload'),
    paste: t('projectRooms.import.tabPaste'),
    json: t('projectRooms.import.tabJson'),
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/project-rooms"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('projectRooms.back')}
      </Link>

      <Card className="p-7">
        <div className="ds-caption mb-2 flex items-center gap-2 text-[color:var(--muted)]">
          <Upload className="h-4 w-4" />
          {t('projectRooms.import.title')}
        </div>
        <h1 className="mb-2 text-xl font-semibold text-[color:var(--text)]">{t('projectRooms.import.title')}</h1>
        <p className="mb-6 text-sm text-[color:var(--muted)]">{t('projectRooms.import.description')}</p>

        <label className="mb-1 block text-sm font-medium text-[color:var(--text)]">
          {t('projectRooms.titleLabel')}
        </label>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('projectRooms.titlePlaceholder')}
          className="mb-5"
        />

        <div className="mb-4 flex gap-1 rounded-[var(--radius-md)] border border-[color:var(--border)] p-1">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                'flex-1 rounded-[var(--radius-sm,8px)] px-3 py-1.5 text-sm transition',
                tab === item
                  ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:var(--text)]'
                  : 'text-[color:var(--muted)] hover:text-[color:var(--text)]',
              )}
            >
              {tabLabel[item]}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <label className="mb-6 flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] bg-white/[0.02] px-4 py-10 text-center text-sm text-[color:var(--muted)] hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]">
            <FileUp className="h-6 w-6" />
            <span>{fileName || t('projectRooms.import.uploadHint')}</span>
            <input
              type="file"
              accept=".md,text/markdown,text/plain"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </label>
        ) : (
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              tab === 'json' ? t('projectRooms.import.jsonPlaceholder') : t('projectRooms.import.pastePlaceholder')
            }
            rows={10}
            className="focus-ring mb-6 w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3 font-mono text-xs text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
          />
        )}

        {error ? <p className="mb-4 text-sm text-[color:var(--danger,#f87171)]">{error}</p> : null}

        <Button
          variant="primary"
          onClick={handleImport}
          disabled={submitting || !content.trim()}
          className="w-full"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t('projectRooms.import.submit')}
        </Button>
      </Card>
    </div>
  );
}
