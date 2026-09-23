import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { Field, Input } from './Field';
import { KeyValue } from './KeyValue';
import { Metric } from './Metric';
import { Panel, PanelBody, PanelHeader } from './Panel';
import { EmptyState, ErrorState, Skeleton } from './States';
import { Badge, StatusPill } from './Status';
import { Table, type Column } from './Table';

describe('Button', () => {
  it('defaults to type="button" so it cannot accidentally submit a form', () => {
    render(<Button>Run job</Button>);
    expect(screen.getByRole('button', { name: 'Run job' })).toHaveAttribute('type', 'button');
  });

  it('is disabled and marked busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: /saving/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('gives the control an accessible name via the label', () => {
    render(
      <Field label="Dataset id">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );
    expect(screen.getByLabelText('Dataset id')).toBeInTheDocument();
  });

  it('wires hint and error text through aria-describedby', () => {
    render(
      <Field label="Threshold" hint="Kilowatts" error="Must be above zero">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );

    const input = screen.getByLabelText('Threshold');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be above zero');
  });

  it('marks a required field for screen readers, not just with an asterisk', () => {
    render(
      <Field label="Email" required>
        {({ id }) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByText('(required)')).toBeInTheDocument();
  });
});

describe('Metric', () => {
  it('renders the value with its unit', () => {
    render(<Metric label="Total consumption" value="1,234.5" unit="kWh" />);
    expect(screen.getByText('1,234.5')).toBeInTheDocument();
    expect(screen.getByText('kWh')).toBeInTheDocument();
  });

  it('says "not recorded" rather than showing a zero when there is no value', () => {
    render(<Metric label="Peak load" value={null} unit="kW" />);
    expect(screen.getByText('not recorded')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('exposes the as-of timestamp as a machine-readable time', () => {
    const asOf = new Date('2026-09-22T17:09:00Z');
    const { container } = render(<Metric label="Average power" value="2.2" asOf={asOf} />);
    expect(container.querySelector('time')).toHaveAttribute('datetime', asOf.toISOString());
  });
});

describe('StatusPill', () => {
  it('conveys status with text as well as colour', () => {
    render(<StatusPill status="critical">Failed</StatusPill>);
    const pill = screen.getByText('Failed').closest('span');
    if (pill === null) throw new Error('expected the pill to render');
    expect(within(pill).getByText('Critical:', { exact: false })).toBeInTheDocument();
  });

  it('renders a plain badge without status semantics', () => {
    render(<Badge>HDFS</Badge>);
    expect(screen.getByText('HDFS')).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('shows provenance and an as-of time in the header', () => {
    const asOf = new Date('2026-09-22T17:09:00Z');
    const { container } = render(
      <Panel>
        <PanelHeader
          title="Daily aggregates"
          source="the Hive table daily_aggregates"
          asOf={asOf}
        />
        <PanelBody>body</PanelBody>
      </Panel>,
    );

    expect(screen.getByRole('heading', { name: 'Daily aggregates' })).toBeInTheDocument();
    expect(screen.getByText(/from the Hive table daily_aggregates/)).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', asOf.toISOString());
  });

  it('flags stale data explicitly', () => {
    render(<PanelHeader title="Stream windows" source="SSE" asOf={new Date()} stale />);
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });

  it('omits the provenance line when there is nothing to report', () => {
    const { container } = render(<PanelHeader title="Filters" />);
    expect(container.querySelector('time')).toBeNull();
  });
});

describe('States', () => {
  it('announces loading politely', () => {
    render(<Skeleton className="h-4" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading');
  });

  it('renders an empty state with an action', () => {
    render(<EmptyState title="No datasets yet" description="Upload one to begin." />);
    expect(screen.getByText('No datasets yet')).toBeInTheDocument();
  });

  it('surfaces the correlation id and retries on request', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Query failed" correlationId="abc-123" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Query failed');
    expect(screen.getByText('abc-123')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

interface JobRow {
  id: string;
  type: string;
  duration: number | null;
}

const JOB_COLUMNS: Column<JobRow>[] = [
  { id: 'type', header: 'Type', cell: (r) => r.type, sortValue: (r) => r.type },
  {
    id: 'duration',
    header: 'Duration',
    cell: (r) => (r.duration === null ? 'not recorded' : `${String(r.duration)}s`),
    sortValue: (r) => r.duration,
    align: 'right',
    numeric: true,
  },
];

const JOB_ROWS: JobRow[] = [
  { id: 'j2', type: 'HOURLY', duration: 12 },
  { id: 'j1', type: 'DAILY', duration: 3 },
  { id: 'j3', type: 'MONTHLY', duration: null },
];

describe('Table', () => {
  const renderTable = () =>
    render(
      <Table caption="Analytics jobs" columns={JOB_COLUMNS} rows={JOB_ROWS} rowKey={(r) => r.id} />,
    );

  it('has an accessible caption', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Analytics jobs' })).toBeInTheDocument();
  });

  it('sorts ascending, then descending, then returns to source order', async () => {
    renderTable();
    const header = screen.getByRole('button', { name: /type/i });
    const columnValues = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

    expect(columnValues()).toEqual(['HOURLY', 'DAILY', 'MONTHLY']);

    await userEvent.click(header);
    expect(columnValues()).toEqual(['DAILY', 'HOURLY', 'MONTHLY']);

    await userEvent.click(header);
    expect(columnValues()).toEqual(['MONTHLY', 'HOURLY', 'DAILY']);

    await userEvent.click(header);
    expect(columnValues()).toEqual(['HOURLY', 'DAILY', 'MONTHLY']);
  });

  it('reports sort direction through aria-sort', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: /type/i }));
    expect(screen.getByRole('columnheader', { name: /type/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts missing values last regardless of direction', async () => {
    renderTable();
    const durationHeader = screen.getByRole('button', { name: /duration/i });
    const lastCell = () => {
      const rows = screen.getAllByRole('row').slice(1);
      const last = rows.at(-1);
      if (last === undefined) throw new Error('expected at least one data row');
      return within(last).getAllByRole('cell')[1]?.textContent;
    };

    await userEvent.click(durationHeader);
    expect(lastCell()).toBe('not recorded');

    await userEvent.click(durationHeader);
    expect(lastCell()).toBe('not recorded');
  });

  it('renders the empty slot instead of an empty table body', () => {
    render(
      <Table
        caption="Analytics jobs"
        columns={JOB_COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No jobs" />}
      />,
    );
    expect(screen.getByText('No jobs')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('KeyValue', () => {
  it('renders a definition list preserving label/value pairs', () => {
    render(
      <KeyValue
        items={[
          { label: 'Checksum', value: 'aa072b06', mono: true },
          { label: 'Version', value: '1' },
        ]}
      />,
    );
    expect(screen.getByText('Checksum')).toBeInTheDocument();
    expect(screen.getByText('aa072b06')).toBeInTheDocument();
  });
});
