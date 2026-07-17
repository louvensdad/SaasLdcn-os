'use client';

import { useEffect, useRef } from 'react';

import { userPreferencesClient } from '@/lib/api/user-preferences';
import {
  interfacePreferencesSnapshot,
  useInterfacePreferencesStore,
  type InterfacePreferencesSnapshot,
} from '@/stores/use-interface-preferences-store';
import { aiPreferencesSnapshot, useAiPreferencesStore, type AiPreferencesSnapshot } from '@/stores/use-ai-preferences-store';
import { useAdvancedSettingsStore, type AdvancedSettingsState } from '@/stores/use-advanced-settings-store';
import { useGitPreferencesStore, type GitPreferencesState } from '@/stores/use-git-preferences-store';
import { useLocaleStore, type LocaleState } from '@/stores/use-locale-store';
import { usePersonalPreferencesStore, type PersonalPreferencesState } from '@/stores/use-personal-preferences-store';

const PERSIST_DEBOUNCE_MS = 800;
type Category = 'interface' | 'ai' | 'personal' | 'git' | 'advanced' | 'locale';

function snapshotPersonal() {
  const state = usePersonalPreferencesStore.getState();
  return {
    timezone: state.timezone,
    dateFormat: state.dateFormat,
    timeFormat: state.timeFormat,
    emailNotifications: state.emailNotifications,
    weeklySummary: state.weeklySummary,
  };
}

function snapshotGit() {
  const state = useGitPreferencesStore.getState();
  return {
    signCommits: state.signCommits,
    protectedBranchChecks: state.protectedBranchChecks,
    autoSync: state.autoSync,
    autoCleanup: state.autoCleanup,
  };
}

function snapshotAdvanced() {
  return { devMode: useAdvancedSettingsStore.getState().devMode };
}

function snapshotLocale() {
  const state = useLocaleStore.getState();
  return {
    interfaceLocale: state.interfaceLocale,
    generatedProjectLocale: state.generatedProjectLocale,
    documentationLocale: state.documentationLocale,
    codeCommentsLocale: state.codeCommentsLocale,
    fallbackLocale: state.fallbackLocale,
  };
}

/** Hydrates and debounced-persists every user-owned Settings category. Local
 * Zustand persistence remains the fast offline cache; the API is the durable
 * source of truth after authentication. */
export function useSyncPreferencesToBackend(enabled: boolean): void {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      try {
        const [interfaceBlob, aiBlob, personalBlob, gitBlob, advancedBlob, localeBlob] = await Promise.all([
          userPreferencesClient.getInterface(),
          userPreferencesClient.getAi(),
          userPreferencesClient.getCategory('personal'),
          userPreferencesClient.getCategory('git'),
          userPreferencesClient.getCategory('advanced'),
          userPreferencesClient.getCategory('locale'),
        ]);
        if (interfaceBlob.data) useInterfacePreferencesStore.getState().importAll(interfaceBlob.data as Partial<InterfacePreferencesSnapshot>);
        if (aiBlob.data) useAiPreferencesStore.getState().importAll(aiBlob.data as unknown as AiPreferencesSnapshot);
        if (personalBlob.data) usePersonalPreferencesStore.getState().importAll(personalBlob.data as unknown as Partial<Pick<PersonalPreferencesState, 'timezone' | 'dateFormat' | 'timeFormat' | 'emailNotifications' | 'weeklySummary'>>);
        if (gitBlob.data) useGitPreferencesStore.getState().importAll(gitBlob.data as unknown as Partial<Omit<GitPreferencesState, 'set' | 'importAll'>>);
        if (advancedBlob.data) useAdvancedSettingsStore.getState().importAll(advancedBlob.data as unknown as Partial<Pick<AdvancedSettingsState, 'devMode'>>);
        if (localeBlob.data) useLocaleStore.getState().importAll(localeBlob.data as unknown as Partial<LocaleState>);
      } catch {
        // Offline or an older server: local persisted values remain active.
      }
    })();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timers = new Map<Category, number>();
    const schedule = (category: Category, persist: () => void) => {
      const previous = timers.get(category);
      if (previous !== undefined) window.clearTimeout(previous);
      timers.set(category, window.setTimeout(persist, PERSIST_DEBOUNCE_MS));
    };

    const unsubInterface = useInterfacePreferencesStore.subscribe((state) => {
      const snapshot = interfacePreferencesSnapshot(state);
      schedule('interface', () => void userPreferencesClient.setInterface(snapshot as unknown as Record<string, unknown>).catch(() => undefined));
    });
    const unsubAi = useAiPreferencesStore.subscribe((state) => {
      const snapshot = aiPreferencesSnapshot(state);
      schedule('ai', () => void userPreferencesClient.setAi(snapshot as unknown as Record<string, unknown>).catch(() => undefined));
    });
    const unsubPersonal = usePersonalPreferencesStore.subscribe(() => {
      schedule('personal', () => void userPreferencesClient.setCategory('personal', snapshotPersonal()).catch(() => undefined));
    });
    const unsubGit = useGitPreferencesStore.subscribe(() => {
      schedule('git', () => void userPreferencesClient.setCategory('git', snapshotGit()).catch(() => undefined));
    });
    const unsubAdvanced = useAdvancedSettingsStore.subscribe(() => {
      schedule('advanced', () => void userPreferencesClient.setCategory('advanced', snapshotAdvanced()).catch(() => undefined));
    });
    const unsubLocale = useLocaleStore.subscribe(() => {
      schedule('locale', () => void userPreferencesClient.setCategory('locale', snapshotLocale()).catch(() => undefined));
    });

    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      unsubInterface();
      unsubAi();
      unsubPersonal();
      unsubGit();
      unsubAdvanced();
      unsubLocale();
    };
  }, [enabled]);
}