import { useState } from 'react';

import { Field, Input } from '../../components/ui/Field';
import { KeyValue } from '../../components/ui/KeyValue';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { Table, type Column } from '../../components/ui/Table';
import { formatValue } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

import { useVoltageBands, type VoltageBand } from './voltageBands';

const COLUMNS: Column<VoltageBand>[] = [
  {
    id: 'band',
    header: 'Voltage band',
    cell: (row) => row.voltage_band,
    sortValue: (row) => row.voltage_band,
  },
  {
    id: 'readings',
    header: 'Readings',
    cell: (row) => (row.reading_count === null ? '—' : row.reading_count.toLocaleString()),
    sortValue: (row) => row.reading_count,
    align: 'right',
    numeric: true,
  },
  {
    id: 'voltage',
    header: 'Mean voltage',
    cell: (row) => formatValue(row.avg_voltage, 'V'),
    sortValue: (row) => row.avg_voltage,
    align: 'right',
    numeric: true,
  },
  {
    id: 'intensity',
    header: 'Mean current',
    cell: (row) => formatValue(row.avg_intensity, 'A'),
    sortValue: (row) => row.avg_intensity,
    align: 'right',
    numeric: true,
  },
  {
    id: 'active',
    header: 'Mean active power',
    cell: (row) => formatValue(row.avg_active_power, 'kW'),
    sortValue: (row) => row.avg_active_power,
    align: 'right',
    numeric: true,
  },
];

/**
 * Household voltage and power analysis.
 *
 * Renamed from "Transformer Substation": this is one French household's meter,
 * not a distribution substation (docs/BUG_AUDIT.md BUG-HIGH-03, F9).
 */
export function VoltagePage() {
  const selection = useDatasetSelection();
  const { selectedId, selected } = selection;

  const bands = useVoltageBands(selectedId);

  const fetchedAt = bands.dataUpdatedAt === 0 ? null : new Date(bands.dataUpdatedAt);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Voltage & power"
        lede="How supply voltage tracked the current the house was drawing, band by band."
        actions={<DatasetPicker selection={selection} />}
      />

      <Panel>
        <PanelHeader
          title="Voltage band distribution"
          source={
            selected === undefined ? undefined : 'the Hive table voltage_intensity_correlation'
          }
          asOf={fetchedAt}
          stale={bands.isStale && !bands.isFetching}
        />
        <PanelBody className="p-0">
          <PanelState
            isLoading={bands.isLoading || selection.isLoading}
            error={bands.error ?? selection.error}
            isEmpty={(bands.data ?? []).length === 0}
            empty={
              <EmptyState
                title="No readings in this dataset"
                description="Run preprocessing on the dataset before querying voltage bands."
              />
            }
            onRetry={() => void bands.refetch()}
          >
            <Table
              caption="Voltage band distribution"
              columns={COLUMNS}
              rows={bands.data ?? []}
              rowKey={(row) => row.voltage_band}
            />
          </PanelState>
        </PanelBody>
      </Panel>

      <PowerCalculator />
    </div>
  );
}

/**
 * An interactive calculator, labelled as one.
 *
 * It takes user inputs and shows arithmetic; it is not a reading from the
 * dataset, and the panel says so rather than letting it sit among live figures.
 */
function PowerCalculator() {
  const [voltage, setVoltage] = useState('238');
  const [current, setCurrent] = useState('5.2');
  const [powerFactor, setPowerFactor] = useState('0.92');

  const v = Number.parseFloat(voltage);
  const i = Number.parseFloat(current);
  const pf = Number.parseFloat(powerFactor);
  const valid = [v, i, pf].every((n) => Number.isFinite(n));

  const apparentKva = valid ? (v * i) / 1000 : null;
  const activeKw = valid && apparentKva !== null ? apparentKva * pf : null;
  const reactiveKvar =
    valid && apparentKva !== null ? apparentKva * Math.sqrt(Math.max(0, 1 - pf * pf)) : null;

  return (
    <Panel>
      <PanelHeader
        title="Power calculator"
        source="the values you enter, not from dataset readings"
      />
      <PanelBody className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Field label="Voltage (V)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                value={voltage}
                onChange={(e) => {
                  setVoltage(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Current (A)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Power factor" hint="cos φ, 0 to 1">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="1"
                value={powerFactor}
                onChange={(e) => {
                  setPowerFactor(e.target.value);
                }}
              />
            )}
          </Field>
        </div>

        <div className="flex-1">
          <KeyValue
            items={[
              {
                label: 'Apparent power',
                value: formatValue(apparentKva, 'kW').replace('kW', 'kVA'),
              },
              { label: 'Active power', value: `${formatValue(activeKw, 'kW')} (P = V·I·cos φ)` },
              { label: 'Reactive power', value: formatValue(reactiveKvar, 'kvar') },
            ]}
          />
        </div>
      </PanelBody>
    </Panel>
  );
}
