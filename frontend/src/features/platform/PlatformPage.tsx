import { useQuery } from '@tanstack/react-query';

import { KeyValue } from '../../components/ui/KeyValue';
import { Metric } from '../../components/ui/Metric';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { apiRequest } from '../../lib/api/client';
import { humanizeEnum } from '../../lib/format';
import { PanelState } from '../shared/PanelState';

/**
 * Platform metrics.
 *
 * The endpoint returns an untyped dict, so every field is read defensively and
 * anything absent renders as unavailable rather than zero. Whatever the service
 * does not report simply is not shown.
 */
interface PlatformMetrics {
  entries: { label: string; value: string }[];
  headline: { label: string; value: string | null }[];
}

/** Keys arrive as `total_records_processed`; a reader gets a sentence. */
const fieldName = (key: string): string => humanizeEnum(key);

const renderValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

/** Fields worth promoting to a tile, if the service reports them. */
const HEADLINE_KEYS = [
  'total_datasets',
  'total_jobs',
  'total_records_processed',
  'total_aggregates',
];

function parseMetrics(payload: unknown): PlatformMetrics {
  const raw = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;

  const headline = HEADLINE_KEYS.filter((key) => key in raw).map((key) => ({
    label: fieldName(key).toLowerCase(),
    value: renderValue(raw[key]),
  }));

  const entries = Object.entries(raw)
    .filter(([key]) => !HEADLINE_KEYS.includes(key))
    .map(([key, value]) => ({
      label: fieldName(key),
      value: renderValue(value) ?? 'not recorded',
    }));

  return { headline, entries };
}

export function PlatformPage() {
  const metrics = useQuery({
    queryKey: ['platform', 'metrics'] as const,
    queryFn: async () => parseMetrics(await apiRequest<unknown>('/analytics/metrics')),
  });

  const fetchedAt = metrics.dataUpdatedAt === 0 ? null : new Date(metrics.dataUpdatedAt);
  const data = metrics.data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Platform metrics"
        lede="What the services report about their own throughput, storage and health."
      />

      <Panel>
        <PanelHeader
          title="Verification metrics"
          source="the analytics service"
          asOf={fetchedAt}
          stale={metrics.isStale && !metrics.isFetching}
        />
        <PanelBody>
          <PanelState
            isLoading={metrics.isLoading}
            error={metrics.error}
            isEmpty={data?.entries.length === 0 && data.headline.length === 0}
            empty={
              <EmptyState
                title="No metrics reported"
                description="The analytics service returned an empty payload."
              />
            }
            onRetry={() => void metrics.refetch()}
          >
            {data !== undefined && (
              <div className="flex flex-col gap-5">
                {data.headline.length > 0 && (
                  <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                    {data.headline.map((item) => (
                      <Metric
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        asOf={fetchedAt}
                      />
                    ))}
                  </div>
                )}
                {data.entries.length > 0 && <KeyValue items={data.entries} />}
              </div>
            )}
          </PanelState>
        </PanelBody>
      </Panel>
    </div>
  );
}
