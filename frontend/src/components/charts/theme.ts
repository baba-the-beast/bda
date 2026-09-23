/**
 * Chart theme.
 *
 * The series palette is generated in OKLCh inside the hue range the rest of the
 * product lives in — ember through amber to bronze, verdigris, night blue, and
 * plum — and then checked, not eyeballed. Slot 1 is the filament amber, because
 * a single-series chart only ever uses slot 1 and that is the colour the app is
 * built around.
 *
 * Checked against this app's panel surface (#1f1c24) over EVERY pair of slots,
 * simulating each dichromacy at full severity:
 *
 *   lightness band  PASS   L 0.56-0.80
 *   chroma floor    PASS   all 8 >= 0.10
 *   all pairs       PASS   worst dE 7.8 (mint/periwinkle, tritanopia)
 *   contrast        PASS   all 8 >= 3.42:1 on the surface, >= 3.8:1 on canvas
 *
 * The previous set was only ever checked on *adjacent* pairs. It scored 1.5 on
 * this all-pairs measure: its three warm slots were mutually indistinguishable
 * under protanopia whenever a legend put them apart. Lightness has to carry
 * some of the separation, which is why these eight are not one flat band.
 *
 * Slots are assigned in order and never cycled. A ninth series folds into
 * "Other" or becomes a small multiple; it does not get a generated hue.
 */
import { useMemo } from 'react';

import { useTheme, type ResolvedTheme } from '../../app/ThemeProvider';

export const SERIES_PALETTE = [
  '#e8a53d', // 1 filament amber
  '#4f6cc8', // 2 deep indigo
  '#5ed3a3', // 3 verdigris
  '#a8528f', // 4 plum
  '#a7baff', // 5 periwinkle
  '#8a7a1e', // 6 bronze
  '#1ca4e2', // 7 sky
  '#e17174', // 8 ember red
] as const;

/**
 * The same eight slots, deepened for the light surface (#fffdfa) so every one
 * clears 3:1 as a non-text mark (worst: slot 3 verdigris, 4.3:1). Order and hue
 * families match the dark set, so a series keeps its identity across themes.
 * Contrast is checked; the all-pairs dichromacy check above was run on the dark
 * set only, and this set keeps its lightness spread rather than being re-derived.
 */
export const SERIES_PALETTE_LIGHT = [
  '#a8620a', // 1 filament amber, deepened
  '#3a56b0', // 2 deep indigo
  '#1d8a62', // 3 verdigris
  '#9a3f80', // 4 plum
  '#5a6fd0', // 5 periwinkle
  '#7a6a10', // 6 bronze
  '#0a78b0', // 7 sky
  '#c04548', // 8 ember red
] as const;

export const MAX_SERIES = SERIES_PALETTE.length;

/**
 * Chrome colours, read from the design tokens at runtime so the charts follow
 * the token file rather than keeping a second copy of the palette.
 */
function token(name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw === '' ? fallback : `rgb(${raw})`;
}

export interface ChartChrome {
  /** Series slots for the active theme. */
  palette: readonly string[];
  /** A faint wash for axis-pointer shadows, visible on either surface. */
  pointerShadow: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  surface: string;
  surfaceRaised: string;
}

export function readChrome(theme: ResolvedTheme = currentTheme()): ChartChrome {
  const light = theme === 'light';
  return {
    palette: light ? SERIES_PALETTE_LIGHT : SERIES_PALETTE,
    pointerShadow: light ? 'rgb(0 0 0 / 0.05)' : 'rgb(255 255 255 / 0.04)',
    text: token('--color-text', 'rgb(237 232 228)'),
    textMuted: token('--color-text-muted', 'rgb(167 159 169)'),
    textSubtle: token('--color-text-subtle', 'rgb(147 138 150)'),
    border: token('--color-border', 'rgb(48 43 55)'),
    borderStrong: token('--color-border-strong', 'rgb(72 65 81)'),
    surface: token('--color-surface', 'rgb(31 28 36)'),
    surfaceRaised: token('--color-surface-raised', 'rgb(41 36 48)'),
  };
}

function currentTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Chrome for the active theme, stable between renders.
 *
 * Canvas charts cannot follow a CSS variable change on their own, so they
 * re-read the tokens when the theme flips — and only then, rather than building
 * a new option object (and a full ECharts diff) on every render.
 */
export function useChartChrome(): ChartChrome {
  const { resolved } = useTheme();
  return useMemo(() => readChrome(resolved), [resolved]);
}

/** Hairline, solid, one shade off the surface. Never dashed. */
export const axisCommon = (chrome: ChartChrome) => ({
  axisLine: { show: true, lineStyle: { color: chrome.border, width: 1 } },
  axisTick: { show: false },
  axisLabel: {
    color: chrome.textSubtle,
    fontSize: 11,
    fontFamily: 'var(--font-sans)',
  },
  splitLine: { show: false },
});

export const valueAxisCommon = (chrome: ChartChrome) => ({
  ...axisCommon(chrome),
  axisLine: { show: false },
  splitLine: { show: true, lineStyle: { color: chrome.border, width: 1, type: 'solid' as const } },
});

export const gridCommon = {
  left: 8,
  right: 16,
  top: 8,
  // Leaves room for the x-axis band, so the card never grows a nested scrollbar.
  bottom: 4,
  containLabel: true,
};

export const tooltipCommon = (chrome: ChartChrome) => ({
  backgroundColor: chrome.surfaceRaised,
  borderColor: chrome.border,
  borderWidth: 1,
  padding: [6, 8] as [number, number],
  textStyle: { color: chrome.text, fontSize: 12, fontFamily: 'var(--font-sans)' },
  extraCssText: 'border-radius:4px;box-shadow:0 4px 12px rgb(0 0 0 / 0.45);',
});
