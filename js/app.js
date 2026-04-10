// js/app.js — Main App Component
import { html, render, useState, useEffect, useRef } from 'https://unpkg.com/htm/preact/standalone.module.js';
import {
  today, getWeekStart, getWeekDates, addDays, formatDateDisplay, formatDateFull,
  isToday, isFuture, getKW, weekdayShort, defaultDayType,
  getSlotsForType, sumMacros, macroPercent, n0,
  MACRO_COLORS, DAYTYPE_COLORS, DAYTYPE_LABELS,
} from './helpers.js';
import {
  supabase, signIn, signOut, getUser, onAuthChange,
  getOrCreateWeek, getDaysForWeek, getOrCreateDay,
  getMealsForDay, updateDayType, updateDayTotals,
  upsertMeal, getDayTypeTargets, importWeekData,
} from './db.js';
import {
  Icons, WeekStrip, MacroBars, SegmentedPicker,
  MealCard, BottomNav, LoginScreen, EditMealSheet,
} from './components.js';

// ── Day Type Picker Options ──
const DAYTYPE_OPTIONS = [
  { value: 'workout', label: 'Workout' },
  { value: 'rest',    label: 'Rest Day' },
  { value: 'friday',  label: 'Friday' },
];

// ── Today Screen ──

function TodayScreen({ user, targets, onSettings }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [weekStart, setWeekStart] = useState(getWeekStart(today()));
  const [weekDates, setWeekDates] = useState(getWeekDates(getWeekStart(today())));
  const [daysData, setDaysData] = useState([]);
  const [dayData, setDayData] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMeal, setEditMeal] = useState(null); // { meal, slot }

  // Load week data
  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart, user]);

  // Load day data when selected date changes
  useEffect(() => {
    if (daysData.length > 0) {
      loadDay(selectedDate);
    }
  }, [selectedDate, daysData]);

  async function loadWeek(start) {
    setLoading(true);
    try {
      const week = await getOrCreateWeek(user.id, start);
      console.log('loadWeek: week=', week);
      const days = await getDaysForWeek(week.id);
      console.log('loadWeek: days from DB=', days.map(d => ({ date: d.date, kcal: d.total_kcal, id: d.id })));

      // Ensure all 7 days exist
      const dates = getWeekDates(start);
      console.log('loadWeek: expected dates=', dates);
      const allDays = [];
      for (const d of dates) {
        // Compare only first 10 chars (YYYY-MM-DD) in case DB returns datetime
        let existing = days.find(dy => String(dy.date).slice(0, 10) === d);
        if (!existing) {
          console.log('loadWeek: creating missing day for', d);
          existing = await getOrCreateDay(week.id, d, defaultDayType(d));
        }
        allDays.push(existing);
      }
      setDaysData(allDays);
    } catch (e) {
      console.error('loadWeek error:', e);
    }
    setLoading(false);
  }

  async function loadDay(dateStr) {
    const day = daysData.find(d => String(d.date).slice(0, 10) === dateStr);
    if (!day) return;
    setDayData(day);
    try {
      const m = await getMealsForDay(day.id);
      console.log('loadDay:', dateStr, 'meals=', m.length, m.map(x => x.recipe_name));
      setMeals(m);
    } catch (e) {
      console.error('loadDay error:', e);
      setMeals([]);
    }
  }

  function selectDate(dateStr) {
    setSelectedDate(dateStr);
    const newStart = getWeekStart(dateStr);
    if (newStart !== weekStart) {
      setWeekStart(newStart);
      setWeekDates(getWeekDates(newStart));
    }
  }

  function shiftWeek(dir) {
    const newStart = addDays(weekStart, dir * 7);
    setWeekStart(newStart);
    setWeekDates(getWeekDates(newStart));
    setSelectedDate(dir > 0 ? newStart : addDays(newStart, 6));
  }

  async function changeDayType(newType) {
    if (!dayData) return;
    try {
      await updateDayType(dayData.id, newType);
      setDayData({ ...dayData, day_type: newType });
      // Refresh week data
      const updated = daysData.map(d => d.id === dayData.id ? { ...d, day_type: newType } : d);
      setDaysData(updated);
    } catch (e) {
      console.error('changeDayType error:', e);
    }
  }

  async function handleSaveMeal(mealData) {
    if (!dayData) return;
    try {
      const saved = await upsertMeal({
        ...mealData,
        day_id: dayData.id,
        person: 'katja',
      });

      // Reload meals
      const m = await getMealsForDay(dayData.id);
      setMeals(m);

      // Update day totals
      const totals = sumMacros(m);
      await updateDayTotals(dayData.id, {
        total_kcal: totals.kcal,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
      });
      const updatedDay = {
        ...dayData,
        total_kcal: totals.kcal,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
      };
      setDayData(updatedDay);
      setDaysData(daysData.map(d => d.id === dayData.id ? updatedDay : d));

      setEditMeal(null);
    } catch (e) {
      console.error('saveMeal error:', e);
    }
  }

  const dayType = dayData?.day_type || 'rest';
  const slots = getSlotsForType(dayType);
  const dayTargets = targets ? targets.find(t => t.day_type === dayType) : null;
  const actual = dayData ? {
    kcal: dayData.total_kcal || 0,
    protein: dayData.total_protein || 0,
    carbs: dayData.total_carbs || 0,
    fat: dayData.total_fat || 0,
  } : { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  const isSelectedToday = isToday(selectedDate);
  const headerTitle = isSelectedToday ? 'Heute' : weekdayShort(selectedDate).replace('.', '');
  const headerDate = formatDateDisplay(selectedDate);

  return html`
    <div class="screen today-screen">
      <!-- Sticky Header -->
      <div class="sticky-header">
        <div class="header-top">
          <div class="header-title-group">
            <h1 class="header-title">${headerTitle}</h1>
            <span class="header-date">${headerDate}</span>
          </div>
          <div class="header-actions">
            <div class="header-nav-arrows">
              <div class="nav-arrow" onclick=${() => shiftWeek(-1)}>${Icons.chevLeft}</div>
              <span class="kw-label">KW ${getKW(selectedDate)}</span>
              <div class="nav-arrow" onclick=${() => shiftWeek(1)}>${Icons.chevRight}</div>
            </div>
            <div class="nav-arrow settings-gear" onclick=${onSettings}>${Icons.settings}</div>
          </div>
        </div>

        <${WeekStrip}
          dates=${weekDates}
          daysData=${daysData}
          selectedDate=${selectedDate}
          onSelect=${selectDate}
          targets=${targets ? Object.fromEntries(targets.map(t => [t.day_type, t])) : null}
        />

        <${MacroBars} actual=${actual} targets=${dayTargets}/>
      </div>

      <!-- Body -->
      <div class="screen-body">
        <${SegmentedPicker}
          value=${dayType}
          options=${DAYTYPE_OPTIONS}
          onChange=${changeDayType}
        />

        <div class="meals-list">
          ${loading
            ? html`<div class="loading-state">Laden...</div>`
            : slots.map(slot => {
                const meal = meals.find(m => m.slot === slot.key);
                return html`<${MealCard}
                  key=${slot.key}
                  slot=${slot}
                  meal=${meal}
                  onEdit=${(m, s) => setEditMeal({ meal: m, slot: s })}
                />`;
              })
          }
        </div>

        <!-- Day Total -->
        ${!loading && meals.length > 0 && html`
          <div class="day-total">
            <span class="day-total-label">Gesamt</span>
            <div class="day-total-macros">
              <span style="color:${MACRO_COLORS.kcal}">${n0(actual.kcal)} kcal</span>
              <span style="color:${MACRO_COLORS.protein}">P ${n0(actual.protein)}</span>
              <span style="color:${MACRO_COLORS.carbs}">C ${n0(actual.carbs)}</span>
              <span style="color:${MACRO_COLORS.fat}">F ${n0(actual.fat)}</span>
            </div>
          </div>
        `}
      </div>

      <!-- Edit Sheet -->
      ${editMeal && html`
        <${EditMealSheet}
          meal=${editMeal.meal}
          slot=${editMeal.slot}
          targets=${dayTargets}
          onSave=${handleSaveMeal}
          onClose=${() => setEditMeal(null)}
        />
      `}
    </div>
  `;
}

// ── Week Screen ──

function WeekScreen({ user, targets }) {
  const [weekStart, setWeekStart] = useState(getWeekStart(today()));
  const [weekDates, setWeekDates] = useState(getWeekDates(getWeekStart(today())));
  const [daysData, setDaysData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWeekData(weekStart); }, [weekStart, user]);

  async function loadWeekData(start) {
    setLoading(true);
    try {
      const week = await getOrCreateWeek(user.id, start);
      const days = await getDaysForWeek(week.id);
      const dates = getWeekDates(start);
      const allDays = [];
      for (const d of dates) {
        let existing = days.find(dy => String(dy.date).slice(0, 10) === d);
        if (!existing) {
          existing = await getOrCreateDay(week.id, d, defaultDayType(d));
        }
        allDays.push(existing);
      }
      setDaysData(allDays);
    } catch (e) { console.error('WeekScreen loadWeek error:', e); }
    setLoading(false);
  }

  function shiftWeek(dir) {
    const s = addDays(weekStart, dir * 7);
    setWeekStart(s);
    setWeekDates(getWeekDates(s));
  }

  // Calculate totals
  const targetsMap = targets ? Object.fromEntries(targets.map(t => [t.day_type, t])) : {};
  const daysWithTargets = daysData.map(d => {
    const t = targetsMap[d.day_type] || { target_kcal: 2200, target_protein: 140, target_carbs: 253, target_fat: 70 };
    return { ...d, targets: t };
  });

  const filledDays = daysWithTargets.filter(d => d.total_kcal > 0);
  const numFilled = filledDays.length || 1;

  const totalActual = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const totalTarget = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  daysWithTargets.forEach(d => {
    totalActual.kcal += d.total_kcal || 0;
    totalActual.protein += d.total_protein || 0;
    totalActual.carbs += d.total_carbs || 0;
    totalActual.fat += d.total_fat || 0;
    totalTarget.kcal += d.targets.target_kcal;
    totalTarget.protein += d.targets.target_protein;
    totalTarget.carbs += d.targets.target_carbs;
    totalTarget.fat += d.targets.target_fat;
  });

  const avgActual = {
    kcal: Math.round(totalActual.kcal / numFilled),
    protein: Math.round(totalActual.protein / numFilled),
    carbs: Math.round(totalActual.carbs / numFilled),
    fat: Math.round(totalActual.fat / numFilled),
  };
  const avgTarget = {
    kcal: Math.round(totalTarget.kcal / 7),
    protein: Math.round(totalTarget.protein / 7),
    carbs: Math.round(totalTarget.carbs / 7),
    fat: Math.round(totalTarget.fat / 7),
  };

  const maxKcal = Math.max(
    ...daysWithTargets.map(d => Math.max(d.total_kcal || 0, d.targets.target_kcal)),
    1
  );

  const dateRange = `${formatDateDisplay(weekDates[0])} – ${formatDateDisplay(weekDates[6])}`;

  return html`
    <div class="screen">
      <div class="week-screen">
        <!-- Header -->
        <div class="week-header">
          <div class="week-header-top">
            <h1 class="header-title">Woche</h1>
            <span class="header-date">KW ${getKW(weekDates[3])}</span>
          </div>
          <div class="week-nav">
            <div class="nav-arrow" onclick=${() => shiftWeek(-1)}>${Icons.chevLeft}</div>
            <span class="week-range">${dateRange}</span>
            <div class="nav-arrow" onclick=${() => shiftWeek(1)}>${Icons.chevRight}</div>
          </div>
        </div>

        ${loading ? html`<div class="loading-state">Laden...</div>` : html`
          <!-- Summary Cards -->
          <div class="week-summary">
            ${[
              { key: 'kcal', label: 'KCAL', color: MACRO_COLORS.kcal, actual: totalActual.kcal, target: totalTarget.kcal, avg: avgActual.kcal, avgT: avgTarget.kcal },
              { key: 'protein', label: 'PROT', color: MACRO_COLORS.protein, actual: totalActual.protein, target: totalTarget.protein, avg: avgActual.protein, avgT: avgTarget.protein },
              { key: 'carbs', label: 'CARB', color: MACRO_COLORS.carbs, actual: totalActual.carbs, target: totalTarget.carbs, avg: avgActual.carbs, avgT: avgTarget.carbs },
              { key: 'fat', label: 'FETT', color: MACRO_COLORS.fat, actual: totalActual.fat, target: totalTarget.fat, avg: avgActual.fat, avgT: avgTarget.fat },
            ].map(m => {
              const pct = Math.min(Math.round((m.actual / (m.target || 1)) * 100), 100);
              return html`
                <div class="summary-card">
                  <div class="summary-label" style="color:${m.color}">${m.label}</div>
                  <div class="summary-values">
                    <span class="summary-actual">${n0(m.actual)}</span>
                    <span class="summary-target">/ ${n0(m.target)}</span>
                  </div>
                  <div class="summary-bar-track">
                    <div class="summary-bar-fill" style="width:${pct}%;background:${m.color}"/>
                  </div>
                  <div class="summary-avg">⌀ ${n0(m.avg)} / Tag (Ziel: ${n0(m.avgT)})</div>
                </div>
              `;
            })}
          </div>

          <!-- Daily Bars -->
          <div class="week-daily">
            <div class="week-daily-title">Kalorien pro Tag</div>
            ${daysWithTargets.map(d => {
              const date = String(d.date).slice(0, 10);
              const kcal = d.total_kcal || 0;
              const target = d.targets.target_kcal;
              const barW = Math.round((kcal / maxKcal) * 100);
              const targetW = Math.round((target / maxKcal) * 100);
              const dtColor = DAYTYPE_COLORS[d.day_type] || '#999';
              const isTodayDate = isToday(date);
              const barColor = kcal > target * 1.1 ? '#A42059' : kcal > target ? '#623c6d' : MACRO_COLORS.kcal;

              return html`
                <div class="daily-row ${isTodayDate ? 'today-row' : ''}">
                  <div class="daily-label">
                    <div class="dt-dot" style="background:${dtColor}"/>
                    <span class="daily-day">${weekdayShort(date)}</span>
                  </div>
                  <div class="daily-bar-container">
                    <div class="daily-bar-track">
                      <div class="daily-bar-fill" style="width:${barW}%;background:${barColor}"/>
                      <div class="daily-target-line" style="left:${targetW}%"/>
                    </div>
                    <span class="daily-kcal">${kcal > 0 ? n0(kcal) : '–'}</span>
                  </div>
                </div>
              `;
            })}

            <!-- Legend -->
            <div class="week-legend">
              <span class="legend-item"><span class="dt-dot" style="background:${DAYTYPE_COLORS.workout}"/>Workout</span>
              <span class="legend-item"><span class="dt-dot" style="background:${DAYTYPE_COLORS.rest}"/>Rest Day</span>
              <span class="legend-item"><span class="dt-dot" style="background:${DAYTYPE_COLORS.friday}"/>Friday</span>
              <span class="legend-item"><span class="target-line-legend"/>Ziel</span>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

// ── Mealplan Screen (placeholder) ──

function MealplanScreen({ user }) {
  return html`
    <div class="screen">
      <div class="placeholder-screen">
        <div class="placeholder-icon">📖</div>
        <h2>Mealplan</h2>
        <p>Kommt bald — Rezepte, Zutaten und Meal-Prep-Übersicht.</p>
      </div>
    </div>
  `;
}

// ── Family Screen (placeholder) ──

function FamilyScreen({ user }) {
  return html`
    <div class="screen">
      <div class="placeholder-screen">
        <div class="placeholder-icon">👨‍👩‍👦</div>
        <h2>Familienübersicht</h2>
        <p>Kommt bald — wer isst was an welchem Tag.</p>
      </div>
    </div>
  `;
}

// ── Settings Screen ──

function SettingsScreen({ user, onLogout }) {
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importStatus, setImportStatus] = useState(''); // '', 'loading', 'success', 'error'
  const [importMsg, setImportMsg] = useState('');

  const clearCacheAndReload = async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
    window.location.reload(true);
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    setImportStatus('loading');
    setImportMsg('');
    try {
      const data = JSON.parse(importJson.trim());
      if (!data.start_date || !data.days) throw new Error('Ungültiges Format: start_date und days fehlen');
      await importWeekData(user.id, data);
      setImportStatus('success');
      setImportMsg(`KW importiert (Start: ${data.start_date}). ${data.days.length} Tage mit ${data.days.reduce((s,d) => s + (d.meals?.length||0), 0)} Mahlzeiten.`);
      setImportJson('');
    } catch (e) {
      setImportStatus('error');
      setImportMsg(e.message);
    }
  };

  return html`
    <div class="screen">
      <div class="settings-screen">
        <h1 class="settings-title">Einstellungen</h1>

        <div class="settings-section">
          <div class="settings-label">Account</div>
          <div class="settings-card">
            <div class="settings-row">
              <span>Email</span>
              <span class="settings-value">${user?.email}</span>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-label">Daten</div>
          <div class="settings-card">
            <div class="settings-row clickable" onclick=${() => setShowImport(!showImport)}>
              <span>Mealplan importieren</span>
              <span class="settings-arrow">${showImport ? '↑' : '→'}</span>
            </div>
            ${showImport && html`
              <div class="import-section">
                <textarea
                  class="import-textarea"
                  placeholder='JSON vom Mealplan-Chat hier einfügen...'
                  value=${importJson}
                  onInput=${e => setImportJson(e.target.value)}
                  rows="8"
                />
                <div class="import-actions">
                  <div class="sheet-btn save" onclick=${handleImport}>
                    ${importStatus === 'loading' ? 'Importiere...' : 'Importieren'}
                  </div>
                </div>
                ${importMsg && html`
                  <div class="import-msg ${importStatus}">${importMsg}</div>
                `}
              </div>
            `}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-label">App</div>
          <div class="settings-card">
            <div class="settings-row clickable" onclick=${clearCacheAndReload}>
              <span>App aktualisieren</span>
              <span class="settings-arrow">→</span>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-card">
            <div class="settings-row clickable danger" onclick=${onLogout}>
              <span>Abmelden</span>
            </div>
          </div>
        </div>

        <div class="settings-version">Nutrition Tracker v0.1</div>
      </div>
    </div>
  `;
}

// ── Main App ──

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState('today');
  const [targets, setTargets] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Check existing session
    getUser().then(u => {
      setUser(u);
      setAuthChecked(true);
    });
    // Listen for auth changes
    const { data: { subscription } } = onAuthChange(u => setUser(u));
    return () => subscription?.unsubscribe();
  }, []);

  // Load targets once authenticated
  useEffect(() => {
    if (user) {
      getDayTypeTargets().then(t => setTargets(t)).catch(console.error);
    }
  }, [user]);

  async function handleLogin(email, pw) {
    await signIn(email, pw);
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setShowSettings(false);
  }

  if (!authChecked) {
    return html`<div class="splash"><img class="splash-logo" src="icons/apple-touch-icon.png" alt=""/></div>`;
  }

  if (!user) {
    return html`<${LoginScreen} onLogin=${handleLogin}/>`;
  }

  if (showSettings) {
    return html`
      <div class="app-container">
        <${SettingsScreen} user=${user} onLogout=${handleLogout}/>
        <${BottomNav} active="settings" onNav=${key => {
          setShowSettings(false);
          setTab(key);
        }}/>
      </div>
    `;
  }

  const screens = {
    today: html`<${TodayScreen} user=${user} targets=${targets} onSettings=${() => setShowSettings(true)}/>`,
    week: html`<${WeekScreen} user=${user} targets=${targets}/>`,
    mealplan: html`<${MealplanScreen} user=${user}/>`,
    family: html`<${FamilyScreen} user=${user}/>`,
  };

  return html`
    <div class="app-container">
      ${screens[tab] || screens.today}
      <${BottomNav} active=${tab} onNav=${key => {
        if (key === 'settings') {
          setShowSettings(true);
        } else {
          setTab(key);
          setShowSettings(false);
        }
      }}/>
    </div>
  `;
}

// ── Mount ──
render(html`<${App}/>`, document.getElementById('app'));
