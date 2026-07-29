'use client';

import { GraduationCap } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { StudentDocumentUpload } from '@/components/billing/student-document-upload';
import { useLocale } from '@/hooks/use-locale';
import type { StudentVerificationView } from '@/lib/api/student-eligibility';

interface StudentVerificationModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly verification: StudentVerificationView | null;
  readonly onSubmitted: (record: StudentVerificationView) => void;
}

export function StudentVerificationModal({ open, onClose, verification, onSubmitted }: StudentVerificationModalProps) {
  const { t } = useLocale();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billing.student.verify')}
      description={t('pricing.student.description')}
      icon={<GraduationCap className="h-5 w-5 text-[color:var(--accent)]" />}
      maxWidthClassName="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-xs leading-6 text-[color:var(--muted)]">{t('billing.student.reviewNote')}</p>
        <StudentDocumentUpload verification={verification} onSubmitted={onSubmitted} />
        <p className="text-xs text-[color:var(--muted)]">{t('billing.student.privacyNote')}</p>
      </div>
    </Modal>
  );
}
