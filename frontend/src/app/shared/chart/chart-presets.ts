import type { ChartConfiguration } from 'chart.js/auto';
import type { ChartTheme } from '../colors';

function baseScales(theme: ChartTheme) {
  return {
    x: {
      grid: { color: theme.gridline, display: false },
      border: { color: theme.baseline },
      ticks: { color: theme.muted },
    },
    y: {
      grid: { color: theme.gridline },
      border: { display: false },
      ticks: { color: theme.muted },
      beginAtZero: true,
    },
  };
}

/** Single-hue magnitude ranking (top productos, margen, rotacion). */
export function sequentialBarConfig(
  theme: ChartTheme,
  labels: string[],
  data: number[],
  horizontal = false,
): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: theme.series[0],
          borderRadius: 4,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: baseScales(theme),
    },
  };
}

/** Single-series trend over time (ganancia acumulada). */
export function lineConfig(theme: ChartTheme, labels: string[], data: number[]): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: theme.series[0],
          backgroundColor: `${theme.series[0]}1a`,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: theme.series[0],
          pointBorderColor: theme.surface,
          pointBorderWidth: 2,
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: baseScales(theme),
    },
  };
}

/** Multi-series categorical lines (historial de costos por proveedor). Cap at 4 series before folding to "Other". */
export function multiLineConfig(
  theme: ChartTheme,
  labels: string[],
  series: { label: string; data: (number | null)[] }[],
): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.data,
        borderColor: theme.series[i % theme.series.length],
        backgroundColor: theme.series[i % theme.series.length],
        borderWidth: 2,
        pointRadius: 4,
        pointBorderColor: theme.surface,
        pointBorderWidth: 2,
        spanGaps: true,
        tension: 0.2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: series.length > 1,
          labels: { color: theme.textSecondary, usePointStyle: true },
        },
        tooltip: { enabled: true },
      },
      scales: baseScales(theme),
    },
  };
}
