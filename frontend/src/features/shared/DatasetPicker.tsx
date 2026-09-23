import { Select } from '../../components/ui/Select';
import type { DatasetSelection } from '../datasets/useDatasetSelection';

/**
 * The single filter control, placed once above the panels it scopes rather than
 * repeated inside each card.
 */
export function DatasetPicker({ selection }: { selection: DatasetSelection }) {
  const { datasets: list, selectedId, setSelectedId, isLoading } = selection;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dataset-picker" className="text-xs text-text-muted">
        Dataset
      </label>
      <Select
        id="dataset-picker"
        aria-label="Dataset"
        className="w-64"
        value={selectedId}
        disabled={isLoading || list.length === 0}
        placeholder={isLoading ? 'Loading…' : 'No datasets'}
        onValueChange={setSelectedId}
        options={list.map((dataset) => ({
          value: dataset.id,
          label: dataset.filename,
        }))}
      />
    </div>
  );
}
