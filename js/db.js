// js/db.js — Supabase Client & DB Functions
// ⚠️ SUPABASE_URL und SUPABASE_ANON_KEY müssen nach Projekt-Setup eingetragen werden!

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qxbnjemssqjczexevnff.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4Ym5qZW1zc3FqY3pleGV2bmZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjUyMDYsImV4cCI6MjA5MTQwMTIwNn0.dZLv-Cgar7FaSSbyZBFcWq1JGQrp-v8UQ-CNjN3Fm2Y';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth ──

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session?.user || null));
}

// ── Weeks ──

export async function getOrCreateWeek(userId, startDate) {
  // Try to find existing week
  let { data, error } = await supabase
    .from('weeks')
    .select('*')
    .eq('user_id', userId)
    .eq('start_date', startDate)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    // Not found — create
    const { data: created, error: cErr } = await supabase
      .from('weeks')
      .insert({ user_id: userId, start_date: startDate })
      .select()
      .single();
    if (cErr) throw cErr;
    return created;
  }
  return data;
}

// ── Days ──

export async function getDaysForWeek(weekId) {
  const { data, error } = await supabase
    .from('days')
    .select('*')
    .eq('week_id', weekId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getOrCreateDay(weekId, date, dayType) {
  let { data, error } = await supabase
    .from('days')
    .select('*')
    .eq('week_id', weekId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: cErr } = await supabase
      .from('days')
      .insert({
        week_id: weekId,
        date,
        day_type: dayType,
        day_type_default: dayType,
        total_kcal: 0, total_protein: 0, total_carbs: 0, total_fat: 0
      })
      .select()
      .single();
    if (cErr) throw cErr;
    return created;
  }
  return data;
}

export async function updateDayType(dayId, newType) {
  const { error } = await supabase
    .from('days')
    .update({ day_type: newType })
    .eq('id', dayId);
  if (error) throw error;
}

export async function updateDayTotals(dayId, totals) {
  const { error } = await supabase
    .from('days')
    .update(totals)
    .eq('id', dayId);
  if (error) throw error;
}

// ── Meals ──

export async function getMealsForDay(dayId) {
  const { data, error } = await supabase
    .from('meals')
    .select('*, meal_items(*)')
    .eq('day_id', dayId)
    .order('slot');
  if (error) throw error;
  return data || [];
}

export async function upsertMeal(meal) {
  const { data, error } = await supabase
    .from('meals')
    .upsert(meal)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(mealId) {
  // meal_items cascade-deleted via FK
  const { error } = await supabase
    .from('meals')
    .delete()
    .eq('id', mealId);
  if (error) throw error;
}

// ── Meal Items ──

export async function upsertMealItems(items) {
  const { error } = await supabase
    .from('meal_items')
    .upsert(items);
  if (error) throw error;
}

export async function deleteMealItem(itemId) {
  const { error } = await supabase
    .from('meal_items')
    .delete()
    .eq('id', itemId);
  if (error) throw error;
}

// ── Bulk update: all meals with same recipe_name in a week ──

export async function findSiblingMeals(weekId, recipeName, slot) {
  // Find all meals in this week with the same recipe_name and slot
  const { data: days, error: dErr } = await supabase
    .from('days')
    .select('id')
    .eq('week_id', weekId);
  if (dErr) throw dErr;
  if (!days || days.length === 0) return [];

  const dayIds = days.map(d => d.id);
  const { data: meals, error: mErr } = await supabase
    .from('meals')
    .select('*, meal_items(*)')
    .in('day_id', dayIds)
    .eq('recipe_name', recipeName)
    .eq('slot', slot);
  if (mErr) throw mErr;
  return meals || [];
}

export async function updateMealMacros(mealId, updates) {
  const { error } = await supabase
    .from('meals')
    .update(updates)
    .eq('id', mealId);
  if (error) throw error;
}

export async function replaceMealItems(mealId, newItems) {
  // Delete old items
  const { error: delErr } = await supabase
    .from('meal_items')
    .delete()
    .eq('meal_id', mealId);
  if (delErr) throw delErr;

  // Insert new items
  if (newItems && newItems.length > 0) {
    const { error: insErr } = await supabase
      .from('meal_items')
      .insert(newItems.map(it => ({ ...it, meal_id: mealId })));
    if (insErr) throw insErr;
  }
}

export async function recalcDayTotals(dayId) {
  const meals = await getMealsForDay(dayId);
  const totals = meals.reduce((acc, m) => ({
    total_kcal: acc.total_kcal + (m.kcal || 0),
    total_protein: acc.total_protein + (m.protein || 0),
    total_carbs: acc.total_carbs + (m.carbs || 0),
    total_fat: acc.total_fat + (m.fat || 0),
  }), { total_kcal: 0, total_protein: 0, total_carbs: 0, total_fat: 0 });
  await updateDayTotals(dayId, totals);
  return totals;
}

// ── Day Type Targets ──

export async function getDayTypeTargets() {
  const { data, error } = await supabase
    .from('day_type_targets')
    .select('*');
  if (error) throw error;
  return data || [];
}

// ── Products ──

export async function searchProducts(query) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function upsertProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .upsert(product)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Recipes ──

export async function getRecipesForWeek(weekId) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('week_id', weekId);
  if (error) throw error;
  return data || [];
}

// ── Import (Mealplan JSON) ──

export async function importWeekData(userId, weekData) {
  // weekData: { start_date, days: [{ date, day_type, meals: [{ slot, recipe_name, ... items }] }] }
  const week = await getOrCreateWeek(userId, weekData.start_date);

  for (const dayData of weekData.days) {
    const day = await getOrCreateDay(week.id, dayData.date, dayData.day_type);

    // Clear existing meals for this day
    const existing = await getMealsForDay(day.id);
    for (const m of existing) {
      await deleteMeal(m.id);
    }

    // Insert new meals
    for (const mealData of (dayData.meals || [])) {
      const { items, ...mealFields } = mealData;
      const meal = await upsertMeal({ ...mealFields, day_id: day.id });

      if (items && items.length > 0) {
        await upsertMealItems(items.map(it => ({ ...it, meal_id: meal.id })));
      }
    }

    // Update totals
    const totals = (dayData.meals || []).reduce((acc, m) => ({
      total_kcal: acc.total_kcal + (m.kcal || 0),
      total_protein: acc.total_protein + (m.protein || 0),
      total_carbs: acc.total_carbs + (m.carbs || 0),
      total_fat: acc.total_fat + (m.fat || 0),
    }), { total_kcal: 0, total_protein: 0, total_carbs: 0, total_fat: 0 });

    await updateDayTotals(day.id, totals);
  }

  return week;
}
