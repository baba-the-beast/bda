import { describe, expect, it } from 'vitest';

import {
  CODE_RAIN,
  adjustColor,
  flickerAt,
  glyphAt,
  hash01,
  isDrawn,
  luminance,
  sampleGrid,
  type Cell,
} from './codeRain';

const NEUTRAL = { brightness: 0, contrast: 100, saturation: 100, grayscale: 0 };

/** A width × height RGBA buffer filled by `fill(x, y)`. */
function image(width: number, height: number, fill: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fill(x, y);
      const i = (y * width + x) * 4;
      data.set([v, v, v, 255], i);
    }
  }
  return data;
}

const cell = (overrides: Partial<Cell> = {}): Cell => ({
  r: 200,
  g: 200,
  b: 200,
  lum: 0.8,
  seed: 0.5,
  ...overrides,
});

describe('adjustColor', () => {
  it('leaves a colour alone at neutral settings', () => {
    expect(adjustColor(10, 120, 240, NEUTRAL)).toEqual([10, 120, 240]);
  });

  it('pushes values away from mid-grey as contrast rises', () => {
    const [dark] = adjustColor(60, 60, 60, { ...NEUTRAL, contrast: 150 });
    const [light] = adjustColor(200, 200, 200, { ...NEUTRAL, contrast: 150 });
    expect(dark).toBeLessThan(60);
    expect(light).toBeGreaterThan(200);
  });

  it('removes colour at full grayscale', () => {
    const [r, g, b] = adjustColor(255, 0, 0, { ...NEUTRAL, grayscale: 100 });
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
  });

  it('clamps to the channel range', () => {
    expect(adjustColor(250, 5, 128, { ...NEUTRAL, contrast: 400 })).toEqual([255, 0, 128]);
  });
});

describe('sampleGrid', () => {
  const params = { ...CODE_RAIN, contrast: 100, edgeEmphasis: 0 };

  it('averages each cell and covers a partial last row and column', () => {
    const grid = sampleGrid(
      image(30, 20, () => 128),
      30,
      20,
      params,
    );
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
    for (const c of grid.cells) expect(c.lum).toBeCloseTo(luminance(128, 128, 128));
  });

  it('inverts luminance when asked', () => {
    const plain = sampleGrid(
      image(14, 14, () => 255),
      14,
      14,
      params,
    );
    const inverted = sampleGrid(
      image(14, 14, () => 255),
      14,
      14,
      { ...params, invert: true },
    );
    expect(plain.cells[0]?.lum).toBeCloseTo(1);
    expect(inverted.cells[0]?.lum).toBeCloseTo(0);
  });

  it('brightens cells on an edge and not on flat ground', () => {
    // Left half black, right half white: the seam columns are the edge.
    const pixels = image(56, 56, (x) => (x < 28 ? 0 : 255));
    const flat = sampleGrid(pixels, 56, 56, params);
    const edged = sampleGrid(pixels, 56, 56, { ...params, edgeEmphasis: 100 });
    const seam = 1; // column 1 of 4 borders the white half
    const far = 0;
    expect(edged.cells[seam]?.lum).toBeGreaterThan(flat.cells[seam]?.lum ?? 1);
    expect(edged.cells[far]?.lum).toBeCloseTo(flat.cells[far]?.lum ?? -1);
  });

  it('gives every cell a stable seed', () => {
    const a = sampleGrid(
      image(28, 28, () => 90),
      28,
      28,
      params,
    );
    const b = sampleGrid(
      image(28, 28, () => 200),
      28,
      28,
      params,
    );
    expect(a.cells.map((c) => c.seed)).toEqual(b.cells.map((c) => c.seed));
  });
});

describe('coverage and density', () => {
  it('draws roughly the covered share of cells', () => {
    const cells = Array.from({ length: 5000 }, (_, i) => cell({ seed: hash01(i) }));
    const drawn = cells.filter((c) => isDrawn(c, { ...CODE_RAIN, coverage: 60 })).length;
    expect(drawn / cells.length).toBeGreaterThan(0.55);
    expect(drawn / cells.length).toBeLessThan(0.65);
  });

  it('skips cells darker than the density threshold', () => {
    expect(isDrawn(cell({ lum: 0.2, seed: 0 }), { ...CODE_RAIN, density: 30 })).toBe(false);
    expect(isDrawn(cell({ lum: 0.4, seed: 0 }), { ...CODE_RAIN, density: 30 })).toBe(true);
  });
});

describe('animation', () => {
  it('only ever shows glyphs from the character set', () => {
    for (let t = 0; t < 5000; t += 137) {
      expect(['0', '1']).toContain(glyphAt(7, cell(), t, CODE_RAIN));
    }
  });

  it('holds glyphs still when speed is zero', () => {
    const still = { ...CODE_RAIN, animSpeed: 0 };
    expect(glyphAt(3, cell(), 0, still)).toBe(glyphAt(3, cell(), 9000, still));
  });

  it('flickers within the configured depth', () => {
    for (let t = 0; t < 5000; t += 53) {
      const f = flickerAt(11, cell(), t, CODE_RAIN);
      expect(f).toBeGreaterThanOrEqual(1 - CODE_RAIN.animIntensity / 100);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(flickerAt(11, cell(), 1234, { ...CODE_RAIN, animIntensity: 0 })).toBe(1);
  });
});
