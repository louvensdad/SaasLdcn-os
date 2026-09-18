'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Icon, Signal } from '@/components/signal';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { isLocale, LOCALE_LABEL, LOCALES } from '@/lib/i18n/locales';
import { screenHelp } from '@/lib/learn/screen-help';
import {
  applyDensity, applyDeveloper, applyMotion, applyTheme, readDensity, readDeveloper, readMotion, readTheme,
  type Density, type MotionMode, type ThemeMode,
} from '@/lib/preferences';
import { currentAppUrl, destinationFor, RAIL, RAIL_BOTTOM, type Destination } from '@/lib/routes';
import { useSession } from '@/lib/session/session';
import { familyFor } from '@/lib/status';
import { useWork } from '@/lib/work/use-work';

import { CommandPalette } from './command-palette';
import { LearnPanel } from './learn-panel';
import { SignalStrip } from './signal-strip';

const THEME_ORDER: readonly ThemeMode[] = ['system', 'dark', 'light'];

export function AppShell({ children }: { readonly children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { state, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [density, setDensity] = useState<Density>('comfortable');
  const [motion, setMotion] = useState<MotionMode>('full');
  const [developer, setDeveloper] = useState(false);
  /** The bar carries two standing facts: what is waiting on a person, and which provider is answering. */
  const { decisions } = useWork();
  const llm = useQuery({ queryKey: ['llm-active'], queryFn: api.llmActive });
  /* The sidebar names the workspace a person is in. Its own read, so a failure here
     shows as an unknown name instead of taking a screen down. */
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces, retry: false });
  const projectKey = pathname.startsWith('/p/') ? decodeURIComponent(pathname.split('/')[2] ?? '') : '';
  /** The scope nav shows the project's own name; the read is the same one its screens make. */
  const projectRoom = useQuery({
    queryKey: ['room', projectKey],
    queryFn: () => api.room(projectKey),
    enabled: Boolean(projectKey),
    retry: false,
  });

  useEffect(() => {
    setTheme(readTheme());
    setDensity(readDensity());
    setMotion(readMotion());
    setDeveloper(readDeveloper());
  }, []);

  useEffect(() => {
    setPanelOpen(false);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === '?' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setPanelOpen(true);
      } else if (event.key === 'Escape') {
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openLearnPanel = useCallback(() => setPanelOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    applyTheme(next);
    setTheme(next);
  };
  const toggleDensity = () => {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    applyDensity(next);
    setDensity(next);
  };
  const toggleMotion = () => {
    const next: MotionMode = motion === 'reduced' ? 'full' : 'reduced';
    applyMotion(next);
    setMotion(next);
  };
  const toggleDeveloper = () => {
    applyDeveloper(!developer);
    setDeveloper(!developer);
  };
  const leave = async () => {
    await signOut();
    router.replace('/signin');
  };

  const active = destinationFor(pathname)?.id;
  const inLearn = pathname === '/learn' || pathname.startsWith('/learn/');
  const inInbox = pathname === '/inbox' || pathname.startsWith('/inbox/');
  const projectBase = `/p/${encodeURIComponent(projectKey)}`;
  const section = inLearn
    ? { label: 'nav.learnSection' as const, name: t('nav.learn'), items: [['/learn', 'nav.learnStart'], ['/learn/terms', 'nav.learnTerms']] as const }
    : inInbox
      ? { label: 'nav.inbox' as const, name: t('nav.inbox'), items: [['/inbox', 'nav.decisions'], ['/inbox/activity', 'nav.activity']] as const }
      : pathname === '/workforce' || pathname.startsWith('/workforce/')
        ? {
            label: 'nav.workforce' as const,
            name: t('nav.workforce'),
            items: [['/workforce', 'workforce.seats.title'], ['/workforce/planner', 'workforce.planner']] as const,
          }
        : pathname === '/platform' || pathname.startsWith('/platform/')
          ? {
              label: 'nav.platform' as const,
              name: t('nav.platform'),
              items: [
                ['/platform', 'platform.title'],
                ['/platform/decisions', 'platform.decisions'],
                ['/platform/roadmap', 'platform.roadmap'],
                ['/platform/config', 'config.title'],
              ] as const,
            }
        : pathname === '/settings' || pathname.startsWith('/settings/')
          ? {
              label: 'nav.settings' as const,
              name: t('nav.settings'),
              items: [
                ['/settings/ai', 'settings.section.ai'],
                ['/settings/plan', 'settings.section.plan'],
                ['/settings/account', 'settings.section.account'],
                ['/settings/workspace', 'settings.section.workspace'],
                ['/settings/preferences', 'settings.section.preferences'],
                ['/settings/integrations', 'settings.section.integrations'],
              ] as const,
            }
        : pathname === '/studio' || pathname.startsWith('/studio/')
          ? {
              label: 'nav.studio' as const,
              name: t('nav.studio'),
              items: [
                ['/studio', 'studio.title'],
                ['/studio/data', 'studio.section.data'],
                ['/studio/automations', 'studio.section.automations'],
              ] as const,
            }
        : pathname === '/library' || pathname.startsWith('/library/')
          ? {
              label: 'nav.library' as const,
              name: t('nav.library'),
              items: [
                ['/library', 'library.title'],
                ['/library/technology', 'nav.technology'],
                ['/library/templates', 'nav.templates'],
                ['/library/knowledge', 'nav.knowledge'],
                ['/library/marketplace', 'nav.marketplace'],
                ['/library/certification', 'library.section.certification'],
                ['/library/research', 'nav.research'],
              ] as const,
            }
          : projectKey
        ? {
            label: 'nav.project' as const,
            name: projectRoom.data?.title ?? projectKey,
            items: [
              [projectBase, 'nav.cockpit'],
              [`${projectBase}/define/discovery`, 'nav.discovery'],
              [`${projectBase}/define/requirements`, 'nav.requirements'],
              [`${projectBase}/define/architecture`, 'nav.architecture'],
              [`${projectBase}/define/review`, 'nav.review'],
              [`${projectBase}/missions`, 'nav.missions'],
              [`${projectBase}/engineering`, 'nav.engineering'],
              [`${projectBase}/runtime`, 'nav.runtime'],
              [`${projectBase}/evidence`, 'nav.evidence'],
              [`${projectBase}/delivery`, 'nav.delivery'],
              [`${projectBase}/governance`, 'nav.governance'],
              [`${projectBase}/memory`, 'nav.memory'],
            ] as const,
          }
        : null;
  const providerNote = llm.data
    ? !llm.data.hasKey
      ? t('shell.provider.none')
      : llm.data.validationIsStale
        ? t('shell.provider.stale')
        : t('shell.provider.ready')
    : '';
  /* An unresolved read is named as unknown, never replaced by a plausible workspace. */
  const workspace = workspaces.data?.[0];
  const workspaceName = workspace?.name ?? (workspaces.isError ? t('signal.unknown') : '—');
  const workspaceInitials = (workspace?.name ?? '?').slice(0, 2).toUpperCase();
  const help = screenHelp(pathname);
  const user = state.status === 'signed-in' ? state.user : null;
  const initials = (user?.full_name ?? user?.email ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  /* The redesign's first correction: the destinations carry their names, not just icons
     (REDESIGN.md §1). Activity keeps its Destination -- the palette and the scope tab still
     reach it -- but it is not a second top-level entry beside the Decisions it belongs to. */
  const railItem = (destination: Destination) => {
    const label = t(destination.label);
    const count = destination.id === 'inbox' ? decisions.length : 0;
    const current = active === destination.id || (destination.id === 'inbox' && active === 'activity');
    return (
      <Link key={destination.id} className="rail-item" href={destination.path} aria-current={current ? 'page' : undefined}>
        <Icon name={destination.icon} />
        <span className="rail-name">{label}</span>
        {count > 0 ? <b className="rail-badge num">{count}</b> : null}
      </Link>
    );
  };

  /** A scope tab is current on its own page and below it — except the project's cockpit, which is only itself. */
  const scopeCurrent = (href: string) => pathname === href || (href !== projectBase && pathname.startsWith(`${href}/`));

  return (
    <>
      <a className="skip-link" href="#main">{t('common.skip')}</a>
      <div className={`app ground${panelOpen ? ' has-panel' : ''}`}>
        <nav className="rail" aria-label={t('nav.global')}>
          <Link className="rail-mark" href="/">
            <svg aria-hidden="true"><use href="#i-mark" /></svg>
            <span className="rail-brand">
              <b>{t('app.name')}</b>
              <small>{t('app.tagline')}</small>
            </span>
          </Link>
          <Link className="rail-ws" href="/settings/workspace">
            <span className="avatar" aria-hidden="true">{workspaceInitials}</span>
            <span className="rail-ws-name">
              <strong>{workspaceName}</strong>
              <small>{t('nav.workspaceHint')}</small>
            </span>
          </Link>
          <div className="rail-group">
            <span className="label">{t('nav.groupWork')}</span>
            {RAIL.filter((destination) => destination.id !== 'activity').map(railItem)}
          </div>
          <div className="rail-group">
            <span className="label">{t('nav.groupEnvironment')}</span>
            {RAIL_BOTTOM.map(railItem)}
          </div>
          <span className="rail-spacer" />
          <button className="btn btn-quiet btn-sm rail-signout" type="button" onClick={leave}>{t('shell.signOut')}</button>
        </nav>
        <div className="main">
          <header className="ctxbar">
            <nav className="crumbs" aria-label={t('nav.breadcrumb')}>
              <Link className="crumb" href="/">{t('app.name')}</Link>
              {pathname.startsWith('/learn/') ? (
                <>
                  <span className="crumb-sep">/</span>
                  <Link className="crumb" href="/learn">{t('nav.learnSection')}</Link>
                </>
              ) : null}
              <span className="crumb-sep">/</span>
              <span className="crumb is-current" aria-current="page">{t(help.name)}</span>
            </nav>
            <div className="ctx-right">
              <button className="searchbtn" type="button" onClick={() => setPaletteOpen(true)} aria-label={t('shell.searchAria')}>
                <Icon name="search" />
                <span>{t('shell.search')}</span>
                <span className="kbd">Ctrl K</span>
              </button>
              <Link className="btn btn-primary btn-sm startbtn" href="/new" title={t('nav.start')} aria-label={t('nav.start')}>
                <Icon name="start" />
                <span>{t('nav.start')}</span>
              </Link>
              <Link
                className={`inbox-chip${decisions.length > 0 ? ' is-waiting' : ''}`}
                href="/inbox"
                title={t('shell.inbox', { count: decisions.length })}
                aria-label={t('shell.inbox', { count: decisions.length })}
              >
                <Signal family={decisions.length > 0 ? 'hand' : 'idle'} />
                <span className="num">{decisions.length}</span>
              </Link>
              {llm.data ? (
                <a className="provider-chip" href={currentAppUrl('/settings')} title={providerNote} aria-label={providerNote}>
                  <Signal family={familyFor(llm.data.status)} />
                  <b>{llm.data.providerLabel ?? llm.data.provider ?? '—'}</b>
                </a>
              ) : null}
              <span className="ctx-tools">
                <button className="iconbtn" type="button" onClick={() => setPanelOpen((open) => !open)} aria-pressed={panelOpen} aria-label={t('shell.learnAbout')} title={`${t('shell.learnAbout')} (?)`}>
                  <Icon name="learn" />
                </button>
                <button
                  className="iconbtn devbtn"
                  type="button"
                  onClick={toggleDeveloper}
                  aria-pressed={developer}
                  aria-label={t('shell.dev', { state: t(developer ? 'state.on' : 'state.off') })}
                  title={t('shell.dev', { state: t(developer ? 'state.on' : 'state.off') })}
                >
                  <Icon name="dev" />
                </button>
                <button
                  className="iconbtn motionbtn"
                  type="button"
                  onClick={toggleMotion}
                  aria-pressed={motion === 'reduced'}
                  aria-label={t('shell.motion', { mode: t(`motion.${motion}`) })}
                  title={t('shell.motion', { mode: t(`motion.${motion}`) })}
                >
                  <Icon name="motion" />
                </button>
                <button className="iconbtn" type="button" onClick={cycleTheme} aria-label={t('shell.theme', { mode: t(`theme.${theme}`) })} title={t('shell.theme', { mode: t(`theme.${theme}`) })}>
                  <Icon name="theme" />
                </button>
                <button className="iconbtn densitybtn" type="button" onClick={toggleDensity} aria-label={t('shell.density', { mode: t(`density.${density}`) })} title={t('shell.density', { mode: t(`density.${density}`) })}>
                  <Icon name="density" />
                </button>
              </span>
              <select className="locale-select" aria-label={t('shell.language')} value={locale} onChange={(event) => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
                {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_LABEL[code]}</option>)}
              </select>
              <span className="avatar" title={user?.email ?? ''} aria-label={t('shell.account')}>{initials}</span>
            </div>
          </header>
          {section ? (
            <nav className="scopebar" aria-label={t(section.label)}>
              <span className="scope-name">
                <span className="scope-kind">{t(section.label)}</span>
                <b>{section.name}</b>
              </span>
              <span className="scope-tabs">
                {section.items.map(([href, label]) => (
                  <Link key={href} className="scope-tab" href={href} aria-current={scopeCurrent(href) ? 'page' : undefined}>{t(label)}</Link>
                ))}
              </span>
            </nav>
          ) : null}
          <div className="stage">
            <div className="canvas-row">
              <main className="canvas" id="main" tabIndex={-1}>
                {/* Keyed by the path: a new place arrives once (m2), the same place re-rendering never moves. */}
                <div className="canvas-inner is-arriving" key={pathname}>{children}</div>
              </main>
              {panelOpen ? (
                <aside className="ctxpanel" aria-label={t('panel.label')}>
                  <LearnPanel onClose={() => setPanelOpen(false)} />
                </aside>
              ) : null}
            </div>
          </div>
          <SignalStrip />
        </div>
      </div>
      <nav className="bottombar" aria-label={t('nav.global')}>
        <Link href="/" aria-current={active === 'command' ? 'page' : undefined}><Icon name="command" />{t('nav.home')}</Link>
        <Link href="/projects" aria-current={active === 'projects' ? 'page' : undefined}><Icon name="projects" />{t('nav.projects')}</Link>
        <Link href="/inbox" aria-current={active === 'inbox' ? 'page' : undefined}>
          <Icon name="inbox" />{t('nav.decisions')}
          {decisions.length > 0 ? <span className="rail-count num" aria-hidden="true">{decisions.length}</span> : null}
        </Link>
        <Link href="/inbox/activity" aria-current={active === 'activity' ? 'page' : undefined}><Icon name="activity" />{t('nav.activity')}</Link>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label={t('shell.searchAria')}><Icon name="search" />{t('shell.searchShort')}</button>
      </nav>
      {paletteOpen ? <CommandPalette onClose={closePalette} onLearnAbout={openLearnPanel} /> : null}
    </>
  );
}
