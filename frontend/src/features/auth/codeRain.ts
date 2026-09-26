/**
 * "Code Rain": a photo re-drawn as a grid of binary glyphs, tinted green and
 * run through a CRT-style post chain (bloom, glitch, scan lines, grain,
 * vignette), flickering over time.
 *
 * Only the configuration the landing page uses is implemented: the
 * "characters" render mode, a solid background, overlay tint and the five
 * post-effects it enables. The grid is sampled once per size, so a frame is
 * glyph drawing and compositing only.
 */

export interface CodeRainParams {
  cellSize: number;
  /** % of cells drawn. */
  coverage: number;
  /** % luminance below which a cell stays empty. */
  density: number;
  invert: boolean;
  charSet: string;
  /** -100..100 */
  brightness: number;
  /** % — 100 is unchanged. */
  contrast: number;
  /** 0..100: how strongly Sobel edges brighten a cell. */
  edgeEmphasis: number;
  /** % — 100 is unchanged. */
  saturation: number;
  /** 0..100 */
  grayscale: number;
  background: string;
  /** 0..100 */
  bgOpacity: number;
  tint: string;
  /** 0..100 */
  tintOpacity: number;
  overlayBlend: GlobalCompositeOperation;
  /** 0..100 for each effect; 0 disables it. */
  pfx: {
    scanLines: number;
    vignette: number;
    bloom: number;
    filmGrain: number;
    glitch: number;
  };
  /** 0..100: how often glyphs change. */
  animSpeed: number;
  /** 0..100: how far a flickering cell dims. */
  animIntensity: number;
}

/** The landing page's settings, from the 21st.dev "Code Rain" preset. */
export const CODE_RAIN: CodeRainParams = {
  cellSize: 14,
  coverage: 96,
  density: 0,
  invert: false,
  charSet: '01',
  brightness: 0,
  contrast: 115,
  edgeEmphasis: 40,
  saturation: 100,
  grayscale: 0,
  background: '#030604',
  bgOpacity: 90,
  tint: '#00ff66',
  tintOpacity: 45,
  overlayBlend: 'overlay',
  pfx: { scanLines: 28, vignette: 38, bloom: 25, filmGrain: 40, glitch: 20 },
  animSpeed: 100,
  animIntensity: 60,
};

/** One sampled grid cell: display colour (0..255) and luminance (0..1). */
export interface Cell {
  r: number;
  g: number;
  b: number;
  lum: number;
  /** Stable per-cell random in [0, 1), for coverage and flicker phase. */
  seed: number;
}

export interface CellGrid {
  cols: number;
  rows: number;
  cells: Cell[];
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Rec. 709 luma of 0..255 channels, as 0..1. */
export const luminance = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Integer hash to [0, 1). Deterministic, so a cell keeps its identity. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Brightness, contrast, saturation, grayscale — in that order. */
export function adjustColor(
  r: number,
  g: number,
  b: number,
  p: Pick<CodeRainParams, 'brightness' | 'contrast' | 'saturation' | 'grayscale'>,
): [number, number, number] {
  const shift = (p.brightness / 100) * 255;
  const k = p.contrast / 100;
  let rr = (r + shift - 128) * k + 128;
  let gg = (g + shift - 128) * k + 128;
  let bb = (b + shift - 128) * k + 128;

  const grey = luminance(rr, gg, bb) * 255;
  const sat = (p.saturation / 100) * (1 - p.grayscale / 100);
  rr = grey + (rr - grey) * sat;
  gg = grey + (gg - grey) * sat;
  bb = grey + (bb - grey) * sat;

  return [clamp255(rr), clamp255(gg), clamp255(bb)];
}

/**
 * Average each cellSize block of `pixels` (RGBA, width × height), adjust the
 * colour, and brighten cells on edges (Sobel over the luminance grid).
 */
export function sampleGrid(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  p: CodeRainParams,
): CellGrid {
  const size = p.cellSize;
  const cols = Math.max(1, Math.ceil(width / size));
  const rows = Math.max(1, Math.ceil(height / size));
  const base: Cell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const y1 = Math.min(height, (row + 1) * size);
      const x1 = Math.min(width, (col + 1) * size);
      // Every other pixel each way: a quarter of the reads, the same average.
      for (let y = row * size; y < y1; y += 2) {
        for (let x = col * size; x < x1; x += 2) {
          const i = (y * width + x) * 4;
          r += pixels[i] ?? 0;
          g += pixels[i + 1] ?? 0;
          b += pixels[i + 2] ?? 0;
          n++;
        }
      }
      const [ar, ag, ab] = adjustColor(r / n, g / n, b / n, p);
      const lum = luminance(ar, ag, ab);
      base.push({
        r: ar,
        g: ag,
        b: ab,
        lum: p.invert ? 1 - lum : lum,
        seed: hash01(row * 7919 + col),
      });
    }
  }

  if (p.edgeEmphasis <= 0) return { cols, rows, cells: base };

  const at = (c: number, r: number) =>
    base[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))]?.lum ?? 0;
  const k = p.edgeEmphasis / 100;
  const cells = base.map((cell, i) => {
    const c = i % cols;
    const r = (i - c) / cols;
    const gx =
      at(c + 1, r - 1) +
      2 * at(c + 1, r) +
      at(c + 1, r + 1) -
      (at(c - 1, r - 1) + 2 * at(c - 1, r) + at(c - 1, r + 1));
    const gy =
      at(c - 1, r + 1) +
      2 * at(c, r + 1) +
      at(c + 1, r + 1) -
      (at(c - 1, r - 1) + 2 * at(c, r - 1) + at(c + 1, r - 1));
    const edge = Math.min(1, Math.hypot(gx, gy) / 4);
    const boost = 1 + edge * k * 1.5;
    return {
      ...cell,
      r: clamp255(cell.r * boost + edge * k * 60),
      g: clamp255(cell.g * boost + edge * k * 60),
      b: clamp255(cell.b * boost + edge * k * 60),
      lum: Math.min(1, cell.lum + edge * k),
    };
  });
  return { cols, rows, cells };
}

/** Whether a cell is drawn at all, from coverage and density. */
export const isDrawn = (cell: Cell, p: CodeRainParams) =>
  cell.seed < p.coverage / 100 && cell.lum >= p.density / 100;

/**
 * The glyph a cell shows at time `t` (ms). Each cell changes on its own clock,
 * so the field shimmers rather than switching in unison.
 */
export function glyphAt(cellIndex: number, cell: Cell, t: number, p: CodeRainParams): string {
  const chars = p.charSet;
  if (chars.length === 1 || p.animSpeed <= 0) {
    return chars.charAt(Math.floor(cell.seed * 997) % chars.length);
  }
  // 0.5–6 changes a second at full speed, spread across cells.
  const rate = (p.animSpeed / 100) * (0.5 + cell.seed * 5.5);
  const tick = Math.floor((t / 1000) * rate + cell.seed * 13);
  return chars.charAt(Math.floor(hash01(cellIndex * 31 + tick) * chars.length));
}

/** Brightness multiplier for the flicker animation at time `t` (ms). */
export function flickerAt(cellIndex: number, cell: Cell, t: number, p: CodeRainParams): number {
  if (p.animIntensity <= 0) return 1;
  const speed = 4 + (p.animSpeed / 100) * 14;
  const tick = Math.floor((t / 1000) * speed + cell.seed * 50);
  const n = hash01(cellIndex * 131 + tick);
  // Most frames a cell sits near full; now and then it drops out.
  const dip = n > 0.85 ? 1 : n * 0.25;
  return 1 - dip * (p.animIntensity / 100);
}

// ---------------------------------------------------------------------------
// Source scene
// ---------------------------------------------------------------------------

/** Small seeded PRNG so the generated scene is identical on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A night grid at dusk, drawn in place of a photograph: a glowing horizon, a
 * city of lit windows, and transmission towers carrying lines across it.
 */
export function drawEnergyScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = mulberry32(20061216);
  const horizon = h * 0.68;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#101a17');
  sky.addColorStop(0.5, '#3d5c50');
  sky.addColorStop(1, '#e2f5e8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const moon = ctx.createRadialGradient(w * 0.78, h * 0.22, 0, w * 0.78, h * 0.22, h * 0.32);
  moon.addColorStop(0, 'rgba(230,255,240,0.95)');
  moon.addColorStop(0.18, 'rgba(200,240,215,0.55)');
  moon.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, w, h);

  // Skyline, back row then front row, each window a chance of being lit.
  for (const [depth, shade, litChance] of [
    [0.18, '#56786a', 0.3],
    [0.32, '#2a3d35', 0.45],
  ] as const) {
    let x = -10;
    while (x < w) {
      const bw = 30 + rand() * 90;
      const bh = h * (0.08 + rand() * depth);
      ctx.fillStyle = shade;
      ctx.fillRect(x, horizon - bh, bw, h - horizon + bh);
      for (let wy = horizon - bh + 8; wy < horizon + h * 0.2; wy += 12) {
        for (let wx = x + 6; wx < x + bw - 6; wx += 10) {
          if (rand() < litChance) {
            ctx.fillStyle = rand() < 0.7 ? '#fff6c8' : '#bff5d6';
            ctx.fillRect(wx, wy, 6, 7);
          }
        }
      }
      x += bw + rand() * 8;
    }
  }

  ctx.fillStyle = '#0c1210';
  ctx.fillRect(0, h * 0.88, w, h * 0.12);

  // Transmission towers and the catenary lines between them.
  const towerX = [0.08, 0.36, 0.64, 0.92].map((f) => f * w);
  const top = h * 0.3;
  const base = h * 0.9;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (const tx of towerX) {
    const half = (base - top) * 0.16;
    ctx.lineWidth = Math.max(6, w / 180);
    ctx.beginPath();
    ctx.moveTo(tx - half, base);
    ctx.lineTo(tx, top);
    ctx.lineTo(tx + half, base);
    ctx.stroke();
    ctx.lineWidth = Math.max(4, w / 320);
    for (let i = 1; i < 6; i++) {
      const y = top + ((base - top) * i) / 6;
      const spread = (half * i) / 6;
      ctx.beginPath();
      ctx.moveTo(tx - spread, y);
      ctx.lineTo(tx + spread, y + (base - top) / 6);
      ctx.moveTo(tx + spread, y);
      ctx.lineTo(tx - spread, y + (base - top) / 6);
      ctx.stroke();
    }
    for (const [arm, y] of [
      [0.26, top + (base - top) * 0.12],
      [0.2, top + (base - top) * 0.26],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(tx - (base - top) * arm, y);
      ctx.lineTo(tx + (base - top) * arm, y);
      ctx.stroke();
    }
  }
  ctx.lineWidth = Math.max(4, w / 360);
  for (const [arm, y] of [
    [-0.26, 0.12],
    [0.26, 0.12],
    [-0.2, 0.26],
    [0.2, 0.26],
  ] as const) {
    ctx.beginPath();
    const yy = top + (base - top) * y;
    for (const [i, next] of towerX.slice(1).entries()) {
      const x0 = (towerX[i] ?? next) + (base - top) * arm;
      const x1 = next + (base - top) * arm;
      ctx.moveTo(x0, yy);
      ctx.quadraticCurveTo((x0 + x1) / 2, yy + h * 0.09, x1, yy);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export interface CodeRainRenderer {
  /** Size the canvas in CSS pixels and resample the source. */
  resize(width: number, height: number, dpr: number): void;
  /** Draw one frame at time `t` (ms). */
  frame(t: number): void;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Returns null when the browser has no 2D canvas (jsdom, some locked-down
 * contexts); the page then simply shows the background colour.
 */
export function createCodeRain(
  canvas: HTMLCanvasElement,
  p: CodeRainParams = CODE_RAIN,
  source?: CanvasImageSource & { width: number; height: number },
): CodeRainRenderer | null {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx === null) return null;
  const context: CanvasRenderingContext2D = ctx;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let grid: CellGrid = { cols: 0, rows: 0, cells: [] };
  /** Drawn cell indices grouped by glyph size, so the font is set per group. */
  let bySize = new Map<number, number[]>();
  let bloomCanvas: HTMLCanvasElement | null = null;
  let scanPattern: CanvasPattern | null = null;
  let vignette: CanvasGradient | null = null;
  let fontFamily = 'monospace';
  const grainTiles: HTMLCanvasElement[] = [];

  // Film grain: a few noise tiles, cycled with random offsets per frame.
  for (let i = 0; i < 4; i++) {
    const noise = mulberry32(i + 1);
    const tile = makeCanvas(128, 128);
    const tctx = tile.getContext('2d');
    if (tctx === null) break;
    const img = tctx.createImageData(128, 128);
    for (let j = 0; j < img.data.length; j += 4) {
      const v = noise() * 255;
      img.data[j] = v;
      img.data[j + 1] = v;
      img.data[j + 2] = v;
      img.data[j + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    grainTiles.push(tile);
  }

  function resize(w: number, h: number, ratio: number) {
    width = Math.max(1, Math.round(w));
    height = Math.max(1, Math.round(h));
    dpr = ratio;
    fontFamily = getComputedStyle(canvas).getPropertyValue('--font-mono').trim() || 'monospace';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // Sample in CSS pixels so cellSize means what it says at any density.
    const src = makeCanvas(width, height);
    const sctx = src.getContext('2d', { willReadFrequently: true });
    if (sctx === null) return;
    if (source === undefined) {
      drawEnergyScene(sctx, width, height);
    } else {
      // object-fit: cover
      const scale = Math.max(width / source.width, height / source.height);
      const dw = source.width * scale;
      const dh = source.height * scale;
      sctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
    }
    grid = sampleGrid(sctx.getImageData(0, 0, width, height).data, width, height, p);
    bySize = new Map();
    grid.cells.forEach((cell, i) => {
      if (!isDrawn(cell, p)) return;
      const px = Math.round(p.cellSize * (0.55 + 0.6 * cell.lum));
      const group = bySize.get(px);
      if (group === undefined) bySize.set(px, [i]);
      else group.push(i);
    });

    bloomCanvas = makeCanvas(width / 4, height / 4);

    const line = makeCanvas(1, 3);
    const lctx = line.getContext('2d');
    if (lctx !== null) {
      lctx.fillStyle = `rgba(0,0,0,${String((p.pfx.scanLines / 100) * 0.9)})`;
      lctx.fillRect(0, 2, 1, 1);
      scanPattern = context.createPattern(line, 'repeat');
    }

    const radius = Math.hypot(width, height) / 2;
    vignette = context.createRadialGradient(
      width / 2,
      height / 2,
      radius * 0.35,
      width / 2,
      height / 2,
      radius,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${String(Math.min(1, (p.pfx.vignette / 100) * 2))})`);
  }

  function frame(t: number) {
    const c = context;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // 1. Solid background. Opacity is against black: nothing sits behind it.
    c.fillStyle = '#000';
    c.fillRect(0, 0, width, height);
    c.globalAlpha = p.bgOpacity / 100;
    c.fillStyle = p.background;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    // 2–3. Glyphs, sized and coloured by luminance.
    const size = p.cellSize;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [px, indices] of bySize) {
      c.font = `500 ${String(px)}px ${fontFamily}`;
      for (const i of indices) {
        const cell = grid.cells[i];
        if (cell === undefined) continue;
        const lit = cell.lum * flickerAt(i, cell, t, p);
        if (lit < 0.03) continue;
        const k = 0.35 + 0.65 * lit;
        c.fillStyle = `rgb(${String((cell.r * k) | 0)},${String((cell.g * k) | 0)},${String((cell.b * k) | 0)})`;
        const col = i % grid.cols;
        const row = (i - col) / grid.cols;
        c.fillText(glyphAt(i, cell, t, p), col * size + size / 2, row * size + size / 2);
      }
    }

    // 4. Tint.
    if (p.tintOpacity > 0) {
      c.globalCompositeOperation = p.overlayBlend;
      c.globalAlpha = p.tintOpacity / 100;
      c.fillStyle = p.tint;
      c.fillRect(0, 0, width, height);
      // Overlay leaves black black; a thin colour pass gives the glyphs their hue.
      c.globalCompositeOperation = 'color';
      c.globalAlpha = (p.tintOpacity / 100) * 0.8;
      c.fillRect(0, 0, width, height);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    // 5. Post-effects.
    if (p.pfx.bloom > 0 && bloomCanvas !== null) {
      // Downscale then upscale with smoothing: a cheap wide blur.
      const bctx = bloomCanvas.getContext('2d');
      if (bctx !== null) {
        bctx.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (p.pfx.bloom / 100) * 1.2;
        c.imageSmoothingEnabled = true;
        c.drawImage(bloomCanvas, 0, 0, width, height);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
    }

    if (p.pfx.glitch > 0) {
      // A burst every so often: a few bands slide sideways for a moment.
      const slot = Math.floor(t / 90);
      if (hash01(slot) < (p.pfx.glitch / 100) * 0.6) {
        const bands = 1 + Math.floor(hash01(slot + 1) * 4);
        for (let b = 0; b < bands; b++) {
          const y = hash01(slot * 7 + b) * height;
          const bh = 4 + hash01(slot * 11 + b) * 26;
          const dx = (hash01(slot * 13 + b) - 0.5) * (p.pfx.glitch / 100) * 160;
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.drawImage(
            canvas,
            0,
            y * dpr,
            canvas.width,
            bh * dpr,
            dx * dpr,
            y * dpr,
            canvas.width,
            bh * dpr,
          );
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
    }

    if (p.pfx.scanLines > 0 && scanPattern !== null) {
      c.fillStyle = scanPattern;
      c.fillRect(0, 0, width, height);
    }

    if (p.pfx.filmGrain > 0 && grainTiles.length > 0) {
      const tile = grainTiles[Math.floor(t / 42) % grainTiles.length];
      const pattern = tile === undefined ? null : c.createPattern(tile, 'repeat');
      if (pattern !== null) {
        const ox = Math.floor(hash01(Math.floor(t / 42)) * 128);
        c.save();
        c.translate(-ox, -ox);
        c.globalCompositeOperation = 'overlay';
        c.globalAlpha = (p.pfx.filmGrain / 100) * 0.35;
        c.fillStyle = pattern;
        c.fillRect(ox, ox, width, height);
        c.restore();
      }
    }

    if (p.pfx.vignette > 0 && vignette !== null) {
      c.fillStyle = vignette;
      c.fillRect(0, 0, width, height);
    }
  }

  return { resize, frame };
}
