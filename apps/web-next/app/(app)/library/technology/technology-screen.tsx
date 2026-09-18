'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { TechnologyGraph } from '@/components/drawings/technology-graph';
import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

type Tab = 'languages' | 'stacks' | 'infrastructure';

const TABS: readonly Tab[] = ['languages', 'stacks', 'infrastructure'];

export function TechnologyScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('languages');

  const languages = useQuery({ queryKey: ['registry-languages'], queryFn: api.registryLanguages, retry: false });
  const stacks = useQuery({ queryKey: ['registry-stacks'], queryFn: api.registryStacks, retry: false });
  const components = useQuery({ queryKey: ['infrastructure-components'], queryFn: api.infrastructureComponents, retry: false });
  const profiles = useQuery({ queryKey: ['test-room-profiles'], queryFn: api.testRoomProfiles, retry: false });
  const certifications = useQuery({ queryKey: ['stack-certifications'], queryFn: api.stackCertifications, retry: false });
  const compositions = useQuery({ queryKey: ['compositions'], queryFn: api.compositions, retry: false });

  const active = tab === 'languages' ? languages : tab === 'stacks' ? stacks : components;
  const count = active.data?.length ?? 0;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('technology.title')}</h1>
          <p className="lede">{t('technology.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('techmap.label')}</h2>
          <span className="meta">{t('techmap.note')}</span>
        </div>
        {profiles.isPending ? <Skeleton lines={4} /> : null}
        {profiles.isError ? <StateBlock kind="error" title={t('techmap.unreadable')} /> : null}
        {profiles.data ? (
          <TechnologyGraph
            profiles={profiles.data.profiles}
            records={certifications.isError ? null : certifications.data ?? []}
            compositions={compositions.data?.compositions ?? []}
          />
        ) : null}
        {certifications.isError ? <p className="meta">{t('techmap.ledgerUnreadable')}</p> : null}
        <Source>GET /api/test-room/profiles · GET /api/registry/stack-certifications · GET /api/workforce/compositions</Source>
      </section>

      <div className="tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            className="tab"
            onClick={() => setTab(id)}
          >
            {t(`technology.tab.${id}`)}
          </button>
        ))}
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t(`technology.tab.${tab}`)}</h2>
          <span className="meta">{t('technology.count', { count })}</span>
        </div>

        {active.isPending ? <Skeleton lines={5} /> : null}
        {active.isError ? <StateBlock kind="error" title={t('technology.unreadable')}>{t('technology.unreadableBody')}</StateBlock> : null}
        {active.data && count === 0 ? <StateBlock kind="empty" title={t('technology.none')}>{t('technology.noneBody')}</StateBlock> : null}

        {tab === 'languages' ? (
          <div className="list">
            {(languages.data ?? []).map((language) => (
              <div className="li" key={language.id}>
                <Signal family="idle" label={language.name} />
                <span className="li-title">{language.name}</span>
                <span className="meta mono">{language.ecosystem}</span>
                <span className="li-sub">{language.description}</span>
                <div className="chips">
                  <span className="chip mono">{t('technology.frameworks', { count: language.supported_frameworks.length })}</span>
                  <span className="chip mono">{t('technology.runtimes', { count: language.supported_runtimes.length })}</span>
                  <span className="chip mono">{t('technology.enterprise', { score: language.enterprise_score })}</span>
                  <span className="chip mono">{language.learning_curve}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'stacks' ? (
          <div className="list">
            {(stacks.data ?? []).map((stack) => (
              <div className="li" key={stack.id}>
                <Signal family={familyFor(stack.status)} label={stack.name} />
                <span className="li-title">{stack.name}</span>
                <Badge value={stack.status} family={familyFor(stack.status)} />
                <span className="li-sub">{stack.description}</span>
                <div className="chips">
                  <span className="chip mono">{stack.category}</span>
                  {stack.allowed_architectures.slice(0, 3).map((architecture) => (
                    <span className="chip mono" key={architecture}>{architecture}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'infrastructure' ? (
          <div className="list">
            {(components.data ?? []).map((component) => (
              <div className="li" key={component.id}>
                <Signal family="idle" label={component.name} />
                <span className="li-title">{component.name}</span>
                <span className="meta mono">{component.category}</span>
                <span className="li-sub">{component.summary}</span>
                <div className="chips">
                  <span className="chip mono">{component.provider}</span>
                  {component.best_for.slice(0, 3).map((use) => <span className="chip" key={use}>{use}</span>)}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Source>
          {tab === 'languages' ? 'GET /api/registry/languages' : tab === 'stacks' ? 'GET /api/registry/stacks' : 'GET /api/infrastructure/components'}
        </Source>
      </section>

      <p className="meta" style={{ marginTop: 16 }}>{t('technology.note')}</p>
    </>
  );
}
