'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Icon } from '@/components/signal';
import { Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';

/** The library's sections. All six live here; research is honest about the read model it does not have. */
type Section = 'certification' | 'technology' | 'templates' | 'knowledge' | 'marketplace' | 'research';

interface Body {
  readonly section: Section;
  /** What the registry serves for this section, summed; null when a read did not answer, or when no read exists. */
  readonly count: number | null;
  readonly gap: boolean;
}

const count = (...reads: readonly UseQueryResult<number>[]): number | null =>
  reads.every((read) => read.isSuccess) ? reads.reduce((sum, read) => sum + (read.data ?? 0), 0) : null;

/**
 * The library as a universe: the core in the middle and one body per section in orbit, each sized by the count its
 * reads serve. Research has no read endpoint (gap G3), so it is drawn as a dashed body with a question mark.
 */
export function LibraryScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const compositions = useQuery({ queryKey: ['compositions'], queryFn: api.compositions, select: (data) => data.compositions.length, retry: false });
  const languages = useQuery({ queryKey: ['registry-languages'], queryFn: api.registryLanguages, select: (data) => data.length, retry: false });
  const stacks = useQuery({ queryKey: ['registry-stacks'], queryFn: api.registryStacks, select: (data) => data.length, retry: false });
  const infrastructure = useQuery({ queryKey: ['infrastructure-components'], queryFn: api.infrastructureComponents, select: (data) => data.length, retry: false });
  const templates = useQuery({ queryKey: ['template-catalog'], queryFn: api.templateCatalog, select: (data) => data.templates.length, retry: false });
  const skills = useQuery({ queryKey: ['skill-catalog'], queryFn: api.skillCatalog, select: (data) => data.skills.length, retry: false });
  const teams = useQuery({ queryKey: ['team-memory-teams'], queryFn: api.teamMemoryTeams, select: (data) => data.teams.length, retry: false });
  const marketplace = useQuery({ queryKey: ['marketplace-items'], queryFn: api.marketplaceItems, select: (data) => data.length, retry: false });

  const bodies: readonly Body[] = [
    { section: 'certification', count: count(compositions), gap: false },
    { section: 'technology', count: count(languages, stacks, infrastructure), gap: false },
    { section: 'templates', count: count(templates, skills), gap: false },
    { section: 'knowledge', count: count(teams), gap: false },
    { section: 'marketplace', count: count(marketplace), gap: false },
    { section: 'research', count: null, gap: true },
  ];

  const size = 520;
  const c = size / 2;
  const orbit = 188;
  const radius = (body: Body) => (body.count === null ? 30 : Math.min(58, 26 + 6 * Math.sqrt(body.count)));

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('library.title')}</h1>
          <p className="lede">{t('library.lede')}</p>
        </div>
      </div>

      <div className="grid g-main-side universe-grid">
        <section className="universe cc-card" aria-labelledby="universe-title">
          <div className="panel-head"><h2 className="h-sub" id="universe-title">{t('library.universe.title')}</h2><span className="meta">{t('library.universe.meta')}</span></div>
          <svg className="universe-svg" viewBox={`0 0 ${size} ${size}`} role="group" aria-label={t('library.universe.title')}>
            <circle className="uv-orbit" cx={c} cy={c} r={orbit} />
            <circle className="uv-orbit is-inner" cx={c} cy={c} r={orbit * 0.46} />
            {bodies.map((body, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / bodies.length;
              const x = c + orbit * Math.cos(angle);
              const y = c + orbit * Math.sin(angle);
              return <line key={`ray-${body.section}`} className={`uv-ray${body.gap ? ' is-gap' : ''}`} x1={c} y1={c} x2={x} y2={y} />;
            })}
            <g className="uv-core">
              <circle cx={c} cy={c} r={46} />
              <svg x={c - 13} y={c - 22} width={26} height={26} aria-hidden="true"><use href="#i-library" /></svg>
              <text x={c} y={c + 20} textAnchor="middle">{t('nav.library')}</text>
            </g>
            {bodies.map((body, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / bodies.length;
              const x = c + orbit * Math.cos(angle);
              const y = c + orbit * Math.sin(angle);
              const r = radius(body);
              const name = t(`library.section.${body.section}`);
              const value = body.gap ? t('library.universe.noEndpoint') : body.count === null ? t('library.universe.unread') : String(body.count);
              return (
                <g
                  key={body.section}
                  role="link"
                  tabIndex={0}
                  className={`uv-body${body.gap ? ' is-gap' : body.count === null ? ' is-unread' : ''}`}
                  aria-label={`${name}: ${value}`}
                  onClick={() => router.push(`/library/${body.section}`)}
                  onKeyDown={(event) => { if (event.key === 'Enter') router.push(`/library/${body.section}`); }}
                >
                  <circle cx={x} cy={y} r={r} />
                  <text className="uv-count" x={x} y={y + 5} textAnchor="middle">{body.gap ? '?' : body.count === null ? '—' : body.count}</text>
                  <text className="uv-name" x={x} y={y + r + 16} textAnchor="middle">{name}</text>
                </g>
              );
            })}
          </svg>
          <p className="meta universe-note">{t('library.universe.note')}</p>
        </section>

        <section className="sec">
          <div className="list">
            {bodies.map((body) => (
              <Link className="li li-link" key={body.section} href={`/library/${body.section}`}>
                <Icon name="chevron" className="sig" />
                <span className="li-title">{t(`library.section.${body.section}`)}</span>
                <span className="meta num">{body.gap ? t('library.universe.gap') : body.count === null ? t('library.universe.unread') : body.count}</span>
                <span className="li-sub">{t(`library.body.${body.section}`)}</span>
              </Link>
            ))}
          </div>
          <Source>GET /api/workforce/compositions · /api/registry/languages · /api/registry/stacks · /api/infrastructure/components · /api/templates/catalog · /api/skills · /api/team-memory/teams · /api/marketplace/items</Source>
        </section>
      </div>
    </>
  );
}
