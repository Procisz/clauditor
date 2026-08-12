// ─────────────────────────────────────────────
// TODAY — tab orchestrator, day navigation, renderTodayView
// ─────────────────────────────────────────────
import { state } from '../../core/state.js';
import { renderTodayCards } from './cards.js';
import { renderTodayModelPie, renderTodayTokenPie, renderTodayHourlyChart, renderTodayResponseTimeChart, renderTodayCacheChart, renderSessionTimeline, renderTodayCumulativeCost, renderCallsScatter } from './charts.js';
import { renderTodaySessionsTable } from './sessions.js';
import { renderTodayProjectsTable } from './tables.js';

export function getTodayEntries() {
  return state.allEntries.filter(e => e.date === state.selectedDate);
}

export function updateDayNav() {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = state.selectedDate >= today;
  const picker = document.getElementById('day-picker');
  picker.value = state.selectedDate;
  picker.max = today;
  document.getElementById('btn-next-day').disabled = isToday;
  document.getElementById('btn-today-jump').disabled = isToday;
}

export function shiftDay(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function prevDay() {
  state.selectedDate = shiftDay(state.selectedDate, -1);
  updateDayNav();
  renderTodayView();
}

export function nextDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.selectedDate >= today) return;
  state.selectedDate = shiftDay(state.selectedDate, +1);
  updateDayNav();
  renderTodayView();
}

export function goToToday() {
  state.selectedDate = new Date().toISOString().slice(0, 10);
  updateDayNav();
  renderTodayView();
}

export function onDayPicked(val) {
  if (!val) return;
  state.selectedDate = val;
  updateDayNav();
  renderTodayView();
}

export function switchTab(tab) {
  state.activeTab = tab;
  document.getElementById('view-overview').style.display = tab === 'overview' ? '' : 'none';
  document.getElementById('view-today').style.display    = tab === 'today'    ? '' : 'none';
  const activeColor = { overview: 'btn-primary', today: 'btn-secondary' };
  document.querySelectorAll('.join [data-tab]').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle(activeColor[b.dataset.tab], isActive);
    b.classList.toggle('btn-ghost', !isActive);
  });
  if (tab === 'today') { updateDayNav(); renderTodayView(); }
}

export function renderTodayView() {
  const entries = getTodayEntries();
  const durations = state.allDurations.filter(d => d.date === state.selectedDate);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = state.selectedDate === today;
  const dayLabel = isToday ? 'Today' : state.selectedDate;
  document.getElementById('title-today-sessions').textContent = dayLabel + "'s Sessions";
  document.getElementById('title-today-projects').textContent = dayLabel + "'s Projects";
  document.getElementById('title-today-cache').textContent = dayLabel;
  renderTodayCards(entries);
  renderTodayModelPie(entries);
  renderTodayTokenPie(entries);
  renderTodayHourlyChart(entries);
  renderTodayResponseTimeChart(durations);
  renderTodayCacheChart(entries);
  renderSessionTimeline(entries);
  renderTodayCumulativeCost(entries);
  renderCallsScatter(entries);
  renderTodaySessionsTable(entries);
  renderTodayProjectsTable(entries);
}
