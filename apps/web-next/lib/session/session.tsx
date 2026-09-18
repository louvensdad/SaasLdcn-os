'use client';

import type { AuthResponse, UserPublic } from '@contracts/auth.contract';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/api';
import { onSessionEnded, refreshSession, setAccessToken } from '@/lib/api/http';

export type SessionState =
  | { readonly status: 'checking' }
  | { readonly status: 'signed-out'; readonly ended: boolean }
  | { readonly status: 'signed-in'; readonly user: UserPublic };

interface SessionApi {
  readonly state: SessionState;
  readonly signIn: (auth: AuthResponse) => void;
  readonly signOut: () => Promise<void>;
  /** Asks the server for a session from the refresh cookie (used on load and after a provider sign-in). */
  readonly restore: () => Promise<AuthResponse | null>;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' });

  const restore = useCallback(async () => {
    const auth = await refreshSession();
    setState(auth ? { status: 'signed-in', user: auth.user } : { status: 'signed-out', ended: false });
    return auth;
  }, []);

  useEffect(() => {
    onSessionEnded(() => setState({ status: 'signed-out', ended: true }));
    void restore();
    return () => onSessionEnded(null);
  }, [restore]);

  const signIn = useCallback((auth: AuthResponse) => {
    setAccessToken(auth.tokens.access_token);
    setState({ status: 'signed-in', user: auth.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Signing out locally still ends the session in this tab; the refresh cookie expires on its own.
    }
    setAccessToken(null);
    setState({ status: 'signed-out', ended: false });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut, restore }), [state, signIn, signOut, restore]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

const WORKSPACE_KEY = 'ldcn-next-workspace';

export function rememberWorkspace(workspaceId: string): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, workspaceId);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

export function rememberedWorkspace(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

/** Only same-app paths are accepted as a return address, never another origin. */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/api/')) return fallback;
  return value;
}
