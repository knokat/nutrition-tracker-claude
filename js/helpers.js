// js/helpers.js — Date utilities, formatting, macro calculations

// ── Date Helpers ──

const WEEKDAYS = ['SO.', 'MO.', 'DI.', 'MI.', 'DO.', 'FR.', 'SA.'];
const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function today() {
  return fmtDate(new Date());
}

export function fmtDate(d) {
  // Returns YYYY-MM-DD
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

export function parseDate(s) {
  // Parse YYYY-MM-DD as local date (not UTC)
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getMonday(d) {
  const dt = d instanceof Date ? new Date(d) : parseDate(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return fmtDate(dt);
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

export function getWeekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

export function weekdayShort(dateStr) {
  return WEEKDAYS[parseDate(dateStr).getDay()];
}

export function weekdayLong(dateStr) {
  return WEEKDAYS_LONG[parseDate(dateStr).getDay()];
}

export function formatDateDisplay(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function formatDateFull(dateStr) {
  const d = parseDate(dateStr);
  return `${weekdayLong(dateStr)}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function isToday(dateStr) {
  return dateStr === today();
}

export function isFuture(dateStr) {
  return dateStr > today();
}

export function getKW(dateStr) {
  const d = parseDate(dateStr);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - onejan) / 86400000);
  return Math.ceil((days + onejan.getDay() + 1) / 7);
}

// ── Default Day Type ──

export function defaultDayType(dateStr) {
  const dow = parseDate(dateStr).getDay();
  if (dow === 5) return 'friday';          // Freitag
  if (dow === 0 || dow === 6) return 'rest'; // Wochenende
  // Mo, Di, Mi, Do — 3 Trainingstage, Rest hängt vom Plan ab
  // Default: Mo+Mi = workout, Di+Do = rest (kann überschrieben werden)
  if (dow === 1 || dow === 3) return 'workout';
  return 'rest';
}

// ── Meal Slot Config ──

export const MEAL_SLOTS = {
  workout: [
    { key: 'breakfast',  label: 'Frühstück',        icon: '🥣' },
    { key: 'snack1',     label: 'Snack 1',          icon: '🍎' },
    { key: 'lunch',      label: 'Mittagessen',       icon: '🍽️' },
    { key: 'snack2',     label: 'Kaffee+Schoko+Saft', icon: '☕' },
    { key: 'preworkout', label: 'PreWorkout',        icon: '⚡' },
    { key: 'shake',      label: 'Whey Shake',        icon: '🥤' },
    { key: 'dinner',     label: 'Brotzeit',          icon: '🍞' },
  ],
  rest: [
    { key: 'breakfast',  label: 'Frühstück',        icon: '🥣' },
    { key: 'snack1',     label: 'Snack 1',          icon: '🍎' },
    { key: 'lunch',      label: 'Mittagessen',       icon: '🍽️' },
    { key: 'snack2',     label: 'Kaffee+Schoko',    icon: '☕' },
    { key: 'dinner',     label: 'Brotzeit',          icon: '🍞' },
  ],
  friday: [
    { key: 'breakfast',  label: 'Frühstück',        icon: '🥣' },
    { key: 'snack1',     label: 'Snack 1',          icon: '🍎' },
    { key: 'lunch',      label: 'Caprese',           icon: '🍅' },
    { key: 'snack2',     label: 'Kaffee+Schoko',    icon: '☕' },
    { key: 'dinner',     label: 'Movie Night',       icon: '🎬' },
  ],
};

export function getSlotsForType(dayType) {
  return MEAL_SLOTS[dayType] || MEAL_SLOTS.rest;
}

// ── Macro Helpers ──

export function sumMacros(meals) {
  return meals.reduce((acc, m) => ({
    kcal: acc.kcal + (m.kcal || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

export function macroPercent(actual, target) {
  if (!target || target === 0) return 0;
  return Math.round((actual / target) * 100);
}

export function kcalColor(percent) {
  if (percent <= 100) return '#205781';
  if (percent <= 110) return '#623c6d';
  return '#A42059';
}

export const MACRO_COLORS = {
  kcal: '#205781',
  protein: '#006D77',
  carbs: '#4F959D',
  fat: '#7AB2B2',
};

export const DAYTYPE_COLORS = {
  workout: '#A42059',
  rest: '#7AB2B2',
  friday: '#205781',
};

export const DAYTYPE_LABELS = {
  workout: 'Workout',
  rest: 'Rest Day',
  friday: 'Friday',
};

// ── Number Formatting ──

export function n0(v) { return Math.round(v || 0); }
export function n1(v) { return (v || 0).toFixed(1); }
