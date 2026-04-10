// js/app.js — Main App Component
import { html, render, useState, useEffect, useRef } from 'https://unpkg.com/htm/preact/standalone.module.js';
import {
  today, getMonday, getWeekDates, addDays, formatDateDisplay, formatDateFull,
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

function TodayScreen({ user, targets }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [monday, setMonday] = useState(getMonday(today()));
  const [weekDates, setWeekDates] = useState(getWeekDates(getMonday(today())));
  const [daysData, setDaysData] = useState([]);
  const [dayData, setDayData] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMeal, setEditMeal] = useState(null); // { meal, slot }

  // Load week data
  useEffect(() => {
    loadWeek(monday);
  }, [monday, user]);

  // Load day data when selected date changes
  useEffect(() => {
    if (daysData.length > 0) {
      loadDay(selectedDate);
    }
  }, [selectedDate, daysData]);

  async function loadWeek(mon) {
    setLoading(true);
    try {
      const week = await getOrCreateWeek(user.id, mon);
      const days = await getDaysForWeek(week.id);

      // Ensure all 7 days exist
      const dates = getWeekDates(mon);
      const allDays = [];
      for (const d of dates) {
        let existing = days.find(dy => dy.date === d);
        if (!existing) {
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
    const day = daysData.find(d => d.date === dateStr);
    if (!day) return;
    setDayData(day);
    try {
      const m = await getMealsForDay(day.id);
      setMeals(m);
    } catch (e) {
      console.error('loadDay error:', e);
      setMeals([]);
    }
  }

  function selectDate(dateStr) {
    setSelectedDate(dateStr);
    const newMon = getMonday(dateStr);
    if (newMon !== monday) {
      setMonday(newMon);
      setWeekDates(getWeekDates(newMon));
    }
  }

  function shiftWeek(dir) {
    const newMon = addDays(monday, dir * 7);
    setMonday(newMon);
    setWeekDates(getWeekDates(newMon));
    setSelectedDate(dir > 0 ? newMon : addDays(newMon, 6));
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

// ── Week Screen (placeholder) ──

function WeekScreen({ user, targets }) {
  return html`
    <div class="screen">
      <div class="placeholder-screen">
        <div class="placeholder-icon">📊</div>
        <h2>Wochen-Dashboard</h2>
        <p>Kommt bald — Wochenübersicht mit Kalorien- und Makro-Auswertung.</p>
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
    today: html`<${TodayScreen} user=${user} targets=${targets}/>`,
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
