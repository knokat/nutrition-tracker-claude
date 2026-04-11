// js/components.js — UI Components (Preact + htm)
import { html, useState, useRef, useEffect } from 'https://unpkg.com/htm/preact/standalone.module.js';
import {
  weekdayShort, formatDateDisplay, isToday, isFuture,
  macroPercent, kcalColor, n0,
  MACRO_COLORS, DAYTYPE_LABELS, getSlotsForType,
} from './helpers.js';

// ── Lucide-style SVG Icons (inline) ──

const Icons = {
  calendar: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  chevDown: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  chevUp: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  chevLeft: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevRight: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  // Bottom nav icons
  todayIcon: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  weekIcon: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  mealplanIcon: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  familyIcon: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  settings: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};
export { Icons };

// ── Progress Ring (SVG) ──

export function ProgressRing({ percent, size = 40, stroke = 3, isActive, dayNum, hasData }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(percent || 0, 150);
  const offset = circ - (pct / 100) * circ;
  const color = kcalColor(pct);

  if (isActive) {
    // Today: filled circle
    return html`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r + stroke/2}" fill="#205781"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
          stroke="rgba(255,255,255,0.3)" stroke-width="${stroke}"/>
        ${hasData && html`
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
            stroke="#fff" stroke-width="${stroke}"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
            stroke-linecap="round"
            transform="rotate(-90 ${size/2} ${size/2})"
            style="transition: stroke-dashoffset 0.5s ease"/>
        `}
        <text x="${size/2}" y="${size/2}" text-anchor="middle" dy="0.35em"
          fill="#fff" font-size="13" font-weight="600">${dayNum}</text>
      </svg>
    `;
  }

  return html`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
        stroke="#ececea" stroke-width="${stroke}"/>
      ${hasData && html`
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
          stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round"
          transform="rotate(-90 ${size/2} ${size/2})"
          style="transition: stroke-dashoffset 0.5s ease"/>
      `}
      <text x="${size/2}" y="${size/2}" text-anchor="middle" dy="0.35em"
        fill="${hasData ? '#1a1a1a' : '#aaa'}" font-size="13" font-weight="500">${dayNum}</text>
    </svg>
  `;
}

// ── Week Strip ──

export function WeekStrip({ dates, daysData, selectedDate, onSelect, targets }) {
  return html`
    <div class="week-strip">
      ${dates.map(dateStr => {
        const dayData = daysData.find(d => String(d.date).slice(0, 10) === dateStr);
        const active = isToday(dateStr);
        const selected = dateStr === selectedDate;
        const hasData = dayData && dayData.total_kcal > 0;
        const target = targets && dayData ? (targets[dayData.day_type]?.target_kcal || 2200) : 2200;
        const pct = hasData ? macroPercent(dayData.total_kcal, target) : 0;
        const dayNum = parseInt(dateStr.slice(8, 10), 10);

        return html`
          <div class="week-day ${selected ? 'selected' : ''}" onclick=${() => onSelect(dateStr)}>
            <span class="week-day-label ${active ? 'today-label' : ''}">
              ${active ? 'HEUTE' : weekdayShort(dateStr)}
            </span>
            <${ProgressRing} percent=${pct} isActive=${active} dayNum=${dayNum} hasData=${hasData}/>
          </div>
        `;
      })}
    </div>
  `;
}

// ── Macro Bar ──

export function MacroBar({ label, actual, target, color }) {
  const pct = macroPercent(actual, target);
  const barColor = label === 'KCAL' ? kcalColor(pct) : color;
  const barWidth = Math.min(pct, 100);

  return html`
    <div class="macro-bar">
      <div class="macro-bar-header">
        <span class="macro-label" style="color: ${color}">${label}</span>
        <span class="macro-values">${n0(actual)} / ${n0(target)}</span>
      </div>
      <div class="macro-bar-track">
        <div class="macro-bar-fill" style="width: ${barWidth}%; background: ${barColor}"/>
      </div>
    </div>
  `;
}

export function MacroBars({ actual, targets }) {
  if (!targets) return null;
  return html`
    <div class="macro-bars">
      <${MacroBar} label="KCAL" actual=${actual.kcal} target=${targets.target_kcal} color=${MACRO_COLORS.kcal}/>
      <${MacroBar} label="PROT" actual=${actual.protein} target=${targets.target_protein} color=${MACRO_COLORS.protein}/>
      <${MacroBar} label="CARB" actual=${actual.carbs} target=${targets.target_carbs} color=${MACRO_COLORS.carbs}/>
      <${MacroBar} label="FETT" actual=${actual.fat} target=${targets.target_fat} color=${MACRO_COLORS.fat}/>
    </div>
  `;
}

// ── Segmented Picker ──

export function SegmentedPicker({ value, options, onChange }) {
  const containerRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({});

  useEffect(() => {
    if (!containerRef.current) return;
    const idx = options.findIndex(o => o.value === value);
    const items = containerRef.current.querySelectorAll('.seg-item');
    if (items[idx]) {
      const item = items[idx];
      setPillStyle({
        left: item.offsetLeft + 'px',
        width: item.offsetWidth + 'px',
      });
    }
  }, [value, options]);

  return html`
    <div class="seg-picker" ref=${containerRef}>
      <div class="seg-pill" style=${pillStyle}/>
      ${options.map((opt, i) => html`
        <div class="seg-item ${value === opt.value ? 'active' : ''}"
          onclick=${() => onChange(opt.value)}>
          ${opt.label}
        </div>
        ${i < options.length - 1 && html`
          <div class="seg-divider ${
            value === opt.value || value === options[i+1]?.value ? 'hidden' : ''
          }"/>
        `}
      `)}
    </div>
  `;
}

// ── Meal Card ──

export function MealCard({ slot, meal, onEdit }) {
  const [open, setOpen] = useState(false);
  const items = meal?.meal_items || [];
  const hasMeal = meal && (meal.kcal > 0 || items.length > 0);

  return html`
    <div class="meal-card">
      <div class="meal-card-header" onclick=${() => hasMeal && setOpen(!open)}>
        <div class="meal-icon-wrap">
          <span class="meal-icon">${slot.icon}</span>
        </div>
        <div class="meal-info">
          <div class="meal-name">
            ${meal?.recipe_name || slot.label}
            ${meal?.is_standard && html`<span class="std-badge">Standard</span>`}
          </div>
          <div class="meal-macros-preview">
            ${hasMeal
              ? html`<span>${n0(meal.kcal)} kcal</span>
                      <span class="macro-dot">·</span>
                      <span>P ${n0(meal.protein)}</span>
                      <span class="macro-dot">·</span>
                      <span>C ${n0(meal.carbs)}</span>
                      <span class="macro-dot">·</span>
                      <span>F ${n0(meal.fat)}</span>`
              : html`<span class="empty-meal">Noch nichts geplant</span>`
            }
          </div>
        </div>
        ${hasMeal && html`
          <div class="meal-chevron">${open ? Icons.chevUp : Icons.chevDown}</div>
        `}
      </div>
      ${open && html`
        <div class="meal-card-body">
          ${items.length > 0 && html`
            <div class="meal-items">
              ${items.map(it => html`
                <div class="meal-item-row">
                  <span class="item-name">${it.ingredient_name}</span>
                  <span class="item-amount">${n0(it.amount_g)}${it.unit || 'g'}</span>
                  <span class="item-macros">
                    P${n0(it.protein)} C${n0(it.carbs)} F${n0(it.fat)}
                  </span>
                </div>
              `)}
            </div>
          `}
          <div class="meal-edit-link" onclick=${() => onEdit && onEdit(meal, slot)}>
            Bearbeiten ↗
          </div>
        </div>
      `}
    </div>
  `;
}

// ── Bottom Navigation ──

export function BottomNav({ active, onNav }) {
  const tabs = [
    { key: 'today',    label: 'Heute',    icon: Icons.todayIcon },
    { key: 'week',     label: 'Woche',    icon: Icons.weekIcon },
    { key: 'mealplan', label: 'Mealplan', icon: Icons.mealplanIcon },
    { key: 'family',   label: 'Familie',  icon: Icons.familyIcon },
  ];

  return html`
    <nav class="bottom-nav">
      ${tabs.map(t => html`
        <div class="nav-tab ${active === t.key ? 'active' : ''}"
          onclick=${() => onNav(t.key)}>
          <div class="nav-icon">${t.icon}</div>
          <span class="nav-label">${t.label}</span>
        </div>
      `)}
    </nav>
  `;
}

// ── Login Screen ──

export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await onLogin(email, pw);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return html`
    <div class="login-screen">
      <div class="login-card">
        <img class="login-icon-img" src="icons/apple-touch-icon.png" alt="Nutrition Tracker"/>
        <h1 class="login-title">Nutrition Tracker</h1>
        <p class="login-subtitle">Makros & Kalorien im Blick</p>
        <div class="login-fields">
          <input type="email" placeholder="Email" value=${email}
            onInput=${e => setEmail(e.target.value)} class="login-input"/>
          <input type="password" placeholder="Passwort" value=${pw}
            onInput=${e => setPw(e.target.value)} class="login-input"
            onKeyDown=${e => e.key === 'Enter' && submit()}/>
        </div>
        ${error && html`<div class="login-error">${error}</div>`}
        <div class="login-btn ${loading ? 'loading' : ''}" onclick=${submit}>
          ${loading ? 'Laden...' : 'Anmelden'}
        </div>
      </div>
    </div>
  `;
}

// ── Edit Meal Bottom Sheet ──

export function EditMealSheet({ meal, slot, targets, onSave, onClose, siblingCount }) {
  const [name, setName] = useState(meal?.recipe_name || slot?.label || '');
  const [items, setItems] = useState(() => {
    const existing = (meal?.meal_items || []).map(it => ({ ...it }));
    return existing.length > 0 ? existing : [];
  });
  const [kcal, setKcal] = useState(meal?.kcal || 0);
  const [protein, setProtein] = useState(meal?.protein || 0);
  const [carbs, setCarbs] = useState(meal?.carbs || 0);
  const [fat, setFat] = useState(meal?.fat || 0);
  const [scope, setScope] = useState('today');
  const [showDirectMacros, setShowDirectMacros] = useState(items.length === 0);
  const [undoStack, setUndoStack] = useState([]); // for undo deleted items
  const [per100Mode, setPer100Mode] = useState(null); // index of item in per-100g edit mode

  function recalcFromItems(updatedItems) {
    const totals = updatedItems.reduce((acc, it) => ({
      kcal: acc.kcal + (Number(it.kcal) || 0),
      protein: acc.protein + (Number(it.protein) || 0),
      carbs: acc.carbs + (Number(it.carbs) || 0),
      fat: acc.fat + (Number(it.fat) || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    setKcal(Math.round(totals.kcal));
    setProtein(Math.round(totals.protein));
    setCarbs(Math.round(totals.carbs));
    setFat(Math.round(totals.fat));
  }

  function updateItem(idx, field, value) {
    const updated = items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    setItems(updated);
    if (['kcal', 'protein', 'carbs', 'fat'].includes(field)) {
      recalcFromItems(updated);
    }
  }

  function removeItem(idx) {
    const removed = items[idx];
    setUndoStack([...undoStack, { item: removed, index: idx }]);
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    recalcFromItems(updated);
  }

  function undoRemove() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    const updated = [...items];
    updated.splice(last.index, 0, last.item);
    setItems(updated);
    recalcFromItems(updated);
  }

  function addItem() {
    setItems([...items, {
      ingredient_name: '', amount_g: 0, unit: 'g',
      kcal: 0, protein: 0, carbs: 0, fat: 0,
      _per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    }]);
    setPer100Mode(items.length); // open per-100g mode for new item
  }

  function updatePer100(idx, field, value) {
    const item = items[idx];
    const per100 = { ...(item._per100 || {}), [field]: Number(value) || 0 };
    const amount = Number(item.amount_g) || 0;
    const factor = amount / 100;
    const updated = items.map((it, i) => i === idx ? {
      ...it,
      _per100: per100,
      kcal: Math.round(per100.kcal * factor),
      protein: Math.round(per100.protein * factor * 10) / 10,
      carbs: Math.round(per100.carbs * factor * 10) / 10,
      fat: Math.round(per100.fat * factor * 10) / 10,
    } : it);
    setItems(updated);
    recalcFromItems(updated);
  }

  function updateAmountWithPer100(idx, newAmount) {
    const item = items[idx];
    const per100 = item._per100 || {};
    const factor = (Number(newAmount) || 0) / 100;
    const hasPer100 = per100.kcal || per100.protein || per100.carbs || per100.fat;
    const updated = items.map((it, i) => {
      if (i !== idx) return it;
      const base = { ...it, amount_g: Number(newAmount) || 0 };
      if (hasPer100) {
        base.kcal = Math.round((per100.kcal || 0) * factor);
        base.protein = Math.round((per100.protein || 0) * factor * 10) / 10;
        base.carbs = Math.round((per100.carbs || 0) * factor * 10) / 10;
        base.fat = Math.round((per100.fat || 0) * factor * 10) / 10;
      }
      return base;
    });
    setItems(updated);
    recalcFromItems(updated);
  }

  const save = () => {
    onSave({
      ...(meal || {}),
      recipe_name: name,
      slot: slot.key,
      kcal: Number(kcal),
      protein: Number(protein),
      carbs: Number(carbs),
      fat: Number(fat),
      _items: items.filter(it => it.ingredient_name).map(it => {
        const { _per100, ...rest } = it;
        return rest;
      }),
      _scope: scope,
      _originalRecipeName: meal?.recipe_name,
    });
  };

  const hasSiblings = (siblingCount || 0) > 1;

  return html`
    <div class="sheet-overlay" onclick=${onClose}>
      <div class="sheet" onclick=${e => e.stopPropagation()}>
        <div class="sheet-handle"/>
        <div class="sheet-top-bar">
          <h3>${slot?.icon} ${slot?.label || 'Mahlzeit'}</h3>
          <div class="sheet-close" onclick=${onClose}>×</div>
        </div>
        <div class="sheet-scroll">
          <label class="sheet-label">Rezeptname</label>
          <input class="sheet-input" value=${name}
            onInput=${e => setName(e.target.value)}/>

          <!-- Items List -->
          ${items.length > 0 && html`
            <label class="sheet-label" style="margin-top: 16px">Zutaten</label>
            <div class="sheet-items">
              ${items.map((it, idx) => html`
                <div class="sheet-item-block">
                  <div class="sheet-item-row">
                    <input class="sheet-item-name" value=${it.ingredient_name}
                      placeholder="Zutat"
                      onInput=${e => updateItem(idx, 'ingredient_name', e.target.value)}/>
                    <input type="number" class="sheet-item-amount" value=${it.amount_g}
                      placeholder="g"
                      onInput=${e => updateAmountWithPer100(idx, e.target.value)}/>
                    <span class="sheet-item-unit">${it.unit || 'g'}</span>
                    <div class="sheet-item-remove" onclick=${() => removeItem(idx)}>×</div>
                  </div>
                  <!-- Per 100g toggle -->
                  <div class="sheet-per100-toggle" onclick=${() => setPer100Mode(per100Mode === idx ? null : idx)}>
                    ${per100Mode === idx ? 'Makros pro 100g ▲' : 'Makros pro 100g ▼'}
                  </div>
                  ${per100Mode === idx && html`
                    <div class="sheet-per100-row">
                      <input type="number" class="sheet-per100-input" placeholder="kcal/100g"
                        value=${it._per100?.kcal || ''}
                        onInput=${e => updatePer100(idx, 'kcal', e.target.value)}/>
                      <input type="number" class="sheet-per100-input" placeholder="P/100g"
                        value=${it._per100?.protein || ''}
                        onInput=${e => updatePer100(idx, 'protein', e.target.value)}/>
                      <input type="number" class="sheet-per100-input" placeholder="C/100g"
                        value=${it._per100?.carbs || ''}
                        onInput=${e => updatePer100(idx, 'carbs', e.target.value)}/>
                      <input type="number" class="sheet-per100-input" placeholder="F/100g"
                        value=${it._per100?.fat || ''}
                        onInput=${e => updatePer100(idx, 'fat', e.target.value)}/>
                    </div>
                  `}
                  <div class="sheet-item-macros-row">
                    <span class="sheet-item-macro-display">${n0(it.kcal)} kcal</span>
                    <span class="sheet-item-macro-display">P ${n0(it.protein)}</span>
                    <span class="sheet-item-macro-display">C ${n0(it.carbs)}</span>
                    <span class="sheet-item-macro-display">F ${n0(it.fat)}</span>
                  </div>
                </div>
              `)}
              <div class="sheet-item-actions">
                <div class="sheet-add-item" onclick=${addItem}>+ Zutat hinzufügen</div>
                ${undoStack.length > 0 && html`
                  <div class="sheet-undo" onclick=${undoRemove}>↩ Rückgängig</div>
                `}
              </div>
            </div>
          `}

          ${items.length === 0 && html`
            <div class="sheet-add-item" style="margin-top:12px" onclick=${addItem}>+ Zutat hinzufügen</div>
          `}

          <!-- Direct Macros -->
          <div class="sheet-direct-toggle" onclick=${() => setShowDirectMacros(!showDirectMacros)}>
            ${items.length > 0 ? 'Oder Makros direkt eingeben' : 'Makros'} ${showDirectMacros ? '▲' : '▼'}
          </div>
          ${showDirectMacros && html`
            <div class="sheet-macros-grid">
              <div class="sheet-macro">
                <span class="sheet-macro-label" style="color:${MACRO_COLORS.kcal}">kcal</span>
                <input type="number" class="sheet-macro-input" value=${kcal}
                  onInput=${e => setKcal(e.target.value)}/>
              </div>
              <div class="sheet-macro">
                <span class="sheet-macro-label" style="color:${MACRO_COLORS.protein}">Protein</span>
                <input type="number" class="sheet-macro-input" value=${protein}
                  onInput=${e => setProtein(e.target.value)}/>
              </div>
              <div class="sheet-macro">
                <span class="sheet-macro-label" style="color:${MACRO_COLORS.carbs}">Carbs</span>
                <input type="number" class="sheet-macro-input" value=${carbs}
                  onInput=${e => setCarbs(e.target.value)}/>
              </div>
              <div class="sheet-macro">
                <span class="sheet-macro-label" style="color:${MACRO_COLORS.fat}">Fett</span>
                <input type="number" class="sheet-macro-input" value=${fat}
                  onInput=${e => setFat(e.target.value)}/>
              </div>
            </div>
          `}

          <!-- Scope Toggle -->
          ${hasSiblings && html`
            <div class="sheet-scope">
              <div class="sheet-scope-label">Änderung anwenden für:</div>
              <div class="sheet-scope-options">
                <div class="sheet-scope-opt ${scope === 'today' ? 'active' : ''}"
                  onclick=${() => setScope('today')}>
                  Nur heute
                </div>
                <div class="sheet-scope-opt ${scope === 'all' ? 'active' : ''}"
                  onclick=${() => setScope('all')}>
                  Alle Tage (${siblingCount})
                </div>
              </div>
            </div>
          `}
        </div>
        <div class="sheet-footer-sticky">
          <div class="sheet-btn cancel" onclick=${onClose}>Abbrechen</div>
          <div class="sheet-btn save" onclick=${save}>Speichern</div>
        </div>
      </div>
    </div>
  `;
}
