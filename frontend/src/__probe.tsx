import { BarChart } from './components/charts/BarChart';
import { StackedBarChart } from './components/charts/StackedBarChart';
import { TimeSeriesChart } from './components/charts/TimeSeriesChart';

export function Probe() {
  return (
    <>
      <TimeSeriesChart title="t" description="d" unit="kW" series={[]} />
      <BarChart title="t" description="d" unit="kWh" categoryLabel="Hour" data={[]} />
      <StackedBarChart
        title="t"
        description="d"
        unit="kWh"
        categoryLabel="Date"
        categories={[]}
        series={[]}
      />
    </>
  );
}
