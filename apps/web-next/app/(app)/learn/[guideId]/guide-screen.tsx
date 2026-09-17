'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/signal';
import { Kv, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { guideFor, guidesFor, termsFor } from '@/lib/learn/content';
import { useLearnPrefs } from '@/lib/learn/prefs';
import { screenLink } from '@/lib/learn/screen-paths';
import { currentAppUrl } from '@/lib/routes';

export function GuideScreen({ guideId }: { readonly guideId: string }) {
  const { t, locale } = useI18n();
  const { guides, native } = guidesFor(locale);
  const guide = guideFor(locale, guideId);
  const { prefs, markRead, saving, saveFailed } = useLearnPrefs();
  const glossary = useQuery({ queryKey: ['glossary'], queryFn: api.glossary });
  /* The guide's first screen is its call to action; a screen id resolves to a route here whenever it exists. */
  const head = guide?.screens[0];
  const firstScreen = head ? (head.path ? { href: head.path, needsChoice: false } : screenLink(head.id)) : null;

  if (!guide) {
    return (
      <StateBlock
        kind="unknown"
        title={t('guide.notFound.title', { id: guideId })}
        action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href="/learn">{t('guide.allGuides')}</Link></div>}
      >
        {t('guide.notFound.body')}
      </StateBlock>
    );
  }

  const index = guides.findIndex((item) => item.id === guide.id);
  const previous = guides[index - 1];
  const following = guides[index + 1];
  const read = prefs.readGuides.includes(guide.id);
  const vocabulary = termsFor(locale);

  const list = (items: readonly string[]) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
  const sections: readonly (readonly [string, string, ReactNode])[] = [
    ['what', t('guide.what'), <p key="what">{guide.what}</p>],
    ['why', t('guide.why'), <p key="why">{guide.why}</p>],
    ['how', t('guide.how'), <ol key="how">{guide.how.map((step) => <li key={step}>{step}</li>)}</ol>],
    ['give', t('guide.giveGet'), <Kv key="give" pairs={[[t('guide.give'), guide.give], [t('guide.get'), guide.get]]} />],
    ...(guide.who ? [['who', t('guide.who'), list(guide.who)] as const] : []),
    ...(guide.files ? [['files', t('guide.files'), list(guide.files)] as const] : []),
    ['limits', t('guide.limits'), list(guide.limits)],
    ['good', t('guide.good'), list(guide.good)],
    ['trouble', t('guide.trouble'), <Kv key="trouble" pairs={guide.trouble.map(([problem, fix]) => [problem, fix] as const)} />],
    ...(guide.faq ? [['faq', t('guide.faq'), <Kv key="faq" pairs={guide.faq.map(([question, answer]) => [question, answer] as const)} />] as const] : []),
    ['screens', t('guide.screens'), (
      <div className="list" key="screens">
        {guide.screens.map((screen) => {
          const link = screen.path ? { href: screen.path, needsChoice: false } : screenLink(screen.id);
          if (!link) {
            return (
              <a className="li li-link" href={currentAppUrl(screen.current ?? '/')} key={screen.id}>
                <Icon name="external" className="sig" />
                <span className="li-title">{screen.label} <span className="mono muted" style={{ fontSize: 11 }}>{screen.id}</span></span>
                <span className="li-sub">{t('common.currentApp')}</span>
              </a>
            );
          }
          return (
            <Link className="li li-link" href={link.href} key={screen.id}>
              <Icon name="chevron" className="sig" />
              <span className="li-title">{screen.label} <span className="mono muted" style={{ fontSize: 11 }}>{screen.id}</span></span>
              {link.needsChoice ? <span className="li-sub">{t('guide.pickFirst')}</span> : null}
            </Link>
          );
        })}
      </div>
    )],
    ...(guide.terms && guide.terms.length > 0 ? [['terms', t('guide.terms'), (
      <Kv
        key="terms"
        pairs={guide.terms.map((name) => {
          const own = vocabulary.find((term) => term.term === name);
          if (own) return [own.term, own.meaning] as const;
          const fromGlossary = glossary.data?.find((term) => term.term === name || term.aliases.includes(name));
          return [name, fromGlossary ? <span key={name}>{fromGlossary.definition} <span className="meta">{t('guide.glossary')}</span></span> : <span key={name} className="meta">{t('terms.glossary.error')}</span>] as const;
        })}
      />
    )] as const] : []),
    ...(guide.api ? [['api', t('guide.api'), <ul key="api">{guide.api.map((entry) => <li className="mono" style={{ fontSize: 12.5 }} key={entry}>{entry}</li>)}</ul>] as const] : []),
  ];

  const scrollTo = (id: string) => {
    document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('guide.eyebrow', { area: t(`area.${guide.area}`) })}</span>
            <span className="chip">{guide.from ? `${t('guide.adapted')} · ${guide.from}` : t('guide.new')}</span>
          </div>
          <h1 className="title">{guide.title}</h1>
          <p className="lede">{guide.summary}</p>
          {!native ? <p className="meta">{t('learn.guides.languageNote')}</p> : null}
        </div>
        <div className="btn-row">
          {firstScreen ? (
            <Link className="btn btn-primary" href={firstScreen.href}>{t('guide.open', { screen: guide.screens[0]?.label ?? '' })}</Link>
          ) : (
            <a className="btn btn-primary ext-mark" href={currentAppUrl(guide.screens[0]?.current ?? '/')}>{t('guide.open', { screen: guide.screens[0]?.label ?? '' })} <Icon name="external" /></a>
          )}
          <button className="btn btn-ghost" type="button" onClick={() => markRead(guide.id)} disabled={read || saving}>
            {read ? t('guide.read') : t('guide.markRead')}
          </button>
        </div>
      </div>
      {saveFailed ? <p className="meta">{t('guide.saveFailed')}</p> : null}
      <div className="doc">
        <nav className="doc-toc" aria-label={t('guide.toc')}>
          {sections.map(([id, label], position) => (
            <a href={`#g-${id}`} key={id} onClick={(event) => { event.preventDefault(); scrollTo(id); }}>
              <span className="n">{String(position + 1).padStart(2, '0')}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <article className="doc-body">
          {sections.map(([id, label, node]) => (
            <section key={id}>
              <h2 id={`g-${id}`}>{label}</h2>
              {node}
            </section>
          ))}
          <div className="divider" style={{ margin: '28px 0 14px' }} />
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            {previous ? <Link className="btn btn-quiet btn-sm" href={`/learn/${previous.id}`}>← {previous.title}</Link> : <span />}
            {following ? <Link className="btn btn-quiet btn-sm" href={`/learn/${following.id}`}>{following.title} →</Link> : null}
          </div>
          <Source>{guide.from ? `frontend content · adapted from apps/web service-detail-content.ts (${guide.from})` : 'frontend content · written from the backend facts its screens cite'}</Source>
        </article>
      </div>
    </>
  );
}
