'use client';

import type { LocaleCode, LocalePreference } from '@contracts/locale.contract';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocaleState extends LocalePreference {
  hasHydrated: boolean;
  setInterfaceLocale: (locale: LocaleCode) => void;
  setGeneratedProjectLocale: (locale: LocaleCode) => void;
  setDocumentationLocale: (locale: LocaleCode) => void;
  setCodeCommentsLocale: (locale: LocaleCode) => void;
  setFallbackLocale: (locale: LocaleCode) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      interfaceLocale: 'pt-BR',
      generatedProjectLocale: 'pt-BR',
      documentationLocale: 'pt-BR',
      codeCommentsLocale: 'pt-BR',
      fallbackLocale: 'pt-BR',
      hasHydrated: false,
      setInterfaceLocale: (interfaceLocale) => set({ interfaceLocale }),
      setGeneratedProjectLocale: (generatedProjectLocale) => set({ generatedProjectLocale }),
      setDocumentationLocale: (documentationLocale) => set({ documentationLocale }),
      setCodeCommentsLocale: (codeCommentsLocale) => set({ codeCommentsLocale }),
      setFallbackLocale: (fallbackLocale) => set({ fallbackLocale }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated })
    }),
    {
      name: 'ldcn-locale-preferences',
      partialize: (state) => ({
        interfaceLocale: state.interfaceLocale,
        generatedProjectLocale: state.generatedProjectLocale,
        documentationLocale: state.documentationLocale,
        codeCommentsLocale: state.codeCommentsLocale,
        fallbackLocale: state.fallbackLocale
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true)
    }
  )
);
