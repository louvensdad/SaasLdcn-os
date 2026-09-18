'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FAMILIES, Icon, Signal, type Family } from '@/components/signal';
import { Kv } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';
import { guideFor, signalsFor, termsFor } from '@/lib/learn/content';
import { screenHelp } from '@/lib/learn/screen-help';

/** “Learn about this screen”: the question the screen answers, its guide, the signals it shows and its terms. */
export function LearnPanel({ onClose }: { readonly onClose: () => void }) {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const help = screenHelp(pathname);
  const guide = help.guide ? guideFor(locale, help.guide) : null;
  const [families, setFamilies] = useState<readonly Family[]>([]);

  useEffect(() => {
    // Read the signals actually drawn on the screen, so the panel explains what the person is looking at.
    const found = new Set<string>();
    document.querySelectorAll('#main .sig').forEach((element) => {
      const match = element.getAttribute('class')?.match(/\bs-(\w+)/);
      if (match) found.add(match[1]);
    });
    setFamilies(FAMILIES.filter((family) => found.has(family)));
  }, [pathname]);

  const meanings = signalsFor(locale).filter((signal) => families.includes(signal.family));
  const vocabulary = termsFor(locale);
  const terms = (guide?.terms ?? []).map((name) => vocabulary.find((term) => term.term === name)).filter((term) => term !== undefined).slice(0, 3);

  return (
    <>
      <div className="cp-head">
        <div className="grow">
          <span className="label">{t('nav.learn')}</span>
          <h2 className="h-sec">{t(help.name)}</h2>
        </div>
        <button className="iconbtn" type="button" onClick={onClose} aria-label={t('panel.close')}>
          <Icon name="close" />
        </button>
      </div>
      <div className="cp-body">
        <Kv pairs={[[t('panel.answers'), t(help.question)], [t('panel.mainAction'), t(help.action)]]} />
        {guide ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">{t('panel.guide')}</span>
            <div className="list">
              <Link className="li li-link" href={`/learn/${guide.id}`} onClick={onClose}>
                <Icon name="learn" className="sig" />
                <span className="li-title">{guide.title}</span>
                <span className="li-sub">{guide.summary}</span>
              </Link>
            </div>
          </div>
        ) : (
          <p className="meta">{t('panel.noGuide')}</p>
        )}
        {meanings.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">{t('panel.signals')}</span>
            <div className="list">
              {meanings.map((signal) => (
                <div className="li" key={signal.family}>
                  <Signal family={signal.family} />
                  <span className="li-title">{t(`signal.${signal.family}`)}</span>
                  <span className="li-sub">{signal.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {terms.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">{t('panel.terms')}</span>
            <Kv pairs={terms.map((term) => [term.term, term.meaning] as const)} />
          </div>
        ) : null}
        <div className="btn-row">
          <Link className="btn btn-ghost btn-sm" href="/learn" onClick={onClose}>{t('panel.allGuides')}</Link>
          <Link className="btn btn-quiet btn-sm" href="/learn/terms" onClick={onClose}>{t('nav.learnTerms')}</Link>
        </div>
      </div>
    </>
  );
}
