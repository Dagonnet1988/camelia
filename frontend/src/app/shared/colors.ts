export interface ChartTheme {
  surface: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  gridline: string;
  baseline: string;
  series: string[];
  good: string;
  warning: string;
  serious: string;
}

// Categorical order is fixed — never cycle or reassign by rank. See dataviz skill / palette.md.
const LIGHT: ChartTheme = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  series: [
    '#2a78d6', // blue
    '#eb6834', // orange
    '#1baf7a', // aqua
    '#eda100', // yellow
    '#e87ba4', // magenta
    '#008300', // green
    '#4a3aa7', // violet
    '#e34948', // red
  ],
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
};

const DARK: ChartTheme = {
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  series: [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ],
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
};

export function getChartTheme(): ChartTheme {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? DARK : LIGHT;
}
