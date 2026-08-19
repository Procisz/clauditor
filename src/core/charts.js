import ApexCharts from 'apexcharts';
export { ApexCharts };

export const CHART_COLORS = [
  '#818cf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#c084fc',
  '#38bdf8',
  '#f97316',
  '#f472b6',
];

export function getApexBaseOpts() {
  const light = document.documentElement.dataset.theme === 'winter';
  const tick  = light ? '#64748b' : '#94a3b8';
  const grid  = light ? '#e2e8f0' : '#1e293b';
  return {
    chart: {
      background: 'transparent',
      foreColor: light ? '#0f172a' : '#f1f5f9',
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
