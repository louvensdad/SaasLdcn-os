'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/use-locale';
import type { DeliveryType, PreferredLanguage } from '@contracts/project-room.contract';

const DELIVERY_TYPES: DeliveryType[] = ['web', 'backend', 'mobile', 'full_stack'];

// '' = auto (AI suggests). Labels are proper nouns — no i18n needed except for auto.
const PREFERRED_LANGUAGES: { id: PreferredLanguage; label: string }[] = [
  { id: '', label: '' }, // label resolved via i18n (auto)
  { id: 'python', label: 'Python' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#/.NET' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'kotlin', label: 'Kotlin' },
];

export default function NewProjectRoomPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('web');
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const room = await projectRoomsClient.create({
        title: title.trim() || t('projectRooms.createTitle'),
        raw_intent: idea.trim(),
        locale,
        delivery_type: deliveryType,
        preferred_language: preferredLanguage,
      });
      router.push(`/project-rooms/${room.room_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('projectRooms.actionError'));
      setSubmitting(false);
    }
  }

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
          <Sparkles className="h-4 w-4" />
          {t('projectRooms.createTitle')}
        </div>
        <h1 className="mb-6 text-xl font-semibold text-[color:var(--text)]">{t('projectRooms.createTitle')}</h1>

        <label className="mb-1 block text-sm font-medium text-[color:var(--text)]">
          {t('projectRooms.titleLabel')}
        </label>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('projectRooms.titlePlaceholder')}
          className="mb-5"
        />

        <label className="mb-1 block text-sm font-medium text-[color:var(--text)]">
          {t('projectRooms.deliveryTypeLabel')}
        </label>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DELIVERY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDeliveryType(type)}
              aria-pressed={deliveryType === type}
              className={`focus-ring rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${
                deliveryType === type
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                  : 'border-[color:var(--border)] bg-white/5 text-[color:var(--text)] hover:bg-white/10'
              }`}
            >
              {t(`projectRooms.deliveryType.${type}`)}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-[color:var(--text)]">
          {t('projectRooms.languageLabel')}
        </label>
        <p className="mb-2 text-xs text-[color:var(--muted)]">{t('projectRooms.languageHint')}</p>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PREFERRED_LANGUAGES.map(({ id, label }) => (
            <button
              key={id || 'auto'}
              type="button"
              onClick={() => setPreferredLanguage(id)}
              aria-pressed={preferredLanguage === id}
              className={`focus-ring rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${
                preferredLanguage === id
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                  : 'border-[color:var(--border)] bg-white/5 text-[color:var(--text)] hover:bg-white/10'
              }`}
            >
              {id === '' ? t('projectRooms.language.auto') : label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-[color:var(--text)]">
          {t('projectRooms.ideaLabel')}
        </label>
        <textarea
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={t('projectRooms.ideaPlaceholder')}
          rows={5}
          className="focus-ring mb-6 w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
        />

        {error ? <p className="mb-4 text-sm text-[color:var(--danger,#f87171)]">{error}</p> : null}

        <Button variant="primary" onClick={handleCreate} disabled={submitting} className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {submitting ? t('projectRooms.creating') : t('projectRooms.create')}
        </Button>
      </Card>
    </div>
  );
}
