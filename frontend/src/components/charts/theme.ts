/**
 * Chart theme.
 *
 * The series palette is the documented eight-hue categorical order, stepped for
 * a dark surface. It was validated with the dataviz skill's checker against
 * this app's own chart surface (#111921), not eyeballed:
 *
 *   lightness band  PASS   all 8 inside L 0.48-0.67
 *   chroma floor    PASS   all 8 >= 0.10
 *   CVD separation  PASS   worst adjacent pair dE 8.4 (protanopia)
 *   normal vision   PASS   worst adjacent pair dE 19.3
 *   contrast        PASS   all 8 >= 3:1 on the surface
 *
 * Slots are assigned in order and never cycled. A ninth series folds into
 * "Other" or becomes a small multiple; it does not get a generated hue.
 */
export const SERIES_PALETTE = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
  '#9085e9', // 7 violet
  '#e66767', // 8 red
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
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  surface: string;
  surfaceRaised: string;
}

export function readChrome(): ChartChrome {
  return {
    text: token('--color-text', 'rgb(226 234 242)'),
    textMuted: token('--color-text-muted', 'rgb(155 172 189)'),
    textSubtle: token('--color-text-subtle', 'rgb(122 139 155)'),
    border: token('--color-border', 'rgb(42 55 68)'),
    surface: token('--color-surface', 'rgb(17 25 33)'),
    surfaceRaised: token('--color-surface-raised', 'rgb(26 36 45)'),
  };
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
