'use client';

import { useQuery } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

/** A skill that cannot call a model, an agent or an external service is worth saying out loud. */
function safetyChips(metadata: { readonly no_ai: boolean; readonly no_agents: boolean; readonly no_external_integrations: boolean }, t: (key: 'skills.noAi' | 'skills.noAgents' | 'skills.noExternal') => string) {
  const chips: string[] = [];
  if (metadata.no_ai) chips.push(t('skills.noAi'));
  if (metadata.no_agents) chips.push(t('skills.noAgents'));
  if (metadata.no_external_integrations) chips.push(t('skills.noExternal'));
  return chips;
}

export function TemplatesScreen() {
  const { t } = useI18n();
  const templates = useQuery({ queryKey: ['template-catalog'], queryFn: api.templateCatalog, retry: false });
  const skills = useQuery({ queryKey: ['skill-catalog'], queryFn: api.skillCatalog, retry: false });

  const items = templates.data?.templates ?? [];
  const catalog = skills.data?.skills ?? [];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('templates.title')}</h1>
          <p className="lede">{t('templates.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('templates.catalog.title')}</h2>
          <span className="meta">{t('templates.catalog.meta', { count: items.length })}</span>
        </div>

        {templates.isPending ? <Skeleton lines={4} /> : null}
        {templates.isError ? <StateBlock kind="error" title={t('templates.unreadable')}>{t('templates.unreadableBody')}</StateBlock> : null}
        {templates.data && items.length === 0 ? <StateBlock kind="empty" title={t('templates.none')}>{t('templates.noneBody')}</StateBlock> : null}

        <div className="list">
          {items.map((item) => (
            <div className="li" key={item.id}>
              <Signal family={familyFor(item.maturity)} label={item.name} />
              <span className="li-title">{item.name}</span>
              <span className="li-aux">
                <Badge value={item.maturity} family={familyFor(item.maturity)} />
                <span className="meta mono">v{item.version}</span>
              </span>
              <span className="li-sub">{item.description}</span>
              <div className="chips">
                <span className="chip mono">{item.category}</span>
                <span className="chip mono">{t('templates.complexity', { value: item.complexity })}</span>
                {item.supported_languages.slice(0, 3).map((language) => <span className="chip mono" key={language}>{language}</span>)}
              </div>
            </div>
          ))}
        </div>
        <Source>GET /api/templates/catalog</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('skills.title')}</h2>
          <span className="meta">{t('skills.meta', { count: catalog.length })}</span>
        </div>

        {skills.isPending ? <Skeleton lines={4} /> : null}
        {skills.isError ? <StateBlock kind="error" title={t('skills.unreadable')}>{t('skills.unreadableBody')}</StateBlock> : null}
        {skills.data && catalog.length === 0 ? <StateBlock kind="empty" title={t('skills.none')}>{t('skills.noneBody')}</StateBlock> : null}

        <div className="list">
          {catalog.map((skill) => (
            <div className="li" key={skill.id}>
              <Signal family={familyFor(skill.metadata.maturity)} label={skill.name} />
              <span className="li-title">{skill.name}</span>
              <span className="li-aux">
                <Badge value={skill.metadata.execution_mode} family={skill.metadata.safe ? 'proof' : 'caution'} />
                <span className="meta mono">{skill.category}</span>
              </span>
              <span className="li-sub">{skill.description}</span>
              <div className="chips">
                <span className="chip mono">{skill.metadata.maturity}</span>
                {safetyChips(skill.metadata, t).map((chip) => <span className="chip" key={chip}>{chip}</span>)}
                {skill.requirements.length > 0 ? <span className="chip">{t('skills.requires', { count: skill.requirements.length })}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <Source>GET /api/skills</Source>
      </section>

      <p className="meta" style={{ marginTop: 16 }}>{t('skills.note')}</p>
    </>
  );
}
