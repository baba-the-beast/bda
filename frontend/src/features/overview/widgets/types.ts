import type { WidgetRenderContext } from '../../../components/ui/draggable-widget-grid';
import type { Dataset } from '../../../lib/api/endpoints';

export interface WidgetProps {
  datasetId: string | undefined;
  dataset: Dataset | undefined;
  context: WidgetRenderContext;
}
