'use client';

import { create } from 'zustand';

import {
  apiClient,
  setAccessToken,
  setUnauthorizedHandler,
} from '@/lib/api/client';
import type {
  UserLoginRequest,
  UserPublic,
  UserRegisterRequest,
} from '@/lib/api/types';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: UserPublic | null;
  readonly error: string | null;
  initialize: () => Promise<void>;
  login: (payload: UserLoginRequest) => Promise<void>;
  register: (payload: UserRegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
  setUser: (user: UserPublic) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to complete authentication.';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,
  error: null,

  initialize: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading', error: null });
    try {
      const response = await apiClient.refreshSession();
      setAccessToken(response.tokens.access_token);
      set({ status: 'authenticated', user: response.user });
    } catch {
      setAccessToken(null);
      set({ status: 'unauthenticated', user: null });
    }
  },

  login: async (payload) => {
    set({ status: 'loading', error: null });
    try {
      const response = await apiClient.login(payload);
      setAccessToken(response.tokens.access_token);
      set({ status: 'authenticated', user: response.user });
    } catch (error) {
      setAccessToken(null);
      set({ status: 'unauthenticated', user: null, error: errorMessage(error) });
      throw error;
    }
  },

  register: async (payload) => {
    set({ status: 'loading', error: null });
    try {
      const response = await apiClient.register(payload);
      setAccessToken(response.tokens.access_token);
      set({ status: 'authenticated', user: response.user });
    } catch (error) {
      setAccessToken(null);
      set({ status: 'unauthenticated', user: null, error: errorMessage(error) });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiClient.logout();
    } finally {
      get().clearSession();
    }
  },

  clearSession: () => {
    setAccessToken(null);
    set({ status: 'unauthenticated', user: null, error: null });
  },

  setUser: (user) => set({ user }),
}));

setUnauthorizedHandler(() => useAuthStore.getState().clearSession());
