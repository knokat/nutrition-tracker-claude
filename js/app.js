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
  upsertMeal, deleteMeal, getDayTypeTargets, importWeekData,
  findSiblingMeals, updateMealMacros, replaceMealItems, recalcDayTotals,
  getRecipesForWeek,
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

  async function handleDeleteMeal(mealToDelete) {
    if (!dayData || !mealToDelete?.id) return;
    if (!confirm(`"${mealToDelete.recipe_name}" für heute löschen?`)) return;
    try {
      await deleteMeal(mealToDelete.id);
      const m = await getMealsForDay(dayData.id);
      setMeals(m);
      const totals = sumMacros(m);
      await updateDayTotals(dayData.id, {
        total_kcal: totals.kcal,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
      });
      const updatedDay = { ...dayData, total_kcal: totals.kcal, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat };
      setDayData(updatedDay);
      setDaysData(daysData.map(d => d.id === dayData.id ? updatedDay : d));
    } catch (e) {
      console.error('deleteMeal error:', e);
    }
  }

  async function handleSaveMeal(mealData) {
    if (!dayData) return;
    try {
      const { _items, _scope, _originalRecipeName, meal_items, ...mealFields } = mealData;

      if (_scope === 'all' && _originalRecipeName) {
        // Find all sibling meals with same recipe_name in this week
        const week = await getOrCreateWeek(user.id, weekStart);
        const siblings = await findSiblingMeals(week.id, _originalRecipeName, mealFields.slot);
        const affectedDayIds = new Set();

        for (const sib of siblings) {
          await updateMealMacros(sib.id, {
            recipe_name: mealFields.recipe_name,
            kcal: mealFields.kcal,
            protein: mealFields.protein,
            carbs: mealFields.carbs,
            fat: mealFields.fat,
          });
          if (_items && _items.length > 0) {
            await replaceMealItems(sib.id, _items);
          }
          affectedDayIds.add(sib.day_id);
        }

        // Recalc totals for all affected days
        for (const dayId of affectedDayIds) {
          await recalcDayTotals(dayId);
        }
      } else {
        // Single day update
        await upsertMeal({
          ...mealFields,
          day_id: dayData.id,
          person: 'katja',
        });

        if (_items && _items.length > 0 && mealFields.id) {
          await replaceMealItems(mealFields.id, _items);
        }
      }

      // Reload current day meals
      const m = await getMealsForDay(dayData.id);
      setMeals(m);

      // Recalc and update current day totals
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

      // Reload all week days to refresh rings
      if (_scope === 'all') {
        await loadWeek(weekStart);
      } else {
        setDaysData(daysData.map(d => d.id === dayData.id ? updatedDay : d));
      }

      setEditMeal(null);
    } catch (e) {
      console.error('saveMeal error:', e);
    }
  }

  // Count sibling meals for scope toggle
  const [siblingCount, setSiblingCount] = useState(0);
  useEffect(() => {
    if (editMeal?.meal?.recipe_name && !editMeal?.meal?.is_standard) {
      getOrCreateWeek(user.id, weekStart).then(week =>
        findSiblingMeals(week.id, editMeal.meal.recipe_name, editMeal.meal.slot)
      ).then(siblings => setSiblingCount(siblings.length)).catch(() => setSiblingCount(0));
    } else {
      setSiblingCount(0);
    }
  }, [editMeal]);

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
                  onDelete=${meal ? (m) => handleDeleteMeal(m) : null}
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
          siblingCount=${siblingCount}
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

// ── Mealplan Screen ──

function MealplanScreen({ user }) {
  const [weekStart, setWeekStart] = useState(getWeekStart(today()));
  const [weekDates, setWeekDates] = useState(getWeekDates(getWeekStart(today())));
  const [daysData, setDaysData] = useState([]);
  const [allMeals, setAllMeals] = useState({}); // { date: [meals] }
  const [recipeDetails, setRecipeDetails] = useState([]); // from recipes table
  const [loading, setLoading] = useState(true);
  const [openRecipe, setOpenRecipe] = useState(null); // recipe_name
  const [openSection, setOpenSection] = useState('servings'); // 'servings' | 'ingredients' | 'steps'

  useEffect(() => { loadMealplan(weekStart); }, [weekStart, user]);

  async function loadMealplan(start) {
    setLoading(true);
    try {
      const week = await getOrCreateWeek(user.id, start);
      const days = await getDaysForWeek(week.id);
      const dates = getWeekDates(start);
      const allDays = [];
      const mealsMap = {};
      for (const d of dates) {
        let existing = days.find(dy => String(dy.date).slice(0, 10) === d);
        if (!existing) {
          existing = await getOrCreateDay(week.id, d, defaultDayType(d));
        }
        allDays.push(existing);
        const m = await getMealsForDay(existing.id);
        mealsMap[d] = m;
      }
      setDaysData(allDays);
      setAllMeals(mealsMap);

      // Load recipe details
      const recs = await getRecipesForWeek(week.id);
      setRecipeDetails(recs);
    } catch (e) { console.error('MealplanScreen error:', e); }
    setLoading(false);
  }

  function shiftWeek(dir) {
    const s = addDays(weekStart, dir * 7);
    setWeekStart(s);
    setWeekDates(getWeekDates(s));
  }

  // Group meals by unique recipe (variable only)
  const recipes = [];
  const seen = new Set();
  const weekdayMeals = {}; // { recipeName: [dates] }

  Object.entries(allMeals).forEach(([date, meals]) => {
    meals.forEach(m => {
      if (!m.recipe_name) return;
      if (!weekdayMeals[m.recipe_name]) weekdayMeals[m.recipe_name] = [];
      weekdayMeals[m.recipe_name].push({ date, ...m });
      if (!seen.has(m.recipe_name)) {
        seen.add(m.recipe_name);
        recipes.push(m);
      }
    });
  });

  // Separate variable and standard
  const variableRecipes = recipes.filter(r => !r.is_standard);
  const standardRecipes = recipes.filter(r => r.is_standard);

  // Build overview: what's for Mo-Do, Fr, Sa+So
  const mealsByPeriod = { moDo: {}, fr: {}, saSo: {} };
  weekDates.forEach((d, i) => {
    const meals = allMeals[d] || [];
    const dayMeals = meals.filter(m => ['breakfast', 'lunch'].includes(m.slot) && !m.is_standard);
    // Sa=0, So=1, Mo=2, Di=3, Mi=4, Do=5, Fr=6
    if (i >= 2 && i <= 5) { // Mo-Do
      dayMeals.forEach(m => { mealsByPeriod.moDo[m.slot] = m.recipe_name; });
    } else if (i === 6) { // Fr
      dayMeals.forEach(m => { mealsByPeriod.fr[m.slot] = m.recipe_name; });
    } else { // Sa, So
      dayMeals.forEach(m => { mealsByPeriod.saSo[m.slot] = m.recipe_name; });
    }
  });

  // Helper: find recipe detail by name
  function getDetail(recipeName) {
    return recipeDetails.find(r => r.name === recipeName);
  }

  // Person labels
  const personLabels = { katja: 'Katja', leander: 'Leander', matthias: 'Matthias' };
  const personColors = { katja: '#0C447C', leander: '#085041', matthias: '#5C3D1A' };

  const dateRange = `${formatDateDisplay(weekDates[0])} – ${formatDateDisplay(weekDates[6])}`;

  return html`
    <div class="screen">
      <div class="mealplan-screen">
        <!-- Header -->
        <div class="week-header">
          <div class="week-header-top">
            <h1 class="header-title">Mealplan</h1>
            <span class="header-date">KW ${getKW(weekDates[3])}</span>
          </div>
          <div class="week-nav">
            <div class="nav-arrow" onclick=${() => shiftWeek(-1)}>${Icons.chevLeft}</div>
            <span class="week-range">${dateRange}</span>
            <div class="nav-arrow" onclick=${() => shiftWeek(1)}>${Icons.chevRight}</div>
          </div>
        </div>

        ${loading ? html`<div class="loading-state">Laden...</div>` : html`
          <!-- Overview Card -->
          <div class="mp-overview-card">
            <div class="mp-overview-title">Wochenübersicht</div>
            ${mealsByPeriod.moDo.breakfast || mealsByPeriod.moDo.lunch ? html`
              <div class="mp-period">
                <span class="mp-period-label">Mo–Do</span>
                <div class="mp-period-meals">
                  ${mealsByPeriod.moDo.breakfast ? html`<div class="mp-period-meal">🥣 ${mealsByPeriod.moDo.breakfast}</div>` : ''}
                  ${mealsByPeriod.moDo.lunch ? html`<div class="mp-period-meal">🍽️ ${mealsByPeriod.moDo.lunch}</div>` : ''}
                </div>
              </div>
            ` : ''}
            ${mealsByPeriod.fr.breakfast ? html`
              <div class="mp-period">
                <span class="mp-period-label">Freitag</span>
                <div class="mp-period-meals">
                  <div class="mp-period-meal">🥣 ${mealsByPeriod.fr.breakfast}</div>
                  <div class="mp-period-meal">🍅 Caprese</div>
                  <div class="mp-period-meal">🎬 Movie Night</div>
                </div>
              </div>
            ` : ''}
            ${mealsByPeriod.saSo.breakfast || mealsByPeriod.saSo.lunch ? html`
              <div class="mp-period">
                <span class="mp-period-label">Sa + So</span>
                <div class="mp-period-meals">
                  ${mealsByPeriod.saSo.breakfast ? html`<div class="mp-period-meal">🥣 ${mealsByPeriod.saSo.breakfast}</div>` : ''}
                  ${mealsByPeriod.saSo.lunch ? html`<div class="mp-period-meal">🍽️ ${mealsByPeriod.saSo.lunch}</div>` : ''}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Recipe Cards -->
          <div class="mp-section-title">Rezepte (${variableRecipes.length})</div>
          <div class="mp-recipes">
            ${variableRecipes.map(r => {
              const isOpen = openRecipe === r.recipe_name;
              const items = r.meal_items || [];
              const occurrences = weekdayMeals[r.recipe_name] || [];
              const days = occurrences.map(o => weekdayShort(String(o.date).slice(0, 10))).join(', ');
              const isMealPrep = occurrences.length >= 3;
              const detail = getDetail(r.recipe_name);
              const hasDetail = detail && (detail.servings?.length > 0 || detail.total_items?.length > 0 || detail.steps?.length > 0);

              return html`
                <div class="mp-recipe-card">
                  <div class="mp-recipe-header" onclick=${() => {
                    setOpenRecipe(isOpen ? null : r.recipe_name);
                    setOpenSection('servings');
                  }}>
                    <div class="mp-recipe-info">
                      <div class="mp-recipe-name">
                        ${r.recipe_name}
                        ${isMealPrep
                          ? html`<span class="mp-badge prep">Meal Prep</span>`
                          : html`<span class="mp-badge fresh">Frisch</span>`
                        }
                      </div>
                      <div class="mp-recipe-meta">
                        ${r.slot === 'breakfast' ? '🥣 Frühstück' : '🍽️ Mittagessen'} · ${days}
                      </div>
                      <div class="mp-recipe-macros">
                        ${n0(r.kcal)} kcal · P ${n0(r.protein)} · C ${n0(r.carbs)} · F ${n0(r.fat)}
                      </div>
                    </div>
                    <div class="meal-chevron">${isOpen ? Icons.chevUp : Icons.chevDown}</div>
                  </div>
                  ${isOpen && html`
                    <div class="mp-recipe-body">
                      ${detail?.description ? html`
                        <div class="mp-recipe-desc">${detail.description}</div>
                      ` : ''}

                      <!-- Tab bar for sections -->
                      ${hasDetail ? html`
                        <div class="mp-tab-bar">
                          <div class="mp-tab ${openSection === 'servings' ? 'active' : ''}"
                            onclick=${() => setOpenSection('servings')}>Portionen</div>
                          <div class="mp-tab ${openSection === 'ingredients' ? 'active' : ''}"
                            onclick=${() => setOpenSection('ingredients')}>Zutaten</div>
                          <div class="mp-tab ${openSection === 'steps' ? 'active' : ''}"
                            onclick=${() => setOpenSection('steps')}>Zubereitung</div>
                        </div>
                      ` : ''}

                      ${(!hasDetail || openSection === 'ingredients') && html`
                        ${hasDetail && detail.total_items?.length > 0 ? html`
                          <!-- Total ingredients for all portions -->
                          <div class="mp-ingredients-title">Gesamtzutaten (alle Portionen)</div>
                          ${detail.total_items.map(it => html`
                            <div class="mp-ingredient-row">
                              <span class="mp-ingredient-name">${it.ingredient_name}</span>
                              <span class="mp-ingredient-amount">${it.amount}${it.unit || 'g'}</span>
                            </div>
                          `)}
                          <div class="mp-divider"></div>
                          <div class="mp-ingredients-title">Pro Portion (Katja)</div>
                          ${items.map(it => html`
                            <div class="mp-ingredient-row">
                              <span class="mp-ingredient-name">${it.ingredient_name}</span>
                              <span class="mp-ingredient-amount">${n0(it.amount_g)}${it.unit || 'g'}</span>
                              <span class="mp-ingredient-kcal">${n0(it.kcal)} kcal</span>
                            </div>
                          `)}
                        ` : html`
                          <!-- Fallback: only per-portion items -->
                          <div class="mp-ingredients-title">Zutaten pro Portion</div>
                          ${items.map(it => html`
                            <div class="mp-ingredient-row">
                              <span class="mp-ingredient-name">${it.ingredient_name}</span>
                              <span class="mp-ingredient-amount">${n0(it.amount_g)}${it.unit || 'g'}</span>
                              <span class="mp-ingredient-kcal">${n0(it.kcal)} kcal</span>
                            </div>
                          `)}
                        `}
                      `}

                      ${openSection === 'servings' && hasDetail && html`
                        <div class="mp-servings-section">
                          ${(detail.servings || []).map(s => {
                            const total = s.days.length * s.portion_factor;
                            const portionLabel = s.portion_factor === 1 ? 'volle' : s.portion_factor === 0.5 ? 'halbe' : `${s.portion_factor}×`;
                            return html`
                              <div class="mp-serving-row">
                                <div class="mp-serving-person" style="color:${personColors[s.person] || '#333'}">
                                  ${personLabels[s.person] || s.person}
                                </div>
                                <div class="mp-serving-detail">
                                  <span class="mp-serving-days">${s.days.join(', ')}</span>
                                  <span class="mp-serving-count">${s.days.length}× ${portionLabel} Portion = ${total} Portionen</span>
                                </div>
                              </div>
                            `;
                          })}
                          <div class="mp-serving-total">
                            Gesamt: ${(detail.servings || []).reduce((sum, s) => sum + s.days.length * s.portion_factor, 0)} Portionen
                          </div>
                        </div>
                      `}

                      ${openSection === 'steps' && hasDetail && html`
                        <div class="mp-steps-section">
                          ${(detail.steps || []).map((step, i) => html`
                            <div class="mp-step-row">
                              <span class="mp-step-num">${i + 1}</span>
                              <span class="mp-step-text">${step}</span>
                            </div>
                          `)}
                        </div>
                      `}
                    </div>
                  `}
                </div>
              `;
            })}
          </div>

          <!-- Standard Meals -->
          ${standardRecipes.length > 0 && html`
            <div class="mp-section-title" style="margin-top:16px">Standardbausteine (${standardRecipes.length})</div>
            <div class="mp-standards">
              ${standardRecipes.map(r => html`
                <div class="mp-standard-row">
                  <span class="mp-standard-name">${r.recipe_name}</span>
                  <span class="mp-standard-kcal">${n0(r.kcal)} kcal</span>
                </div>
              `)}
            </div>
          `}
        `}
      </div>
    </div>
  `;
}

// ── Family Screen ──

function FamilyScreen({ user }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [weekStart, setWeekStart] = useState(getWeekStart(today()));
  const [weekDates, setWeekDates] = useState(getWeekDates(getWeekStart(today())));
  const [daysData, setDaysData] = useState([]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFamilyWeek(weekStart); }, [weekStart, user]);
  useEffect(() => { if (daysData.length > 0) loadFamilyDay(selectedDate); }, [selectedDate, daysData]);

  async function loadFamilyWeek(start) {
    setLoading(true);
    try {
      const week = await getOrCreateWeek(user.id, start);
      const days = await getDaysForWeek(week.id);
      const dates = getWeekDates(start);
      const allDays = [];
      for (const d of dates) {
        let existing = days.find(dy => String(dy.date).slice(0, 10) === d);
        if (!existing) existing = await getOrCreateDay(week.id, d, defaultDayType(d));
        allDays.push(existing);
      }
      setDaysData(allDays);
    } catch (e) { console.error('FamilyScreen error:', e); }
    setLoading(false);
  }

  async function loadFamilyDay(dateStr) {
    const day = daysData.find(d => String(d.date).slice(0, 10) === dateStr);
    if (!day) return;
    try {
      const m = await getMealsForDay(day.id);
      setMeals(m);
    } catch (e) { setMeals([]); }
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
    const s = addDays(weekStart, dir * 7);
    setWeekStart(s);
    setWeekDates(getWeekDates(s));
    setSelectedDate(dir > 0 ? s : addDays(s, 6));
  }

  const dayData = daysData.find(d => String(d.date).slice(0, 10) === selectedDate);
  const dayType = dayData?.day_type || 'rest';
  const allSlots = getSlotsForType(dayType);

  // Family members
  const members = [
    { key: 'katja', initial: 'K', name: 'Katja', bg: '#E6F1FB', color: '#0C447C' },
    { key: 'leander', initial: 'L', name: 'Leander', bg: '#E1F5EE', color: '#085041' },
    { key: 'matthias', initial: 'M', name: 'Matthias', bg: '#f0f0ee', color: '#666' },
  ];

  return html`
    <div class="screen">
      <div class="family-screen">
        <!-- Header with date picker -->
        <div class="family-header">
          <div class="week-header-top">
            <h1 class="header-title">Familie</h1>
            <div class="header-actions">
              <div class="header-nav-arrows">
                <div class="nav-arrow" onclick=${() => shiftWeek(-1)}>${Icons.chevLeft}</div>
                <span class="kw-label">KW ${getKW(selectedDate)}</span>
                <div class="nav-arrow" onclick=${() => shiftWeek(1)}>${Icons.chevRight}</div>
              </div>
            </div>
          </div>
          <div class="family-strip">
            ${weekDates.map(d => {
              const active = isToday(d);
              const selected = d === selectedDate;
              const dayNum = new Date(d + 'T12:00').getDate();
              return html`
                <div class="family-day ${selected ? 'selected' : ''}" onclick=${() => selectDate(d)}>
                  <span class="family-day-label ${active ? 'today-label' : ''}">${active ? 'HEUTE' : weekdayShort(d)}</span>
                  <div class="family-day-circle ${active ? 'active' : ''}">${dayNum}</div>
                </div>
              `;
            })}
          </div>
        </div>

        <!-- Day type pill -->
        <div class="family-daytype">
          <span class="family-daytype-pill" style="background:${DAYTYPE_COLORS[dayType]}20;color:${DAYTYPE_COLORS[dayType]}">
            ${DAYTYPE_LABELS[dayType]}
          </span>
        </div>

        ${loading ? html`<div class="loading-state">Laden...</div>` : html`
          <!-- Meal slots with family rows -->
          <div class="family-meals">
            ${allSlots.map(slot => {
              const katjaMeal = meals.find(m => m.slot === slot.key && (!m.person || m.person === 'katja'));

              return html`
                <div class="family-meal-card">
                  <div class="family-meal-header">
                    <span class="family-meal-icon">${slot.icon}</span>
                    <span class="family-meal-label">${slot.label}</span>
                  </div>
                  <div class="family-member-rows">
                    ${members.map(mem => {
                      const meal = mem.key === 'katja' ? katjaMeal : null; // TODO: multi-person meals
                      const name = meal ? meal.recipe_name : '—';
                      const dimmed = !meal;
                      return html`
                        <div class="family-member-row ${dimmed ? 'dimmed' : ''}">
                          <div class="family-avatar" style="background:${mem.bg};color:${mem.color}">${mem.initial}</div>
                          <span class="family-member-meal">${name}</span>
                        </div>
                      `;
                    })}
                  </div>
                </div>
              `;
            })}
          </div>
        `}
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
