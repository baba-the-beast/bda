import { describe, expect, it } from 'vitest';

import {
  candidateOrders,
  computeLayout,
  moveItem,
  nearestSlot,
  spanFor,
  WIDGET_SIZES,
  type GridLayout,
  type LayoutItem,
  type WidgetSize,
} from './widget-grid-layout';

const items = (...sizes: WidgetSize[]): LayoutItem[] =>
  sizes.map((size, index) => ({ id: `w${String(index)}`, size }));

/** Cells in reading order, each holding the id that covers it, or null. */
function cells(layout: GridLayout, columns: number): (string | null)[] {
  const grid: (string | null)[] = new Array<string | null>(layout.rows * columns).fill(null);
  for (const p of layout.placements) {
    for (let r = p.row; r < p.row + p.h; r += 1) {
      for (let c = p.col; c < p.col + p.w; c += 1) {
        const index = r * columns + c;
        if (grid[index] !== null) throw new Error(`overlap at ${String(r)},${String(c)}`);
        grid[index] = p.id;
      }
    }
  }
  return grid;
}

function interiorHoles(layout: GridLayout, columns: number): number {
  const grid = cells(layout, columns);
  const last = grid.reduce<number>((acc, id, index) => (id === null ? acc : index), -1);
  return grid.slice(0, last).filter((id) => id === null).length;
}

/** A small deterministic generator, so a failing case can be replayed. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('spanFor', () => {
  it('clamps width to the column count but keeps height', () => {
    expect(spanFor('lg', 4)).toEqual({ w: 2, h: 2 });
    expect(spanFor('lg', 1)).toEqual({ w: 1, h: 2 });
    expect(spanFor('wide', 1)).toEqual({ w: 1, h: 1 });
  });
});

describe('computeLayout', () => {
  it('keeps the sequence when it already tiles', () => {
    const layout = computeLayout(items('wide', 'wide', 'sm', 'sm', 'sm', 'sm'), 4);
    expect(layout.exact).toBe(true);
    expect(layout.placements.map((p) => [p.id, p.col, p.row])).toEqual([
      ['w0', 0, 0],
      ['w1', 2, 0],
      ['w2', 0, 1],
      ['w3', 1, 1],
      ['w4', 2, 1],
      ['w5', 3, 1],
    ]);
  });

  it('reorders only as far as it must to close a gap', () => {
    // In order, the tall card at column 3 would leave three holes under row 0.
    const layout = computeLayout(items('sm', 'sm', 'sm', 'tall', 'sm', 'sm', 'sm'), 4);
    expect(layout.exact).toBe(true);
    expect(interiorHoles(layout, 4)).toBe(0);
    // The first three stay first.
    expect(layout.placements.slice(0, 3).map((p) => p.id)).toEqual(['w0', 'w1', 'w2']);
  });

  it('tiles the default dashboard exactly at four, two and one columns', () => {
    const board = items('wide', 'lg', 'wide', 'tall', 'tall', 'sm', 'sm', 'wide');
    for (const columns of [4, 2, 1]) {
      const layout = computeLayout(board, columns);
      expect(layout.exact).toBe(true);
      expect(interiorHoles(layout, columns)).toBe(0);
      expect(layout.placements).toHaveLength(board.length);
    }
    expect(computeLayout(board, 4).rows).toBe(4);
  });

  it('puts every card in one column below the narrow breakpoint', () => {
    const layout = computeLayout(items('lg', 'wide', 'tall', 'sm'), 1);
    expect(layout.placements.every((p) => p.col === 0 && p.w === 1)).toBe(true);
    expect(layout.rows).toBe(2 + 1 + 2 + 1);
  });

  it('falls back to packing when no exact tiling exists', () => {
    // Three 2x2 cards and one 1x1 in four columns cannot avoid an interior hole.
    const layout = computeLayout(items('lg', 'lg', 'lg', 'sm'), 4);
    expect(layout.exact).toBe(false);
    expect(layout.placements).toHaveLength(4);
    expect(() => cells(layout, 4)).not.toThrow();
  });

  it('never overlaps, never drops a card, and is gap-free whenever it says so', () => {
    const random = seeded(42);
    for (let trial = 0; trial < 400; trial += 1) {
      const count = 1 + Math.floor(random() * 11);
      const board = Array.from({ length: count }, (_, index) => ({
        id: `w${String(index)}`,
        size: WIDGET_SIZES[Math.floor(random() * WIDGET_SIZES.length)] ?? 'sm',
      }));
      const columns = 1 + Math.floor(random() * 4);
      const layout = computeLayout(board, columns);

      expect(layout.placements).toHaveLength(count);
      expect(new Set(layout.placements.map((p) => p.id)).size).toBe(count);
      expect(layout.placements.every((p) => p.col + p.w <= columns)).toBe(true);
      expect(() => cells(layout, columns)).not.toThrow();
      if (layout.exact) expect(interiorHoles(layout, columns)).toBe(0);
    }
  });

  it('returns placements in reading order', () => {
    const layout = computeLayout(items('tall', 'sm', 'wide', 'sm'), 4);
    const keys = layout.placements.map((p) => p.row * 4 + p.col);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });
});

describe('reordering', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('offers a group swap of a large card for four small neighbours', () => {
    const board = items('lg', 'sm', 'sm', 'sm', 'sm', 'wide');
    const orders = candidateOrders(board, 'w0').map((order) => order.map((i) => i.id).join(','));
    expect(orders).toContain('w1,w2,w3,w4,w0,w5');
  });

  it('offers a wide card a swap with two small ones, leaving the rest alone', () => {
    const board = items('sm', 'wide', 'sm', 'sm', 'sm', 'sm');
    const orders = candidateOrders(board, 'w1').map((order) => order.map((i) => i.id).join(','));
    expect(orders).toContain('w0,w4,w5,w2,w3,w1');
  });

  it('picks the slot whose centre is nearest the pointer', () => {
    const board = items('sm', 'sm', 'sm', 'sm');
    const geometry = { columns: 4, columnWidth: 100, rowHeight: 100, gap: 10 };
    // Centre of the last column.
    const { best } = nearestSlot(board, 'w0', { x: 3 * 110 + 50, y: 50 }, geometry);
    expect(best.layout.byId.get('w0')?.col).toBe(3);
  });

  it('can restrict the landing slot, as keyboard row moves do', () => {
    const board = items('sm', 'sm', 'sm', 'sm');
    const geometry = { columns: 2, columnWidth: 100, rowHeight: 100, gap: 10 };
    const { best } = nearestSlot(board, 'w0', { x: 50, y: 160 }, geometry, (p) => p.row > 0);
    expect(best.layout.byId.get('w0')?.row).toBe(1);
  });
});
