'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { SystemStatusResponse } from '@/lib/api/types';
import { SYSTEM_CATALOG, type SystemCategory } from '@/lib/system/engine-icons';

export type SystemHealthStatus = 'healthy' | 'degraded' | 'down' | 'unavailable';

export interface SystemHealthItem {
  readonly id: string;
  readonly name: string;
  readonly category: SystemCategory;
  readonly status: SystemHealthStatus;
  readonly lastChecked: Date;
}

type ApiStatus = 'healthy' | 'warning' | 'blocked';

type ActiveSystemsResponseKey = keyof Pick<SystemStatusResponse, 'active_modules' | 'active_engines' | 'active_templates' | 'active_skills'>;

const CATEGORY_TO_RESPONSE_KEY: Record<SystemCategory, ActiveSystemsResponseKey> = {
  modules: 'active_modules',
  engines: 'active_engines',
  templates: 'active_templates',
  skills: 'active_skills',
};

const CATEGORY_TO_REGISTRY_ID: Partial<Record<SystemCategory, string>> = {
  engines: 'engines',
  templates: 'templates',
  skills: 'skills',
};

function normalizeSignalStatus(status?: ApiStatus): SystemHealthStatus {
  if (status === 'blocked') return 'down';
  if (status === 'warning') return 'degraded';
  return 'healthy';
}

function moduleSignalStatus(id: string, response: SystemStatusResponse): SystemHealthStatus {
  if (id === 'api') return normalizeSignalStatus(response.api_status.status);
  if (id === 'web') return normalizeSignalStatus(response.frontend_status.status);
  if (id === 'reports') {
    return normalizeSignalStatus(response.registry_health.find((signal) => signal.id === 'reports')?.status);
  }
  if (id === 'templates') {
    return normalizeSignalStatus(response.registry_health.find((signal) => signal.id === 'templates')?.status);
  }
  return 'healthy';
}

function buildHealthItems(response: SystemStatusResponse | undefined, failed: boolean, lastChecked: Date): readonly SystemHealthItem[] {
  return (Object.keys(SYSTEM_CATALOG) as SystemCategory[]).flatMap((category) => {
    const activeIds = response ? new Set(response[CATEGORY_TO_RESPONSE_KEY[category]]) : new Set<string>();
    const registryId = CATEGORY_TO_REGISTRY_ID[category];
    const registryStatus = registryId
      ? response?.registry_health.find((signal) => signal.id === registryId)?.status
      : undefined;
    const categoryStatus = normalizeSignalStatus(registryStatus);

    return SYSTEM_CATALOG[category].map((id) => {
      let status: SystemHealthStatus = 'unavailable';

      if (!failed && response) {
        if (!activeIds.has(id)) {
          status = 'degraded';
        } else if (category === 'modules') {
          status = moduleSignalStatus(id, response);
        } else {
          status = categoryStatus;
        }
      }

      return {
        id,
        name: id,
        category,
        status,
        lastChecked,
      };
    });
  });
}

export function useSystemHealth() {
  const query = useQuery<SystemStatusResponse>({
    queryKey: ['api', 'system-status'],
    queryFn: () => apiClient.getSystemStatus(),
    staleTime: 30_000,
    retry: 1,
  });

  const lastChecked = useMemo(() => new Date(query.dataUpdatedAt || Date.now()), [query.dataUpdatedAt]);

  const items = useMemo(
    () => buildHealthItems(query.data, query.isError, lastChecked),
    [lastChecked, query.data, query.isError],
  );

  const groupedItems = useMemo(() => {
    return (Object.keys(SYSTEM_CATALOG) as SystemCategory[]).reduce<Record<SystemCategory, readonly SystemHealthItem[]>>(
      (groups, category) => {
        groups[category] = items.filter((item) => item.category === category);
        return groups;
      },
      {
        modules: [],
        engines: [],
        templates: [],
        skills: [],
      },
    );
  }, [items]);

  return {
    items,
    groupedItems,
    error: query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    lastChecked,
    refetch: query.refetch,
  };
}