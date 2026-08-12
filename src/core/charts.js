// ─────────────────────────────────────────────
// CHART HELPERS — ApexCharts theme & shared palette
// ─────────────────────────────────────────────
import ApexCharts from 'apexcharts';
export { ApexCharts };

// Slate + Indigo chart palette
export const CHART_COLORS = [
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#fb7185', // rose-400
  '#c084fc', // violet-400
  '#38bdf8', // sky-400
  '#f97316', // orange-400
  '#f472b6', // pink-400
];

export function getApexBaseOpts() {
  const light = document.documentElement.dataset.theme === 'winter';
  const tick  = light ? '#64748b' : '#94a3b8'; // slate-500 / slate-400
  const grid  = light ? '#e2e8f0' : '#1e293b'; // slate-200 / slate-800
  return {
    chart: {
      background: 'transparent',
      foreColor: light ? '#0f172a' : '#f1f5f9', // slate-900 / slate-100
      toolbar: { show: false },
      animations: { enabled: true, easing: 'easeinout', speed: 500, dynamicAnimation: { enabled: true, speed: 300 } },
      redrawOnWindowResize: false,
      redrawOnParentResize: false,
    },
    theme:       { mode: light ? 'light' : 'dark' },
    grid:        { borderColor: grid, strokeDashArray: 3, padding: { left: 4, right: 4 } },
    tooltip:     { theme: light ? 'light' : 'dark', style: { fontSize: '12px' } },
    dataLabels:  { enabled: false },
    xaxis: {
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels:     { style: { colors: tick, fontSize: '11px' } },
    },
    yaxis:  { labels: { style: { colors: tick, fontSize: '11px' } } },
    legend: { labels: { colors: tick }, fontSize: '12px' },
    noData: { text: 'No data', style: { color: tick, fontSize: '13px' } },
  };
}
