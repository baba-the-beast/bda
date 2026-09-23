import { useQuery } from '@tanstack/react-query';

import { BarChart } from '../../components/charts/BarChart';
import { StackedBarChart } from '../../components/charts/StackedBarChart';
import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { Tabs } from '../../components/ui/Tabs';
import { analytics } from '../../lib/api/endpoints';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

/**
 * Consumption analysis.
 *
 * Merges the old Load Profile and Sub-Meter screens. Between them they carried
 * fourteen hardcoded figures presented as readings — a four-row voltage table,
 * four period averages and a 1,800 kW total (docs/FRONTEND_AUDIT.md F6). Every
 * number here is fetched or absent.
 */
export function AnalysisPage() {
  const selection = useDatasetSelection();
  const { selectedId } = selection;

  const daily = useQuery({
    queryKey: ['analytics', 'daily', selectedId] as const,
    queryFn: () => analytics.daily(selectedId ?? ''),
    enabled: selectedId !== undefined,
  });

  const hourly = useQuery({
    queryKey: ['analytics', 'hourly', selectedId] as const,
    queryFn: () => analytics.hourly(selectedId ?? ''),
    enabled: selectedId !== undefined,
  });

  const monthly = useQuery({
    queryKey: ['analytics', 'monthly', selectedId] as const,
    queryFn: () => analytics.monthly(selectedId ?? ''),
    enabled: selectedId !== undefined,
  });

  const peak = useQuery({
    queryKey: ['analytics', 'peak', selectedId] as const,
    queryFn: () => analytics.peak(selectedId ?? ''),
    enabled: selectedId !== undefined,
  });

  const dailyRows = daily.data ?? [];
  const noAggregates = (
    <EmptyState
      title="No aggregates yet"
      description="Run a MapReduce job for this dataset to produce them."
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Consumption analysis</h1>
        <DatasetPicker selection={selection} />
      </div>

      <Panel>
        <Tabs
          label="Consumption views"
          items={[
            {
              value: 'daily',
              label: 'Daily',
              content: (
                <PanelBody>
                  <PanelState
                    isLoading={daily.isLoading || selection.isLoading}
                    error={daily.error ?? selection.error}
                    isEmpty={dailyRows.length === 0}
                    empty={noAggregates}
                    onRetry={() => void daily.refetch()}
                  >
                    <TimeSeriesChart
                      title="Daily energy"
                      description="Total household energy per day, from the daily MapReduce aggregate."
                      unit="kWh"
                      zoomable
                      refreshing={daily.isFetching && !daily.isLoading}
                      series={[
                        {
                          name: 'Total energy',
                          points: dailyRows.map((row) => ({
                            t: row.date,
                            v: row.total_consumption_kwh,
                          })),
                        },
                      ]}
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
            {
              value: 'hourly',
              label: 'Hourly',
              content: (
                <PanelBody>
                  <PanelState
                    isLoading={hourly.isLoading || selection.isLoading}
                    error={hourly.error ?? selection.error}
                    isEmpty={(hourly.data ?? []).length === 0}
                    empty={noAggregates}
                    onRetry={() => void hourly.refetch()}
                  >
                    <BarChart
                      title="Mean power by hour"
                      description="Average household active power for each hour of the day."
                      unit="kW"
                      categoryLabel="Hour"
                      refreshing={hourly.isFetching && !hourly.isLoading}
                      data={(hourly.data ?? []).map((row) => ({
                        category: String(row.hour).padStart(2, '0'),
                        value: row.average_power,
                      }))}
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
            {
              value: 'monthly',
              label: 'Monthly',
              content: (
                <PanelBody>
                  <PanelState
                    isLoading={monthly.isLoading || selection.isLoading}
                    error={monthly.error ?? selection.error}
                    isEmpty={(monthly.data ?? []).length === 0}
                    empty={noAggregates}
                    onRetry={() => void monthly.refetch()}
                  >
                    <BarChart
                      title="Monthly energy"
                      description="Total household energy per month."
                      unit="kWh"
                      categoryLabel="Month"
                      refreshing={monthly.isFetching && !monthly.isLoading}
                      data={(monthly.data ?? []).map((row) => ({
                        category: `${String(row.year)}-${String(row.month).padStart(2, '0')}`,
                        value: row.total_consumption_kwh,
                      }))}
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
            {
              value: 'submeters',
              label: 'Sub-meters',
              content: (
                <PanelBody>
                  <PanelState
                    isLoading={daily.isLoading || selection.isLoading}
                    error={daily.error ?? selection.error}
                    isEmpty={dailyRows.length === 0}
                    empty={noAggregates}
                    onRetry={() => void daily.refetch()}
                  >
                    <StackedBarChart
                      title="Sub-meter disaggregation"
                      description="Daily energy by metered circuit. Sub-meter 1 is the kitchen, 2 the laundry room, 3 the water heater and air conditioner."
                      unit="Wh"
                      categoryLabel="Date"
                      refreshing={daily.isFetching && !daily.isLoading}
                      categories={dailyRows.map((row) => row.date)}
                      series={[
                        {
                          name: 'Kitchen',
                          values: dailyRows.map((row) => row.sub_metering_1_total),
                        },
                        {
                          name: 'Laundry',
                          values: dailyRows.map((row) => row.sub_metering_2_total),
                        },
                        {
                          name: 'Climate',
                          values: dailyRows.map((row) => row.sub_metering_3_total),
                        },
                      ]}
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
          ]}
        />
      </Panel>

      <Panel>
        <PanelHeader
          title="Peak power events"
          source="Analytics · peak events"
          asOf={peak.dataUpdatedAt === 0 ? null : new Date(peak.dataUpdatedAt)}
        />
        <PanelBody>
          <PanelState
            isLoading={peak.isLoading || selection.isLoading}
            error={peak.error ?? selection.error}
            isEmpty={(peak.data ?? []).length === 0}
            empty={
              <EmptyState
                title="No peak events recorded"
                description="Run the PEAK MapReduce job to detect them."
              />
            }
            onRetry={() => void peak.refetch()}
          >
            <TimeSeriesChart
              title="Peak active power"
              description="Household active power at each detected peak event."
              unit="kW"
              zoomable
              series={[
                {
                  name: 'Peak power',
                  points: (peak.data ?? []).map((row) => ({
                    t: row.timestamp,
                    v: row.power,
                  })),
                },
              ]}
            />
          </PanelState>
        </PanelBody>
      </Panel>
    </div>
  );
}
