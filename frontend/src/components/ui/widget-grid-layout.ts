/**
 * Layout for the draggable widget grid, kept free of React and the DOM so it
 * can be tested exhaustively.
 *
 * A layout is a *sequence* of widgets, each with a *size*. The grid turns that
 * into cell placements for a given column count:
 *
 * 1. Exact tiling. Cells are filled in reading order, always at the first empty
 *    cell, choosing the earliest widget in the sequence that fits there and
 *    backtracking when a choice leads to a dead end. The first tiling found is
 *    therefore the one closest to the sequence the reader chose, and it has no
 *    holes except after the last widget.
 * 2. Packing fallback. Some sets cannot tile exactly (three tall widgets in two
 *    columns, say). Then each widget, in sequence order, takes the first
 *    position it fits — CSS `grid-auto-flow: dense`, computed here so the
 *    result is known rather than left to the browser.
 */

export type WidgetSize = 'sm' | 'wide' | 'tall' | 'lg';

export const WIDGET_SIZES: readonly WidgetSize[] = ['sm', 'wide', 'tall', 'lg'];

/** Columns × rows each size occupies before clamping to the grid width. */
export const SIZE_SPAN: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 1, h: 1 },
  wide: { w: 2, h: 1 },
  tall: { w: 1, h: 2 },
  lg: { w: 2, h: 2 },
};

export const SIZE_LABEL: Record<WidgetSize, string> = {
  sm: 'small',
  wide: 'wide',
  tall: 'tall',
  lg: 'large',
};

export interface LayoutItem {
  id: string;
  size: WidgetSize;
}

export interface Placement {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface GridLayout {
  /** In visual reading order: by row, then column. */
  placements: Placement[];
  byId: Map<string, Placement>;
  rows: number;
  /** False when the packing fallback was needed and holes may remain. */
  exact: boolean;
}

/** Widths never exceed the grid; heights are kept, so a tall card stays tall. */
export function spanFor(size: WidgetSize, columns: number): { w: number; h: number } {
  const span = SIZE_SPAN[size];
  return { w: Math.min(span.w, Math.max(1, columns)), h: span.h };
}

/** Bounds the backtracking search. Real dashboards resolve in a few dozen steps. */
const SEARCH_BUDGET = 20_000;

class Occupancy {
  private readonly cells: boolean[] = [];
  constructor(private readonly columns: number) {}

  isFree(col: number, row: number): boolean {
    return this.cells[row * this.columns + col] !== true;
  }

  fits(col: number, row: number, w: number, h: number): boolean {
    if (col + w > this.columns) return false;
    for (let r = row; r < row + h; r += 1) {
      for (let c = col; c < col + w; c += 1) {
        if (!this.isFree(c, r)) return false;
      }
    }
    return true;
  }

  set(col: number, row: number, w: number, h: number, value: boolean): void {
    for (let r = row; r < row + h; r += 1) {
      for (let c = col; c < col + w; c += 1) {
        this.cells[r * this.columns + c] = value;
      }
    }
  }

  firstFree(): { col: number; row: number } {
    let index = 0;
    while (this.cells[index] === true) index += 1;
    return { col: index % this.columns, row: Math.floor(index / this.columns) };
  }

  /** Empty cells that sit before the last occupied one, in reading order. */
  interiorHoles(): number {
    let last = -1;
    for (let i = 0; i < this.cells.length; i += 1) if (this.cells[i] === true) last = i;
    let holes = 0;
    for (let i = 0; i < last; i += 1) if (this.cells[i] !== true) holes += 1;
    return holes;
  }
}

function tileExact(items: readonly LayoutItem[], columns: number): Placement[] | null {
  const grid = new Occupancy(columns);
  const used = new Array<boolean>(items.length).fill(false);
  const placed: Placement[] = [];
  let budget = SEARCH_BUDGET;

  const search = (remaining: number): boolean => {
    if (remaining === 0) return grid.interiorHoles() === 0;
    budget -= 1;
    if (budget < 0) return false;

    const { col, row } = grid.firstFree();
    // Two widgets of the same size at this cell lead to identical subtrees;
    // trying the first of each size is enough, and keeps sequence order.
    const triedSizes = new Set<WidgetSize>();

    for (let i = 0; i < items.length; i += 1) {
      if (used[i] === true) continue;
      const item = items[i];
      if (item === undefined || triedSizes.has(item.size)) continue;
      triedSizes.add(item.size);

      const { w, h } = spanFor(item.size, columns);
      if (!grid.fits(col, row, w, h)) continue;

      grid.set(col, row, w, h, true);
      used[i] = true;
      placed.push({ id: item.id, col, row, w, h });

      if (search(remaining - 1)) return true;

      placed.pop();
      used[i] = false;
      grid.set(col, row, w, h, false);
    }
    return false;
  };

  return search(items.length) ? placed : null;
}

function packDense(items: readonly LayoutItem[], columns: number): Placement[] {
  const grid = new Occupancy(columns);
  const placed: Placement[] = [];

  for (const item of items) {
    const { w, h } = spanFor(item.size, columns);
    for (let row = 0; ; row += 1) {
      let done = false;
      for (let col = 0; col + w <= columns; col += 1) {
        if (grid.fits(col, row, w, h)) {
          grid.set(col, row, w, h, true);
          placed.push({ id: item.id, col, row, w, h });
          done = true;
          break;
        }
      }
      if (done) break;
    }
  }
  return placed;
}

export function computeLayout(items: readonly LayoutItem[], columns: number): GridLayout {
  const cols = Math.max(1, Math.floor(columns));
  const exactPlacements = tileExact(items, cols);
  const placements = (exactPlacements ?? packDense(items, cols)).sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );

  return {
    placements,
    byId: new Map(placements.map((p) => [p.id, p])),
    rows: placements.reduce((max, p) => Math.max(max, p.row + p.h), 0),
    exact: exactPlacements !== null,
  };
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

const area = (item: LayoutItem) => SIZE_SPAN[item.size].w * SIZE_SPAN[item.size].h;

/**
 * Every order the dragged widget could reasonably end up in:
 *
 * - *moves*: taken out and reinserted at each other index;
 * - *group swaps*: exchanged with a run of up to four neighbours that together
 *   cover the same area — a large card trading places with four small ones, or
 *   a wide one with two. A move would shunt everything between the two
 *   positions; a group swap leaves the rest of the board where it was.
 */
export function candidateOrders(items: readonly LayoutItem[], draggedId: string): LayoutItem[][] {
  const from = items.findIndex((item) => item.id === draggedId);
  const dragged = items[from];
  if (dragged === undefined) return [];

  const orders: LayoutItem[][] = [];
  for (let to = 0; to < items.length; to += 1) {
    if (to !== from) orders.push(moveItem(items, from, to));
  }

  const target = area(dragged);
  for (let start = 0; start < items.length; start += 1) {
    let covered = 0;
    for (let end = start; end < items.length && end - start < 4; end += 1) {
      if (start <= from && from <= end) break;
      const member = items[end];
      if (member === undefined) break;
      covered += area(member);
      if (covered > target) break;
      if (covered !== target || (end === start && member.size === dragged.size)) continue;

      // The dragged widget takes the group's place and the group takes its.
      const group = items.slice(start, end + 1);
      orders.push(
        items.flatMap((item, index) => {
          if (index === from) return group;
          if (index === start) return [dragged];
          if (index > start && index <= end) return [];
          return [item];
        }),
      );
    }
  }
  return orders;
}

export interface Geometry {
  columns: number;
  columnWidth: number;
  rowHeight: number;
  gap: number;
}

export function slotRect(p: Placement, g: Geometry) {
  return {
    x: p.col * (g.columnWidth + g.gap),
    y: p.row * (g.rowHeight + g.gap),
    width: p.w * g.columnWidth + (p.w - 1) * g.gap,
    height: p.h * g.rowHeight + (p.h - 1) * g.gap,
  };
}

export const orderKey = (items: readonly LayoutItem[]) =>
  items.map((item) => `${item.id}:${item.size}`).join('|');

export interface SlotChoice {
  order: LayoutItem[];
  layout: GridLayout;
  distance: number;
}

/**
 * The order that lands the dragged widget's centre nearest `point`, among the
 * current order and every candidate. Distances are between centres, so a large
 * card is judged by where its middle is, not its corner.
 */
export function nearestSlot(
  items: readonly LayoutItem[],
  draggedId: string,
  point: { x: number; y: number },
  geometry: Geometry,
  /** Restricts which landing placements count, e.g. "strictly lower". */
  accept: (placement: Placement) => boolean = () => true,
): { current: SlotChoice; best: SlotChoice } {
  const measure = (order: LayoutItem[]): SlotChoice => {
    const layout = computeLayout(order, geometry.columns);
    const placement = layout.byId.get(draggedId);
    if (placement === undefined) return { order, layout, distance: Number.POSITIVE_INFINITY };
    const rect = slotRect(placement, geometry);
    const dx = rect.x + rect.width / 2 - point.x;
    const dy = rect.y + rect.height / 2 - point.y;
    return { order, layout, distance: Math.hypot(dx, dy) };
  };

  const current = measure([...items]);
  let best: SlotChoice = { ...current, distance: Number.POSITIVE_INFINITY };
  const consider = (choice: SlotChoice) => {
    const placement = choice.layout.byId.get(draggedId);
    if (placement === undefined || !accept(placement)) return;
    if (choice.distance < best.distance - 0.5) best = choice;
  };

  consider(current);
  for (const order of candidateOrders(items, draggedId)) consider(measure(order));
  return { current, best: Number.isFinite(best.distance) ? best : current };
}
