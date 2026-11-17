'use strict';
// Data layer. Everything lives in one JSON blob in localStorage on this device.
// Exercises are referenced by id everywhere, so renaming one keeps its history.

const STORE_KEY = 'gymlog-data-v1';
const SCHEMA = 1;
const DEFAULT_MIN = 5;
const DEFAULT_MAX = 8;

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function seedData() {
  return {
    schema: SCHEMA,
    exercises: {},
    days: [
      { id: 'd_upper', name: 'Upper', exerciseIds: [] },
      { id: 'd_lower', name: 'Lower', exerciseIds: [] }
    ],
    // Keys are JS weekday numbers: 0 = Sunday ... 6 = Saturday. null = Rest.
    schedule: { 0: null, 1: 'd_upper', 2: 'd_lower', 3: null, 4: 'd_upper', 5: 'd_lower', 6: null },
    sessions: [],
    active: null,
    settings: { theme: 'system', lastExport: null }
  };
}

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// Fill in anything missing and coerce types. Used on load and on import.
function normalizeData(d) {
  if (!d || typeof d !== 'object') throw new Error('Not a backup file');
  const out = seedData();
  out.exercises = {};
  for (const [id, e] of Object.entries(d.exercises || {})) {
    if (!e || !e.name) continue;
    const repMin = Math.max(1, int(e.repMin, DEFAULT_MIN));
    out.exercises[id] = { id, name: String(e.name), repMin, repMax: Math.max(repMin, int(e.repMax, DEFAULT_MAX)) };
  }
  if (Array.isArray(d.days)) {
    out.days = d.days.filter(x => x && x.id).map(x => ({
      id: String(x.id),
      name: String(x.name || 'Workout'),
      exerciseIds: (x.exerciseIds || []).filter(id => out.exercises[id])
    }));
  }
  const dayIds = new Set(out.days.map(x => x.id));
  if (d.schedule) {
    for (let i = 0; i < 7; i++) out.schedule[i] = dayIds.has(d.schedule[i]) ? d.schedule[i] : null;
  }
  out.sessions = (Array.isArray(d.sessions) ? d.sessions : [])
    .filter(s => s && s.id && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map(s => ({
      id: String(s.id), date: s.date, startedAt: s.startedAt || 0, finishedAt: s.finishedAt || 0,
      dayId: s.dayId || null, dayName: String(s.dayName || 'Workout'),
      entries: (s.entries || []).filter(e => e && out.exercises[e.exerciseId]).map(e => ({
        exerciseId: e.exerciseId,
        sets: (e.sets || []).map(x => ({ w: Number(x.w) || 0, r: int(x.r, 0) })).filter(x => x.r > 0)
      })).filter(e => e.sets.length)
    }));
  const a = d.active;
  if (a && a.id && Array.isArray(a.order)) {
    out.active = {
      id: a.id, date: a.date, startedAt: a.startedAt, dayId: a.dayId || null, dayName: a.dayName || 'Workout',
      order: a.order.filter(id => out.exercises[id]), entries: {}
    };
    for (const [id, en] of Object.entries(a.entries || {})) {
      if (out.exercises[id] && en && Array.isArray(en.sets)) out.active.entries[id] = { done: !!en.done, sets: en.sets.map(x => ({ w: x.w ?? '', r: x.r ?? '' })) };
    }
  }
  if (d.settings) Object.assign(out.settings, d.settings);
  return out;
}

let DATA;
function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    DATA = raw ? normalizeData(JSON.parse(raw)) : seedData();
  } catch (e) {
    console.error(e);
    DATA = seedData();
  }
}
function saveData() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); }
  catch (e) { console.error(e); if (typeof toast === 'function') toast('Could not save — storage may be full'); }
}

// ---------- dates ----------
const pad2 = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => dateStr(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s, withYear) {
  const d = parseDate(s);
  const y = withYear || d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${y}`;
}
function fmtShort(s) { const d = parseDate(s); return `${d.getDate()} ${MON[d.getMonth()]}`; }
function fmtMonth(s) {
  const d = parseDate(s);
  return d.getFullYear() === new Date().getFullYear() ? MON[d.getMonth()] : `${MON[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- numbers / sets ----------
function parseWeight(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
const fmtW = w => (Math.round(w * 100) / 100).toString();
const fmtSet = s => (s.w > 0 ? `${fmtW(s.w)}kg` : 'BW') + ` × ${s.r}`;
const setsSummary = sets => sets.map(fmtSet).join(', ');

// Turn in-progress sets (strings while typing) into saved sets; drops sets with no reps.
function cleanSets(sets) {
  return sets.map(s => ({ w: parseWeight(s.w), r: int(s.r, 0) })).filter(s => s.r > 0);
}
// Best set = heaviest weight; ties broken by more reps.
function bestSet(sets) {
  return sets.reduce((b, s) => (!b || s.w > b.w || (s.w === b.w && s.r > b.r) ? s : b), null);
}
const hitTop = (ex, sets) => !!ex && sets.some(s => int(s.r, 0) > ex.repMax);

// ---------- queries ----------
const sessionOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startedAt || 0) - (b.startedAt || 0));
const sortedSessions = () => DATA.sessions.slice().sort(sessionOrder);
const getDay = id => DATA.days.find(d => d.id === id) || null;
const getSession = id => DATA.sessions.find(s => s.id === id) || null;

// Most recent saved session containing this exercise (across all workout days).
function lastPerf(exId, beforeSession) {
  const list = sortedSessions();
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (beforeSession && (s.id === beforeSession.id || sessionOrder(s, beforeSession) > 0)) continue;
    const e = s.entries.find(x => x.exerciseId === exId);
    if (e && e.sets.length) return { session: s, entry: e };
  }
  return null;
}

function historyFor(exId) {
  const out = [];
  for (const s of sortedSessions()) {
    const e = s.entries.find(x => x.exerciseId === exId);
    if (e && e.sets.length) out.push({ session: s, sets: e.sets, best: bestSet(e.sets) });
  }
  return out;
}

function findExerciseByName(name) {
  const n = name.trim().toLowerCase();
  return Object.values(DATA.exercises).find(e => e.name.trim().toLowerCase() === n) || null;
}
function createExercise(name) {
  const existing = findExerciseByName(name);
  if (existing) return existing;
  const ex = { id: uid('x'), name: name.trim(), repMin: DEFAULT_MIN, repMax: DEFAULT_MAX };
  DATA.exercises[ex.id] = ex;
  return ex;
}
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// ---------- active session ----------
function startSession(dayId) {
  const day = getDay(dayId);
  DATA.active = {
    id: uid('s'), date: todayStr(), startedAt: Date.now(),
    dayId: day ? day.id : null, dayName: day ? day.name : 'Workout',
    order: day ? day.exerciseIds.slice() : [], entries: {}
  };
  saveData();
}

// Create the entry the first time an exercise is opened, prefilled from last time.
function ensureEntry(exId) {
  const a = DATA.active;
  if (a.entries[exId]) return a.entries[exId];
  const ex = DATA.exercises[exId];
  const last = lastPerf(exId);
  const sets = last ? last.entry.sets.map(s => ({ w: s.w > 0 ? fmtW(s.w) : '', r: s.r })) : [{ w: '', r: ex.repMin }];
  a.entries[exId] = { done: false, sets };
  saveData();
  return a.entries[exId];
}
