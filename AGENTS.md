# AGENTS.md — Nutrition Tracker

> Dieses Dokument ist für KI-Assistenten, die an diesem Projekt arbeiten.
> Es beschreibt Architektur, Konventionen und bekannte Stolperfallen.

## Projektübersicht

Eine Nutrition-Tracking-Web-App für Katja, die direkt mit einem wöchentlichen Mealplan-Workflow zusammenarbeitet. Statt täglich Lebensmittel manuell zu tracken, werden die Nährwerte beim Mealplanning berechnet und per JSON-Import in die App eingefügt.

**URL**: `https://knokat.github.io/nutrition-tracker-claude/`

## Tech Stack

- **Frontend**: Preact + htm (Tagged Template Literals, kein JSX, kein Build Step)
- **Imports via CDN** (ES Modules):
  - `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`
  - `https://unpkg.com/htm/preact/standalone.module.js`
- **Datenbank**: Supabase (eigene Instanz, getrennt vom Workout Tracker)
  - **URL**: `https://qxbnjemssqjczexevnff.supabase.co`
  - **User**: knoerr.katja@gmail.com
- **Hosting**: GitHub Pages
- **Auth**: Supabase Email/Password (Email-Bestätigung deaktiviert)

## Dateistruktur

```
index.html          # Shell: HTML, CSS, PWA-Meta-Tags
manifest.json       # PWA Web App Manifest
js/app.js           # Hauptkomponente, Screens, State (~35KB)
js/components.js    # UI-Komponenten (Login, Cards, Nav, Sheets, Icons)
js/helpers.js       # Datums-Utils, Makro-Berechnung, Slot-Config
js/db.js            # Supabase Client, alle DB-Funktionen
icons/              # PWA-Icons (192, 512, apple-touch-icon, favicon)
```

## Datenbank-Schema (Supabase)

```
weeks           → id (UUID), user_id, start_date (DATE = Samstag!), notes
days            → id, week_id (FK), date, day_type, day_type_default, total_kcal/protein/carbs/fat
meals           → id, day_id (FK), slot, recipe_name, is_standard, kcal/protein/carbs/fat, person
meal_items      → id, meal_id (FK), product_id (FK nullable), ingredient_name, amount_g, unit, kcal/protein/carbs/fat
products        → id, name, brand, fddb_url, kcal_100g/protein_100g/carbs_100g/fat_100g, category
recipes         → id, name, description, servings, is_meal_prep, week_id (FK nullable)
day_type_targets → day_type (PK), target_kcal/protein/carbs/fat
```

Alle Tabellen haben Row Level Security (RLS) — User sieht nur eigene Daten.

## ⚠️ Kritische Konventionen

### Mealplan-Woche: Samstag bis Freitag (NICHT Montag bis Sonntag!)

Katjas Workflow: Freitag planen & einkaufen → Samstag schnell kochen → Sonntag Meal Prep → Mo–Do essen → Freitag Movie Night.

- `weeks.start_date` ist immer ein **Samstag**
- `getWeekStart()` in helpers.js berechnet den vorherigen Samstag
- `getWeekDates()` gibt 7 Tage zurück: Sa, So, Mo, Di, Mi, Do, Fr
- Die Wochenleiste zeigt: SA. SO. MO. DI. MI. DO. FR.

### Zeitzonen: NIEMALS toISOString() für Datumsformatierung verwenden!

`toISOString()` konvertiert nach UTC. In Wien (UTC+2) wird abends aus dem 10. April der 9. April. Das hat einen kritischen Bug verursacht, bei dem importierte Daten nicht angezeigt wurden.

**IMMER** lokale Methoden verwenden:
```javascript
// ✅ RICHTIG
const y = dt.getFullYear();
const m = String(dt.getMonth() + 1).padStart(2, '0');
const d = String(dt.getDate()).padStart(2, '0');
return `${y}-${m}-${d}`;

// ❌ FALSCH — verschiebt Daten um 1 Tag in UTC+X Zeitzonen
return dt.toISOString().slice(0, 10);
```

### Supabase: maybeSingle() statt single()

`.single()` wirft einen 406-Fehler wenn kein Ergebnis gefunden wird. `.maybeSingle()` gibt `null` zurück.

```javascript
// ✅ RICHTIG
const { data, error } = await supabase.from('weeks')...maybeSingle();
if (!data) { /* create */ }

// ❌ FALSCH — 406 Not Acceptable bei leerem Ergebnis
const { data, error } = await supabase.from('weeks')...single();
if (error?.code === 'PGRST116') { /* create */ }
```

### Datumsvergleich: Immer .slice(0, 10)

Supabase kann Daten als `"2026-04-11"` oder `"2026-04-11T00:00:00+00:00"` zurückgeben. Beim Vergleich immer normalisieren:

```javascript
// ✅ RICHTIG
days.find(dy => String(dy.date).slice(0, 10) === dateStr);

// ❌ FALSCH — kann fehlschlagen wenn Supabase datetime zurückgibt
days.find(dy => dy.date === dateStr);
```

## App-Screens

### 1. Heute (Tab)
- Sticky Header mit Datum, KW-Navigation, Zahnrad für Settings
- Wochenleiste mit Fortschrittsringen (Sa–Fr)
- Makro-Balken (KCAL, PROT, CARB, FETT mit Ist/Soll)
- Segmented Picker für Tagestyp (Workout / Rest Day / Friday)
- Aufklappbare Mahlzeiten-Karten mit Zutaten-Details
- Bottom Sheet zum Bearbeiten von Mahlzeiten

### 2. Woche (Tab)
- 4 Summary-Cards (Gesamt + Tagesdurchschnitt)
- Horizontale Kalorien-Balken pro Tag mit Ziel-Markierung
- Tagestyp-Dots (farbig) und Legende

### 3. Mealplan (Tab)
- Wochenübersicht (Mo–Do / Fr / Sa+So)
- Aufklappbare Rezeptkarten mit Zutaten
- Badges: Meal Prep (blau) / Frisch (grün)
- Standardbausteine-Liste

### 4. Familie (Tab)
- Datumspicker mit einfachen Kreisen
- Tagestyp-Pill
- Mahlzeiten-Slots mit Familien-Avataren (K/L/M)

### Settings (via Zahnrad-Icon)
- Mealplan importieren (JSON-Textfeld)
- App aktualisieren (Cache löschen + Hard Reload)
- Abmelden

## Tagestypen

| Typ | Kürzel | Farbe | Kcal | Protein | Carbs | Fat |
|-----|--------|-------|------|---------|-------|-----|
| Workout | workout | #A42059 | 2200 | 140g | 253g | 70g |
| Rest Day | rest | #7AB2B2 | 1933 | 125g | 200g | 72g |
| Friday | friday | #205781 | 2181 | 120g | 250g | 80g |

## Mahlzeiten-Slots nach Tagestyp

- **Workout**: breakfast, snack1, lunch, snack2 (Kaffee+Schoko+Saft), preworkout, shake, dinner (Brotzeit)
- **Rest Day**: breakfast, snack1, lunch, snack2 (Kaffee+Schoko), dinner (Brotzeit)
- **Friday**: breakfast, snack1, lunch (Caprese), snack2 (Kaffee+Schoko), dinner (Movie Night)

## JSON-Import-Format

Der Mealplan-Skill generiert am Ende jedes Workflows einen JSON-Block. Format-Details in `references/import-format.md` im weekly-mealplan Skill.

Wichtig:
- `start_date` muss ein **Samstag** sein
- Alle 7 Tage (Sa–Fr) müssen enthalten sein
- `person` ist immer `"katja"`
- Standardbausteine: `is_standard: true`, keine Items nötig

## Deployment

1. Dateien auf GitHub bearbeiten (github.dev Web-Editor)
2. GitHub Pages deployt automatisch (Branch: main, Root: /)
3. In der App: Einstellungen → "App aktualisieren" oder Cmd+Shift+R

## Design System

### Makro-Farben
- KCAL: `#205781` (tiefes Blau)
- Protein: `#006D77` (Petrol)
- Carbs: `#4F959D` (Blaugrün)
- Fat: `#7AB2B2` (Salbeigrün)

### UI-Farben
- Hintergrund: `#f4f4f2`
- Karten: `#fff`
- Text: `#1a1a1a` / `#888` / `#aaa`

### Wichtige Komponenten-Regeln
- Segmented Picker: `<div>` mit onclick, KEINE `<button>` (Browser-Default-Styling)
- Font: System font stack (kein Custom Font)
- Keine Emojis im UI außer Mahlzeiten-Icons
- Inline Styles im `<style>` Block der index.html, kein separates CSS

## Edit-Sheet (Bearbeiten-Overlay)

Das Edit-Sheet ist das zentrale UI für spontane Änderungen:

- **X-Button** oben rechts, sticky Footer (Buttons immer sichtbar)
- **Zutatenliste**: Name, Menge, Makros pro Zutat
- **Pro-100g-Modus**: Aufklappbar pro Zutat — kcal/P/C/F pro 100g eingeben + Menge → automatische Berechnung
- **Undo**: Nach Löschen einer Zutat erscheint "↩ Rückgängig"
- **Scope**: "Nur heute" vs "Alle Tage (X)" — für Rezeptkorrekturen die alle Tage betreffen
- **Meal löschen**: "Löschen" Link in der Meal Card, mit Bestätigungsdialog

### DB-Funktionen für Edit-Sheet
- `findSiblingMeals(weekId, recipeName, slot)` — findet alle Meals mit gleichem Rezept in der Woche
- `updateMealMacros(mealId, updates)` — aktualisiert Makros eines einzelnen Meals
- `replaceMealItems(mealId, newItems)` — löscht alte Items und fügt neue ein
- `recalcDayTotals(dayId)` — berechnet Tagessummen neu aus allen Meals

## Geplantes Feature: FDDB-Screenshot-Import
Nächstes großes Feature: Foto von FDDB-Tagesübersicht oder Einzeleintrag hochladen → Claude Vision API liest Name, Menge, kcal, P, C, F aus → automatisch in Zutatenfelder eintragen.
