'use client';

import type { ReactNode } from 'react';

import { Icon, Signal, type Family } from '@/components/signal';
import { Badge, Source } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';

/** The floating inspector of a drawing: what the selected node is, the backend's word for it, and where it was read. */
export function Inspector({ eyebrow, title, family, state, live, source, onClose, children }: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly family: Family;
  /** The backend value, verbatim. */
  readonly state?: string;
  readonly live?: boolean;
  /** Endpoint and field: shown with the developer details. */
  readonly source?: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <aside className="g-inspect" aria-label={title}>
      <div className="g-inspect-head">
        <Signal family={family} live={live} />
        <div className="grow">
          {eyebrow ? <span className="label">{eyebrow}</span> : null}
          <h3 className="h-sub">{title}</h3>
        </div>
        <button className="iconbtn" type="button" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
      </div>
      {state ? <div><Badge value={state} family={family} live={live} /></div> : null}
      {children}
      {source ? <Source>{source}</Source> : null}
    </aside>
  );
}
