import { useMutation, useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { KeyValue } from '../../components/ui/KeyValue';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/States';
import { Table, type Column } from '../../components/ui/Table';
import { hive, type HiveQueryResult } from '../../lib/api/endpoints';
import { formatDuration } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
}

function parseTemplates(payload: unknown): TemplateSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string') return [];
    return [
      {
        id: record.id,
        name: typeof record.name === 'string' ? record.name : record.id,
        description: typeof record.description === 'string' ? record.description : '',
      },
    ];
  });
}

type ResultRow = Record<string, unknown>;

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
};

/**
 * Hive query lab.
 *
 * Only whitelisted templates can run — the service refuses anything else — so
 * the picker is the query surface rather than a free-text SQL box.
 */
export function QueryPage() {
  const selection = useDatasetSelection();
  const { selectedId } = selection;

  const [templateId, setTemplateId] = useState<string>('daily_aggregates');
  const [limit, setLimit] = useState('50');
  const [thresholdKw, setThresholdKw] = useState('4.0');
  const [result, setResult] = useState<HiveQueryResult | null>(null);

  const templates = useQuery({
    queryKey: ['hive', 'templates'] as const,
    queryFn: async () => parseTemplates(await hive.templates()),
  });

  const run = useMutation({
    mutationFn: () => {
      if (selectedId === undefined) throw new Error('Select a dataset first');
      const parameters: Record<string, string | number> = {};
      const parsedLimit = Number.parseInt(limit, 10);
      if (Number.isFinite(parsedLimit)) parameters.limit = parsedLimit;
      const parsedThreshold = Number.parseFloat(thresholdKw);
      if (Number.isFinite(parsedThreshold)) parameters.threshold_kw = parsedThreshold;
      return hive.execute(selectedId, templateId, parameters);
    },
    onSuccess: setResult,
  });

  const selectedTemplate = (templates.data ?? []).find((t) => t.id === templateId);

  const columns: Column<ResultRow>[] =
    result === null
      ? []
      : result.columns.map((column, index) => ({
          id: column,
          header: column.replaceAll('_', ' '),
          cell: (row) => cellText(row[column]),
          sortValue: (row) => {
            const value = row[column];
            return typeof value === 'number' || typeof value === 'string' ? value : null;
          },
          ...(index === 0 ? {} : { align: 'right' as const, numeric: true }),
        }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Hive query lab</h1>
        <DatasetPicker selection={selection} />
      </div>

      <Panel>
        <PanelHeader title="Run a template" source="Hive query service" />
        <PanelBody className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Field label="Template">
                {({ id }) => (
                  <Select
                    id={id}
                    aria-label="Template"
                    value={templateId}
                    onValueChange={setTemplateId}
                    options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
                    placeholder={templates.isLoading ? 'Loading…' : 'Choose a template'}
                  />
                )}
              </Field>
            </div>
            <Field label="Row limit" hint="1 to 1000">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min="1"
                  max="1000"
                  value={limit}
                  onChange={(e) => {
                    setLimit(e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Peak threshold (kW)" hint="Used by peak_power_analysis">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="0.1"
                  value={thresholdKw}
                  onChange={(e) => {
                    setThresholdKw(e.target.value);
                  }}
                />
              )}
            </Field>
          </div>

          {selectedTemplate !== undefined && selectedTemplate.description !== '' && (
            <p className="text-xs text-text-muted">{selectedTemplate.description}</p>
          )}

          <div>
            <Button
              variant="primary"
              size="sm"
              loading={run.isPending}
              disabled={selectedId === undefined}
              icon={<Play aria-hidden className="size-3.5" />}
              onClick={() => {
                run.mutate();
              }}
            >
              Execute query
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Results"
          source={result === null ? undefined : `Hive · ${result.template_name}`}
          asOf={result === null ? null : new Date()}
        />
        <PanelBody className="p-0">
          <PanelState
            isLoading={run.isPending}
            error={run.error}
            isEmpty={result === null || result.results.length === 0}
            empty={
              <EmptyState
                title={result === null ? 'No query run yet' : 'The query returned no rows'}
                description={
                  result === null
                    ? 'Pick a template and execute it to see results.'
                    : 'Try a different template or a wider limit.'
                }
              />
            }
            onRetry={() => {
              run.mutate();
            }}
          >
            {result !== null && (
              <>
                <div className="border-b border-border px-4 py-3">
                  <KeyValue
                    className="md:grid-cols-[auto_1fr_auto_1fr]"
                    items={[
                      { label: 'Query id', value: result.query_id, mono: true },
                      { label: 'Rows', value: result.row_count.toLocaleString() },
                      {
                        label: 'Duration',
                        value: formatDuration(result.execution_duration_sec),
                      },
                    ]}
                  />
                </div>
                <Table
                  caption={`Results for ${result.template_name}`}
                  columns={columns}
                  rows={result.results}
                  rowKey={(row) => JSON.stringify(row)}
                  maxHeight="30rem"
                />
              </>
            )}
          </PanelState>
        </PanelBody>
      </Panel>
    </div>
  );
}
