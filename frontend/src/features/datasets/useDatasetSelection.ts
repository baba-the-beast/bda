import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import { datasets, type Dataset } from '../../lib/api/endpoints';

export const datasetsQueryKey = ['datasets'] as const;

export function useDatasets() {
  return useQuery({
    queryKey: datasetsQueryKey,
    queryFn: () => datasets.list(),
  });
}

export interface DatasetSelection {
  datasets: Dataset[];
  selected: Dataset | undefined;
  selectedId: string | undefined;
  setSelectedId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Dataset selection, held in the URL rather than component state.
 *
 * `?dataset=ds_...` makes a view shareable and refresh-safe: the whole point of
 * having routes. Falling back to the first dataset keeps a bare URL useful.
 */
export function useDatasetSelection(): DatasetSelection {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, error } = useDatasets();

  const list = data ?? [];
  const requested = searchParams.get('dataset') ?? undefined;
  const selected = list.find((d) => d.id === requested) ?? list[0];

  const setSelectedId = useCallback(
    (id: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('dataset', id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    datasets: list,
    selected,
    selectedId: selected?.id,
    setSelectedId,
    isLoading,
    error,
  };
}
