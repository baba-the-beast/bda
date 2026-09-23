import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../app/AuthProvider';
import { Button } from '../../components/ui/Button';
import {
  DraggableWidgetGrid,
  type GridWidget,
  type WidgetRenderContext,
} from '../../components/ui/draggable-widget-grid';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { jobs, type Dataset } from '../../lib/api/endpoints';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

import { useDashboardLayout, WIDGETS, type WidgetId } from './dashboardLayout';

/** The route each pipeline stage leads to, in the order data moves through it. */
const STAGES = [
  { id: 'ingest', name: 'Ingest', route: '/datasets' },
  { id: 'clean', name: 'Clean', route: '/datasets' },
  { id: 'batch', name: 'Batch', route: '/jobs' },
  { id: 'query', name: 'Query', route: '/query' },
  { id: 'stream', name: 'Stream', route: '/stream' },
] as const;

/**
 * Landing route: a dashboard the reader arranges.
 *
 * Every card is bound to a real endpoint — analytics, stream, job orchestrator
 * and dataset services — and owns its own loading, empty and error states, so
 * one failing service blanks one card rather than the page. The arrangement is
 * kept per user in this browser (see useDashboardLayout).
 */
export function OverviewPage() {
  const { user } = useAuth();
  const selection = useDatasetSelection();
  const { selected, selectedId } = selection;
  const board = useDashboardLayout(user?.id);

  const renderItem = useCallback(
    (item: GridWidget, context: WidgetRenderContext) => {
      const { Component } = WIDGETS[item.id as WidgetId];
      return <Component datasetId={selectedId} dataset={selected} context={context} />;
    },
    [selectedId, selected],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Overview"
        lede={
          selected === undefined
            ? 'One household near Paris, metered every minute.'
            : `What ${selected.filename} says about this house, arranged the way you want it.`
        }
        actions={
          <>
            <DatasetPicker selection={selection} />
            <Button
              size="sm"
              variant="ghost"
              disabled={board.isDefault}
              onClick={board.reset}
              icon={<RotateCcw aria-hidden className="size-3.5" />}
            >
              Reset layout
            </Button>
          </>
        }
      />

      <PanelState
        isLoading={selection.isLoading}
        error={selection.error}
        isEmpty={selection.datasets.length === 0}
        empty={
          <EmptyState
            title="Nothing recorded yet"
            description="Upload a meter reading file and the house starts telling you about itself."
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/datasets">Upload a dataset</Link>
              </Button>
            }
          />
        }
      >
        <DraggableWidgetGrid
          label="Overview cards"
          items={board.widgets}
          onItemsChange={board.setLayout}
          renderItem={renderItem}
          // One column means full-width cards on a phone: their content wraps,
          // so each row needs more height than a quarter-width desktop card.
          rowHeight={(columns) => (columns === 1 ? 264 : 220)}
        />

        <PipelineStrip dataset={selected} />
      </PanelState>
    </div>
  );
}

/** The pipeline as a line, because that is what it is: one thing after another. */
function PipelineStrip({ dataset }: { dataset: Dataset | undefined }) {
  const jobList = useQuery({
    queryKey: ['jobs', dataset?.id] as const,
    queryFn: () => jobs.list(dataset?.id),
    enabled: dataset !== undefined,
  });

  /** Each stage reports what the data says about it, never an assumed state. */
  const stageState = (id: string): { done: boolean; note: string } => {
    if (dataset === undefined) return { done: false, note: 'no dataset' };
    switch (id) {
      case 'ingest':
        return { done: true, note: 'uploaded' };
      case 'clean': {
        const cleaned = dataset.status === 'PROCESSED' || dataset.quality_report != null;
        return { done: cleaned, note: cleaned ? 'cleaned' : 'not run' };
      }
      case 'batch': {
        if (jobList.data === undefined) return { done: false, note: 'unknown' };
        const ok = jobList.data.filter((j) => j.status === 'SUCCEEDED').length;
        return { done: ok > 0, note: ok > 0 ? `${String(ok)} jobs` : 'none run' };
      }
      default:
        return { done: false, note: 'on demand' };
    }
  };

  return (
    <section aria-labelledby="pipeline" className="border-t border-border pt-5">
      <h2 id="pipeline" className="text-sm text-text-muted">
        How this dataset got here
      </h2>

      <ol className="mt-3 flex flex-col gap-0 sm:flex-row">
        {STAGES.map((stage, index) => {
          const { done, note } = stageState(stage.id);
          return (
            <li key={stage.id} className="flex flex-1 items-center gap-3">
              <Link
                to={stage.route}
                className="group flex flex-1 items-baseline gap-2 py-2 sm:flex-col sm:items-start sm:gap-1"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={
                      done
                        ? 'size-1.5 rounded-full bg-accent'
                        : 'size-1.5 rounded-full border border-border-strong'
                    }
                  />
                  <span className="text-sm text-text group-hover:text-accent">{stage.name}</span>
                </span>
                <span className="text-2xs text-text-subtle">{note}</span>
              </Link>
              {index < STAGES.length - 1 && (
                <span aria-hidden className="hidden h-px flex-1 bg-border sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
