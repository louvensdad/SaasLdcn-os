'use client';

import { useCallback, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, UploadCloud, X } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { StudentDocumentError, studentEligibilityClient, type StudentVerificationView } from '@/lib/api/student-eligibility';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png';
const MAX_BYTES = 10 * 1024 * 1024;

const RESUBMITTABLE_STATUSES = ['REJECTED', 'REVALIDATION_REQUIRED', 'EXPIRED'];

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING_VERIFICATION: 'neutral',
  VERIFIED: 'success',
  REJECTED: 'danger',
  REVALIDATION_REQUIRED: 'warning',
  EXPIRED: 'warning',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StudentDocumentUploadProps {
  readonly verification: StudentVerificationView | null;
  readonly onSubmitted: (record: StudentVerificationView) => void;
}

export function StudentDocumentUpload({ verification, onSubmitted }: StudentDocumentUploadProps) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);

  const canResubmit = verification === null || RESUBMITTABLE_STATUSES.includes(verification.student_status);

  function validate(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) return t('studentVerification.upload.invalidType');
    if (file.size > MAX_BYTES) return t('studentVerification.upload.tooLarge');
    return null;
  }

  function pickFile(file: File) {
    const error = validate(file);
    setValidationError(error);
    setSelectedFile(error ? null : file);
    setPhase('idle');
    setUploadError(null);
  }

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) pickFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!selectedFile) return;
    setPhase('uploading');
    setProgress(0);
    setUploadError(null);
    try {
      const record = await studentEligibilityClient.submit(selectedFile, setProgress);
      setPhase('success');
      setSelectedFile(null);
      onSubmitted(record);
    } catch (caught) {
      setPhase('error');
      setUploadError(caught instanceof StudentDocumentError ? caught.message : t('studentVerification.upload.error'));
    }
  }

  async function viewDocument() {
    setDocumentBusy(true);
    try {
      const blob = await studentEligibilityClient.document();
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch {
      // best-effort: the button simply stays actionable for a retry
    } finally {
      setDocumentBusy(false);
    }
  }

  const statusKey = verification
    ? {
        PENDING_VERIFICATION: 'studentVerification.status.pending',
        VERIFIED: 'studentVerification.status.verified',
        REJECTED: 'studentVerification.status.rejected',
        REVALIDATION_REQUIRED: 'studentVerification.status.revalidationRequired',
        EXPIRED: 'studentVerification.status.expired',
      }[verification.student_status]
    : 'studentVerification.status.none';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ds-caption">{t('studentVerification.status.title')}</span>
        <Badge tone={verification ? STATUS_TONE[verification.student_status] ?? 'neutral' : 'neutral'}>
          {t(statusKey ?? 'studentVerification.status.none')}
        </Badge>
        {verification?.student_notes ? <span className="ds-caption text-[color:var(--muted)]">— {verification.student_notes}</span> : null}
        {verification?.student_document ? (
          <Button variant="ghost" className="h-auto p-0 text-xs text-[color:var(--accent)]" loading={documentBusy} onClick={() => void viewDocument()}>
            {t('studentVerification.status.viewDocument')}
          </Button>
        ) : null}
      </div>

      {/* Lives outside the canResubmit branch below: a successful submission
          immediately flips `verification` to PENDING_VERIFICATION (not
          resubmittable), which would otherwise unmount this message before
          the user ever saw it. */}
      {phase === 'success' ? <p className="ds-caption text-[color:var(--success)]" role="status">{t('studentVerification.upload.success')}</p> : null}
      {phase === 'error' && uploadError ? <p className="ds-caption text-[color:var(--danger)]" role="alert">{uploadError}</p> : null}

      {canResubmit ? (
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            aria-label={t('studentVerification.upload.title')}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
            className="focus-ring flex flex-col items-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-6 text-center transition-colors"
            style={{
              borderColor: dragActive ? 'var(--accent)' : 'var(--border)',
              background: dragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
            }}
          >
            <UploadCloud className="h-6 w-6 text-[color:var(--muted)]" aria-hidden />
            <p className="text-sm font-semibold text-[color:var(--text)]">{t('studentVerification.upload.title')}</p>
            <p className="ds-caption">{t('studentVerification.upload.dragHint')}</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) pickFile(file);
              }}
            />
            <Button type="button" variant="secondary" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
              {t('studentVerification.upload.selectButton')}
            </Button>
            <p className="ds-metadata">{t('studentVerification.upload.accepted')}</p>
          </div>

          {validationError ? <p className="ds-caption text-[color:var(--danger)]" role="alert">{validationError}</p> : null}

          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--text)]">{selectedFile.name}</p>
                  <p className="ds-metadata">{formatBytes(selectedFile.size)}</p>
                </div>
              </div>
              {phase === 'uploading' ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" aria-hidden />
                  <span className="ds-caption">{t('studentVerification.upload.uploading', { percent: String(progress) })}</span>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" className="px-2" aria-label={t('studentVerification.upload.remove')} onClick={() => setSelectedFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button variant="primary" onClick={() => void submit()}>{t('studentVerification.upload.submit')}</Button>
                </div>
              )}
            </div>
          ) : null}

          {phase === 'uploading' ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-3)]">
              <div className="h-full rounded-full bg-[color:var(--accent)] transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}

        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
          <FileText className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
          <p className="ds-caption">{t('studentVerification.upload.pendingHint')}</p>
        </div>
      )}
    </div>
  );
}
