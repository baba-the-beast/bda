import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChartFrame } from './ChartFrame';
import { SERIES_PALETTE } from './theme';

// ECharts needs a real canvas and a measurable container, neither of which jsdom
// provides. The frame is what carries the accessibility contract, so that is
// what is tested here; the canvas itself is covered by the e2e run.
vi.mock('./useECharts', () => ({ useECharts: () => ({ current: null }) }));

const SERIES = [
  { name: 'Kitchen', colorIndex: 0 },
  { name: 'Laundry', colorIndex: 1 },
];

const ROWS = [
  ['2006-12-16', '1.004', '0.045'],
  ['2006-12-17', '0.000', '0.009'],
];

function renderFrame(overrides: Partial<React.ComponentProps<typeof ChartFrame>> = {}) {
  return render(
    <ChartFrame
      title="Sub-meter disaggregation"
      description="Daily energy by sub-meter circuit, in kilowatt-hours."
      series={SERIES}
      tableColumns={['Date', 'Kitchen (kWh)', 'Laundry (kWh)']}
      tableRows={ROWS}
      {...overrides}
    >
      <div data-testid="canvas" />
    </ChartFrame>,
  );
}

describe('ChartFrame', () => {
  it('is a figure with a caption and a text description', () => {
    renderFrame();
    expect(screen.getByText('Sub-meter disaggregation')).toBeInTheDocument();
    expect(
      screen.getByText('Daily energy by sub-meter circuit, in kilowatt-hours.'),
    ).toBeInTheDocument();
  });

  it('renders a legend for two or more series, so identity is not colour alone', () => {
    renderFrame();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Laundry')).toBeInTheDocument();
  });

  it('omits the legend for a single series', () => {
    renderFrame({ series: [{ name: 'Active power', colorIndex: 0 }] });
    // The title names it; a one-row legend would be noise.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('offers a table twin holding the same numbers', async () => {
    renderFrame();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /view as table/i }));

    const table = screen.getByRole('table', { name: 'Sub-meter disaggregation' });
    expect(within(table).getByText('1.004')).toBeInTheDocument();
    expect(within(table).getByText('0.045')).toBeInTheDocument();
  });

  it('reports the active view through aria-pressed', async () => {
    renderFrame();
    const toggle = screen.getByRole('button', { name: /view as table/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: /view as chart/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows an empty state instead of an axis with nothing on it', () => {
    renderFrame({ tableRows: [] });
    expect(screen.getByText('No data for this selection')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
  });

  it('holds the previous render while refreshing rather than flashing a skeleton', () => {
    renderFrame({ refreshing: true });
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });
});

describe('series palette', () => {
  it('has eight slots assigned in a fixed order', () => {
    expect(SERIES_PALETTE).toHaveLength(8);
    expect(SERIES_PALETTE[0]).toBe('#3987e5');
  });

  it('contains no duplicate hues, so no two series can collide', () => {
    expect(new Set(SERIES_PALETTE).size).toBe(SERIES_PALETTE.length);
  });
});
