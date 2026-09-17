'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, GapChip, Live, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { signalsFor, termsFor } from '@/lib/learn/content';

const LIVE_ROWS = [
  ['live', 'pulse', 'terms.live.live', 'terms.live.liveBody'],
  ['stale', 'caution', 'terms.live.stale', 'terms.live.staleBody'],
  ['paused', 'stop', 'terms.live.paused', 'terms.live.pausedBody'],
  ['snapshot', 'idle', 'terms.live.snapshot', 'terms.live.snapshotBody'],
] as const;

export function TermsScreen() {
  const { t, locale } = useI18n();
  const glossary = useQuery({ queryKey: ['glossary'], queryFn: api.glossary });
  const [filter, setFilter] = useState('');

  const needle = filter.trim().toLowerCase();
  const vocabulary = termsFor(locale).filter((term) => !needle || `${term.term} ${term.meaning} ${term.where}`.toLowerCase().includes(needle));
  const terms = (glossary.data ?? []).filter((term) => !needle || `${term.term} ${term.definition} ${term.aliases.join(' ')}`.toLowerCase().includes(needle));
  const nothing = needle !== '' && vocabulary.length === 0 && terms.length === 0;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('terms.eyebrow')}</span></div>
          <h1 className="title">{t('terms.title')}</h1>
          <p className="lede">{t('terms.lede')}</p>
        </div>
        <div className="field" style={{ minWidth: 'min(280px, 100%)' }}>
          <label htmlFor="terms-filter">{t('terms.find')}</label>
          <input id="terms-filter" type="search" placeholder={t('terms.findPlaceholder')} value={filter} onChange={(event) => setFilter(event.target.value)} />
        </div>
      </div>

      <div className="grid g-2">
        <section className="panel">
          <div className="panel-head"><h2 className="h-sub">{t('terms.signals.title')}</h2><span className="meta">{t('terms.signals.meta')}</span></div>
          <div className="panel-body">
            <div className="list" data-legend="">
              {signalsFor(locale).map((signal) => (
                <div className="li" key={signal.family}>
                  <Signal family={signal.family} />
                  <span className="li-title">{t(`signal.${signal.family}`)}</span>
                  <span className="meta">{signal.shape}</span>
                  <span className="li-sub">{signal.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="stack-lg">
          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('terms.live.title')}</h2></div>
            <div className="panel-body">
              <div className="list" data-legend="">
                {LIVE_ROWS.map(([state, family, label, body]) => (
                  <div className="li" key={state}>
                    <Signal family={family} />
                    <span className="li-title"><Live state={state}>{t(label)}</Live></span>
                    <span className="li-sub">{t(body)}</span>
                  </div>
                ))}
              </div>
              <p className="meta" style={{ marginTop: 8 }}>{t('terms.live.note')}</p>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('terms.badges.title')}</h2></div>
            <div className="panel-body stack">
              {/* Examples of the badge, not badges about anything: the same legend rule as the signal list above. */}
              <div className="row" data-legend="" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Badge value="PROMPT_APPROVED" family="proof" human={t('terms.badges.approved')} />
                <Badge value="META_FACTORY_RUNNING" family="pulse" human={t('terms.badges.generating')} />
                <Badge value="STALE" family="caution" human={t('terms.badges.stale')} />
              </div>
              <p className="meta">{t('terms.badges.note')}</p>
            </div>
          </section>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('terms.vocab.title')}</h2>
          <span className="meta">{t('terms.vocab.meta', { count: vocabulary.length })}</span>
        </div>
        <div className="tbl-wrap">
          <table style={{ width: '100%' }}>
            <thead><tr><th>{t('terms.col.term')}</th><th>{t('terms.col.meaning')}</th><th>{t('terms.col.where')}</th></tr></thead>
            <tbody>
              {vocabulary.map((term) => (
                <tr key={term.term}>
                  <td><strong>{term.term}</strong></td>
                  <td className="ink2">{term.meaning}</td>
                  <td className="meta">{term.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('terms.glossary.title')}</h2>
          <span className="meta">{t('terms.glossary.meta', { count: terms.length })}</span>
        </div>
        {glossary.isPending ? <Skeleton lines={4} /> : null}
        {glossary.isError ? <StateBlock kind="unknown" title={t('terms.glossary.error')} /> : null}
        {glossary.data ? (
          <div className="tbl-wrap">
            <table style={{ width: '100%' }}>
              <thead><tr><th>{t('terms.col.term')}</th><th>{t('terms.col.definition')}</th><th>{t('terms.col.aliases')}</th></tr></thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id}>
                    <td><strong>{term.term}</strong><div className="id">{term.id}</div></td>
                    <td className="ink2" lang="pt-BR">{term.definition}</td>
                    <td>{term.aliases.length > 0 ? term.aliases.map((alias) => <span className="chip" key={alias}>{alias}</span>) : <span className="meta">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 8 }}>{t('terms.glossary.note')} <GapChip id="G18" detail="Glossary is Portuguese-only and lacks the interface vocabulary" /></p>
        <Source>GET /api/language-model/glossary</Source>
      </section>

      {nothing ? <p className="meta">{t('terms.empty')}</p> : null}
    </>
  );
}
