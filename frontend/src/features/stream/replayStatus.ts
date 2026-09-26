import { useQuery } from '@tanstack/react-query';

import { stream } from '../../lib/api/endpoints';

/** The fields of /stream/status the UI relies on. The endpoint is untyped (BR-5). */
export interface ReplayStatus {
  running: boolean;
  paused: boolean;
  datasetId: string | null;
}

export function parseReplayStatus(payload: unknown): ReplayStatus {
  const raw = (
    typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? payload : {}
  ) as Record<string, unknown>;
  return {
    running: raw.is_running === true,
    paused: raw.is_paused === true,
    datasetId: typeof raw.dataset_id === 'string' && raw.dataset_id !== '' ? raw.dataset_id : null,
  };
}

/**
 * The replay as the stream service reports it. The replay outlives any page, so
 * whether it is running is the server's answer, not something a page remembers
 * from its own button presses.
 */
export function useReplayStatus() {
  return useQuery({
    queryKey: ['stream', 'status'] as const,
    queryFn: async () => parseReplayStatus(await stream.status()),
    refetchInterval: 10_000,
  });
}
