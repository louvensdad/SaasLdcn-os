'use client';

import { useQueries } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { InfrastructureComponent } from '@/lib/api/types';

export function useInfrastructureComponents() {
  const queries = useQueries({
    queries: [
      {
        queryKey: ['api', 'infrastructure', 'components'],
        queryFn: () => apiClient.getInfrastructureComponents(),
        staleTime: 60_000,
        retry: 1,
      },
      {
        queryKey: ['api', 'infrastructure', 'categories'],
        queryFn: () => apiClient.getInfrastructureCategories(),
        staleTime: 60_000,
        retry: 1,
      },
    ],
  });

  const [componentsQuery, categoriesQuery] = queries;
  const components = (componentsQuery.data ?? []) as InfrastructureComponent[];
  const categories = (categoriesQuery.data ?? []) as string[];
  const grouped = categories.map((category) => ({
    category,
    components: components.filter((component) => component.category === category),
  }));

  return {
    components,
    categories,
    grouped,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
  };
}

