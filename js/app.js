'use strict';
// Views, routing and event handling. Views return HTML strings; one delegated
// click/input/change handler drives everything via data-action / data-bind.

const APP_VERSION = '1.1.1';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UI = { route: '', editing: null, picker: null, askResolve: null };

const go = path => { location.hash = '#' + path; };

// ---------- shared bits ----------
function header({ title, sub, back, backLabel, right }) {
  return `<header class="top">
    <div class="top-row">
      ${back ? `<button class="back" data-action="nav" data-to="${back}" aria-label="Back"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(backLabel || 'Back')}</button>` : '<span></span>'}
      ${right || ''}
    </div>
    <h1>${esc(title)}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
  </header>`;
}
const chev = '<span class="chev" aria-hidden="true">›</span>';
const progressBar = (done, total) =>
  `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></div>`;
const UP = '<svg class="up-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ST_CLS = { '1': ' st-beat', '0': ' st-match', '-1': ' st-below' };
const ST_TITLE = { '1': 'Beat last time', '0': 'Matched last time', '-1': 'Below last time' };
function setN(i, st) {
  return `<div class="set-n${ST_CLS[st] || ''}"${ST_TITLE[st] ? ` title="${ST_TITLE[st]}"` : ''}>${st === 1 ? '✓' : i + 1}</div>`;
}
function setRow(scope, exId, i, s, ex, st) {
  const d = `data-scope="${scope}" data-ex="${exId}" data-i="${i}"`;
  const over = parseInt(s.r, 10) > ex.repMax;
  return `<div class="set-row">
    ${setN(i, st)}
    <label class="w-field"><input class="w-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="${esc(s.w)}" data-bind="set-w" ${d} aria-label="Set ${i + 1} weight in kg"></label>
    <div class="reps${over ? ' over' : ''}">
      <button class="step" data-action="rep-step" data-delta="-1" ${d} aria-label="Fewer reps">−</button>
      <input class="r-in" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(s.r)}" data-bind="set-r" ${d} aria-label="Set ${i + 1} reps">
      <button class="step" data-action="rep-step" data-delta="1" ${d} aria-label="More reps">+</button>
    </div>
    <button class="icon-btn" data-action="set-del" ${d} aria-label="Remove set">✕</button>
  </div>`;
}
function setsBlock(scope, exId, sets, ex, perSet) {
  return `<div class="sets">
    <div class="sets-head"><span>Set</span><span>Weight · kg</span><span>Reps</span><span></span></div>
    ${sets.map((s, i) => setRow(scope, exId, i, s, ex, perSet ? perSet[i] : null)).join('')}
    ${sets.length ? '' : '<p class="muted small center">No sets — this exercise won’t be logged.</p>'}
    <button class="btn block add-set" data-action="set-add" data-scope="${scope}" data-ex="${exId}">+ Add set</button>
  </div>`;
}
function getSets(scope, exId) {
  if (scope === 'active') return DATA.active.entries[exId].sets;
  return UI.editing.entries.find(e => e.exerciseId === exId).sets;
}
const persist = scope => { if (scope === 'active') saveData(); };

// ---------- Home ----------
function viewHome() {
  const wd = new Date().getDay();
  const day = getDay(DATA.schedule[wd]);
  let h = header({ title: 'Today', sub: esc(fmtDate(todayStr(), true)) }) + '<div class="pad">';
  const a = DATA.active;
  if (a) {
    const done = a.order.filter(id => a.entries[id]?.done).length;
    h += `<div class="card active-card">
      <div class="eyebrow accent">In progress</div>
      <div class="big">${esc(a.dayName)}</div>
      <div class="muted">${a.date === todayStr() ? 'Today' : 'Started ' + esc(fmtDate(a.date))} · ${done}/${a.order.length} done</div>
      ${progressBar(done, a.order.length)}
      <button class="btn primary block big" data-action="nav" data-to="/session">Resume session</button>
    </div>`;
  }
  if (day) {
    h += `<div class="card">
      <div class="eyebrow">${WD_LONG[wd]}</div>
      <div class="big">${esc(day.name)}</div>
      ${day.exerciseIds.length
        ? `<ol class="preview">${day.exerciseIds.map(id => `<li>${esc(DATA.exercises[id]?.name)}</li>`).join('')}</ol>`
        : '<p class="muted">No exercises yet — add them once you start, or in Settings.</p>'}
      ${a ? '' : `<button class="btn primary block big" data-action="start" data-day="${day.id}">Start ${esc(day.name)}</button>`}
    </div>`;
  } else {
    h += `<div class="card"><div class="eyebrow">${WD_LONG[wd]}</div><div class="big">Rest day</div>
      <p class="muted">Recover well. Training anyway? Pick a workout below.</p></div>`;
  }
  const others = DATA.days.filter(d => d !== day);
  if (others.length) {
    h += `<h2 class="section">${day ? 'Do a different workout' : 'Start a workout'}</h2><div class="list">
      ${others.map(d => `<button class="row" data-action="start" data-day="${d.id}">
        <div class="row-main"><div class="row-title">${esc(d.name)}</div><div class="row-sub">${d.exerciseIds.length} exercise${d.exerciseIds.length === 1 ? '' : 's'}</div></div>${chev}</button>`).join('')}
    </div>`;
  }
  return h + '</div>';
}

async function onStart(dayId) {
  if (DATA.active) {
    const v = await ask('Session in progress', `You have an unfinished ${esc(DATA.active.dayName)} session.`, [
      { label: 'Resume it', v: 'resume', cls: 'primary' },
      { label: 'Discard it & start new', v: 'new', cls: 'danger' },
      { label: 'Cancel', v: null, cls: 'ghost' }
    ]);
    if (!v) return;
    if (v === 'resume') return go('/session');
  }
  startSession(dayId);
  go('/session');
}

// ---------- Session ----------
function viewSession() {
  const a = DATA.active;
  const done = a.order.filter(id => a.entries[id]?.done).length;
  let h = header({ title: a.dayName, sub: `${esc(fmtDate(a.date))} · ${done}/${a.order.length} done`, back: '/', backLabel: 'Today' });
  h += '<div class="pad">' + progressBar(done, a.order.length);
  if (a.order.length) {
    h += '<div class="ex-list">' + a.order.map(id => {
      const ex = DATA.exercises[id];
      if (!ex) return '';
      const en = a.entries[id];
      const last = lastPerf(id);
      let sub, flag = '';
      if (en?.done) {
        const c = cleanSets(en.sets);
        sub = c.length ? esc(setsSummary(c)) : 'No sets logged';
        if (beatLastTime(id)) flag = '<span class="badge win">✓ Beat last time</span>';
      } else {
        sub = last ? 'Last: ' + esc(setsSummary(last.entry.sets)) : 'No history yet';
        if (en) sub = '<span class="accent">Started</span> · ' + sub;
        if (last && hitTop(ex, last.entry.sets)) flag = `<span class="badge">${UP} Increase weight</span>`;
      }
      return `<button class="row ex-row${en?.done ? ' done' : en ? ' started' : ''}" data-action="nav" data-to="/session/${id}">
        <span class="check" aria-label="${en?.done ? 'Done' : 'Not done'}">${en?.done ? '✓' : ''}</span>
        <div class="row-main"><div class="row-title">${esc(ex.name)}</div><div class="row-sub">${sub}</div>${flag}</div>${chev}</button>`;
    }).join('') + '</div>';
  } else {
    h += '<div class="card"><p class="muted">No exercises in this session yet.</p></div>';
  }
  h += `<button class="btn block" data-action="picker" data-mode="session">+ Add exercise</button>
    <button class="btn primary block big" data-action="finish">Finish session</button>
    <button class="btn ghost danger-text block" data-action="discard">Discard session</button>
  </div>`;
  return h;
}

// ---------- Target to beat ----------
const PILL = { '1': ['beat', '✓ Beaten'], '0': ['match', '= Matched'], '-1': ['below', '↓ Below'] };
function statusPill(overall) {
  const [cls, label] = PILL[overall] || ['none', 'Not logged'];
  return `<span id="t-status" class="tstat ${cls}" role="status">${label}</span>`;
}
const tset = s => `<span class="tset">${s.w > 0 ? `<b>${fmtW(s.w)}</b><small>kg</small>` : '<b>BW</b>'}<i>×</i><b>${s.r}</b></span>`;
function targetCard(ex, last, st) {
  if (!last) {
    return `<div class="card target first">
      <div class="eyebrow">Target to beat</div>
      <div class="target-title">First time — set your baseline</div>
      <div class="muted small">What you log today becomes next time’s target.</div>
    </div>`;
  }
  const sets = last.entry.sets;
  const when = `Last time · ${esc(fmtDate(last.session.date))}`;
  if (hitTop(ex, sets)) {
    return `<div class="card target inc" data-st="${st.overall}">
      <div class="target-top"><div class="eyebrow accent">${UP} Increase weight</div>${statusPill(st.overall)}</div>
      <div class="target-title">New target: beat your reps at a heavier weight</div>
      <div class="muted small">${when}: ${esc(setsSummary(sets))}</div>
    </div>`;
  }
  return `<div class="card target" data-st="${st.overall}">
    <div class="target-top"><div class="eyebrow">Target to beat</div>${statusPill(st.overall)}</div>
    <div class="target-sets${sets.length > 1 ? ' many' : ''}">${sets.map(tset).join('')}</div>
    <div class="muted small">${when}</div>
  </div>`;
}
// Update the status pill and per-set markers while typing, without re-rendering (keeps the keyboard up).
function updateTarget(exId) {
  const card = $('.target');
  const last = lastPerf(exId);
  if (!card || !last) return;
  const st = targetStatus(last.entry.sets, DATA.active.entries[exId].sets);
  card.dataset.st = st.overall;
  $('#t-status').outerHTML = statusPill(st.overall);
  document.querySelectorAll('.sets .set-row').forEach((row, i) => { row.querySelector('.set-n').outerHTML = setN(i, st.perSet[i]); });
}
function beatLastTime(exId) {
  const last = lastPerf(exId);
  const en = DATA.active.entries[exId];
  return !!(last && en && targetStatus(last.entry.sets, en.sets).overall === 1);
}

function viewExercise(exId) {
  const a = DATA.active;
  const ex = DATA.exercises[exId];
  if (!ex || !a.order.includes(exId)) { go('/session'); return ''; }
  const en = ensureEntry(exId);
  const last = lastPerf(exId);
  const st = last ? targetStatus(last.entry.sets, en.sets) : null;
  let h = header({ title: ex.name, sub: `Rep range ${ex.repMin}–${ex.repMax}`, back: '/session', backLabel: a.dayName });
  h += '<div class="pad">' + targetCard(ex, last, st);
  h += setsBlock('active', exId, en.sets, ex, st && st.perSet);
  const over = hitTop(ex, en.sets);
  h += `<p class="hint" id="over-hint"${over ? '' : ' hidden'}>Above ${ex.repMax} reps — you’ll get an “increase weight” note next time.</p>`;
  h += en.done
    ? `<button class="btn success block big" data-action="ex-done" data-ex="${exId}">✓ Done — back to list</button>
       <button class="btn ghost block" data-action="ex-undone" data-ex="${exId}">Mark as not done</button>`
    : `<button class="btn primary block big" data-action="ex-done" data-ex="${exId}">Mark done</button>`;
  return h + '</div>';
}

async function finishSession() {
  const a = DATA.active;
  const doneIds = a.order.filter(id => a.entries[id]?.done);
  const pending = a.order.filter(id => a.entries[id] && !a.entries[id].done && cleanSets(a.entries[id].sets).length);
  let ids = doneIds;
  if (pending.length) {
    const names = pending.map(id => esc(DATA.exercises[id].name)).join(', ');
    const v = await ask('Not marked done', `You opened <b>${names}</b> but didn’t mark ${pending.length === 1 ? 'it' : 'them'} done.`, [
      { label: 'Save them too', v: 'all', cls: 'primary' },
      { label: 'Only save done ones', v: 'done' },
      { label: 'Cancel', v: null, cls: 'ghost' }
    ]);
    if (!v) return;
    if (v === 'all') ids = a.order.filter(id => doneIds.includes(id) || pending.includes(id));
  }
  const entries = ids.map(id => ({ exerciseId: id, sets: cleanSets(a.entries[id].sets) })).filter(e => e.sets.length);
  if (!entries.length) {
    const v = await ask('Nothing logged', 'No exercises have sets to save. Discard this session?', [
      { label: 'Discard session', v: 'd', cls: 'danger' }, { label: 'Keep going', v: null, cls: 'ghost' }
    ]);
    if (v) { DATA.active = null; saveData(); go('/'); }
    return;
  }
  if (!pending.length) {
    const v = await ask('Finish session?', `${entries.length} exercise${entries.length === 1 ? '' : 's'} will be saved.`, [
      { label: 'Finish & save', v: 'ok', cls: 'primary' }, { label: 'Keep going', v: null, cls: 'ghost' }
    ]);
    if (!v) return;
  }
  const s = { id: a.id, date: a.date, startedAt: a.startedAt, finishedAt: Date.now(), dayId: a.dayId, dayName: a.dayName, entries };
  DATA.sessions.push(s);
  DATA.active = null;
  saveData();
  go('/history/' + s.id);
  toast('Session saved');
}

// ---------- History ----------
function viewHistory() {
  let h = header({ title: 'History' }) + '<div class="pad">';
  const list = sortedSessions().reverse();
  if (!list.length) return h + '<div class="card"><p class="muted">No sessions yet. Finished sessions show up here.</p></div></div>';
  let month = '';
  for (const s of list) {
    const m = s.date.slice(0, 7);
    if (m !== month) {
      if (month) h += '</div>';
      month = m;
      const d = parseDate(s.date);
      h += `<h2 class="section">${MON[d.getMonth()]} ${d.getFullYear()}</h2><div class="list">`;
    }
    h += `<button class="row" data-action="nav" data-to="/history/${s.id}">
      <div class="row-main"><div class="row-title">${esc(s.dayName)} <span class="muted">· ${esc(fmtDate(s.date))}</span></div>
      <div class="row-sub">${esc(s.entries.map(e => DATA.exercises[e.exerciseId]?.name).join(', '))}</div></div>${chev}</button>`;
  }
  return h + '</div></div>';
}

function viewSessionDetail(id) {
  const s = getSession(id);
  if (!s) { go('/history'); return ''; }
  const ed = UI.editing && UI.editing.id === id ? UI.editing : null;
  let h = header({ title: s.dayName, sub: esc(fmtDate(ed ? ed.date : s.date, true)), back: '/history', backLabel: 'History' }) + '<div class="pad">';
  if (ed) {
    h += `<div class="card"><label class="field"><span>Date</span><input class="input" type="date" value="${ed.date}" data-bind="draft-date"></label></div>`;
    for (const e of ed.entries) {
      const ex = DATA.exercises[e.exerciseId];
      h += `<div class="card"><div class="card-head"><div class="card-title">${esc(ex.name)}</div>
        <button class="btn small ghost danger-text" data-action="draft-rm" data-ex="${ex.id}">Remove</button></div>
        ${setsBlock('draft', ex.id, e.sets, ex)}</div>`;
    }
    h += `<button class="btn block" data-action="picker" data-mode="draft">+ Add exercise</button>
      <button class="btn primary block big" data-action="draft-save">Save changes</button>
      <button class="btn ghost block" data-action="draft-cancel">Cancel</button>`;
    return h + '</div>';
  }
  for (const e of s.entries) {
    const ex = DATA.exercises[e.exerciseId];
    h += `<div class="card"><button class="card-head link" data-action="nav" data-to="/progress/${ex.id}"><div class="card-title">${esc(ex.name)}</div>${chev}</button>
      <ol class="set-list">${e.sets.map(x => `<li><span>${esc(fmtSet(x))}</span>${x.r > ex.repMax ? `<span class="badge">${UP} top of range</span>` : ''}</li>`).join('')}</ol></div>`;
  }
  if (!s.entries.length) h += '<div class="card"><p class="muted">No exercises logged.</p></div>';
  h += `<button class="btn block" data-action="draft-start" data-id="${id}">Edit session</button>
    <button class="btn ghost danger-text block" data-action="session-del" data-id="${id}">Delete session</button>`;
  return h + '</div>';
}

function startEdit(id) {
  const s = getSession(id);
  UI.editing = {
    id, date: s.date,
    entries: s.entries.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.map(x => ({ w: x.w > 0 ? fmtW(x.w) : '', r: x.r })) }))
  };
  render();
}
function saveEdit() {
  const ed = UI.editing;
  const s = getSession(ed.id);
  s.date = /^\d{4}-\d{2}-\d{2}$/.test(ed.date) ? ed.date : s.date;
  s.entries = ed.entries.map(e => ({ exerciseId: e.exerciseId, sets: cleanSets(e.sets) })).filter(e => e.sets.length);
  UI.editing = null;
  saveData();
  render();
  toast('Changes saved');
}

// ---------- Progress ----------
function viewProgress() {
  let h = header({ title: 'Progress' }) + '<div class="pad">';
  const exs = Object.values(DATA.exercises).sort(byName);
  if (!exs.length) return h + '<div class="card"><p class="muted">No exercises yet.</p></div></div>';
  h += '<div class="list">' + exs.map(ex => {
    const hist = historyFor(ex.id);
    const last = hist[hist.length - 1];
    const sub = last ? `${hist.length} session${hist.length === 1 ? '' : 's'} · best last time ${esc(fmtSet(last.best))}` : 'No sessions yet';
    return `<button class="row${last ? '' : ' dim'}" data-action="nav" data-to="/progress/${ex.id}">
      <div class="row-main"><div class="row-title">${esc(ex.name)}</div><div class="row-sub">${sub}</div></div>${chev}</button>`;
  }).join('') + '</div>';
  return h + '</div>';
}

function viewProgressDetail(exId) {
  const ex = DATA.exercises[exId];
  if (!ex) { go('/progress'); return ''; }
  const hist = historyFor(exId);
  let h = header({ title: ex.name, sub: `Rep range ${ex.repMin}–${ex.repMax}`, back: '/progress', backLabel: 'Progress' }) + '<div class="pad">';
  if (!hist.length) return h + '<div class="card"><p class="muted">No sessions logged for this exercise yet.</p></div></div>';
  const first = hist[0], last = hist[hist.length - 1];
  const diff = Math.round((last.best.w - first.best.w) * 100) / 100;
  const cls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
  h += `<div class="card">
    <div class="stats">
      <div class="stat"><div class="stat-l">${esc(fmtMonth(first.session.date))}</div><div class="stat-v">${fmtW(first.best.w)}<small>kg</small></div></div>
      <div class="stat"><div class="stat-l">Now</div><div class="stat-v">${fmtW(last.best.w)}<small>kg</small></div></div>
      <div class="stat"><div class="stat-l">Change</div><div class="stat-v ${cls}">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtW(Math.abs(diff))}<small>kg</small></div></div>
    </div>
    <div class="muted small">Best set per session · labels show reps</div>
    <div class="chart" id="chart"></div>
  </div>`;
  h += '<h2 class="section">Sessions</h2><div class="list">' + hist.slice().reverse().map(x => `
    <button class="row" data-action="nav" data-to="/history/${x.session.id}">
      <div class="row-main"><div class="row-title">${esc(fmtDate(x.session.date))} <span class="muted">· ${esc(x.session.dayName)}</span></div>
      <div class="row-sub">${esc(setsSummary(x.sets))}</div></div>${chev}</button>`).join('') + '</div>';
  return h + '</div>';
}

function niceStep(raw) {
  for (const s of [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200]) if (s >= raw) return s;
  return 500;
}
function drawChart(exId) {
  const el = $('#chart');
  if (!el) return;
  const pts = historyFor(exId).map(x => ({ w: x.best.w, r: x.best.r, date: x.session.date }));
  const n = pts.length;
  const H = 240, axisW = 38, padL = 14, padR = 20, padT = 28, padB = 30;
  const avail = Math.max(220, el.clientWidth - axisW);
  const W = Math.max(avail, padL + padR + (n - 1) * 34 + 20);
  const ws = pts.map(p => p.w);
  let lo = Math.min(...ws), hi = Math.max(...ws);
  const step = niceStep(Math.max(hi - lo, Math.max(hi * 0.1, 2)) / 4);
  lo = Math.max(0, Math.floor(lo / step) * step - (hi === lo ? step : 0));
  hi = Math.ceil(hi / step) * step + (hi === Math.ceil(hi / step) * step ? step : 0);
  if (hi <= lo) hi = lo + step;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = i => n === 1 ? padL + plotW / 2 : padL + 10 + (i * (plotW - 20)) / (n - 1);
  const y = w => padT + plotH - ((w - lo) / (hi - lo)) * plotH;
  // y-axis lives in its own non-scrolling SVG so weights stay visible when the plot scrolls
  let axis = `<svg class="axis" width="${axisW}" height="${H}" viewBox="0 0 ${axisW} ${H}" aria-hidden="true">`;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Best set weight per session">`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const yy = y(v).toFixed(1);
    svg += `<line class="grid" x1="0" x2="${W - padR + 10}" y1="${yy}" y2="${yy}"/>`;
    axis += `<text class="ax" x="${axisW - 4}" y="${(+yy + 4).toFixed(1)}" text-anchor="end">${fmtW(v)}</text>`;
  }
  axis += `<text class="ax" x="${axisW - 4}" y="${padT - 14}" text-anchor="end">kg</text></svg>`;
  // date labels: spaced at least ~64px apart, always include the last point
  const every = Math.max(1, Math.ceil(64 / (n > 1 ? (plotW - 20) / (n - 1) : 999)));
  pts.forEach((p, i) => {
    if (i === n - 1 || (i % every === 0 && (n - 1 - i) >= every * 0.75)) {
      const anchor = n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle';
      const dx = anchor === 'end' ? 8 : anchor === 'start' ? -8 : 0;
      svg += `<text class="ax" x="${(x(i) + dx).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${fmtShort(p.date)}</text>`;
    }
  });
  if (n > 1) {
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
    const base = (padT + plotH).toFixed(1);
    svg += `<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fill-top"/><stop offset="1" class="fill-bot"/></linearGradient></defs>`;
    svg += `<polygon class="area" points="${x(0).toFixed(1)},${base} ${line} ${x(n - 1).toFixed(1)},${base}"/>`;
    svg += `<polyline class="ln" points="${line}"/>`;
  }
  pts.forEach((p, i) => {
    const cx = x(i).toFixed(1), cy = y(p.w).toFixed(1);
    if (i === n - 1) svg += `<circle class="pt-halo" cx="${cx}" cy="${cy}" r="11"/>`;
    svg += `<circle class="pt${i === n - 1 ? ' last' : ''}" cx="${cx}" cy="${cy}" r="${i === n - 1 ? 6 : 4.5}"><title>${fmtShort(p.date)}: ${fmtW(p.w)}kg × ${p.r}</title></circle>`;
    svg += `<text class="lbl${i === n - 1 ? ' last' : ''}" x="${cx}" y="${(+cy - (i === n - 1 ? 17 : 11)).toFixed(1)}" text-anchor="middle">${p.r}</text>`;
  });
  el.innerHTML = axis + '<div class="plot">' + svg + '</svg></div>';
  const plot = el.querySelector('.plot');
  plot.scrollLeft = plot.scrollWidth;
}

// ---------- Settings ----------
const WEEK = [1, 2, 3, 4, 5, 6, 0];
function viewSettings() {
  let h = header({ title: 'Settings' }) + '<div class="pad">';
  h += '<h2 class="section">Weekly split</h2><div class="list">' + WEEK.map(wd => `
    <label class="row field-row"><span class="row-title">${WD_LONG[wd]}</span>
      <select class="select" data-bind="sched" data-wd="${wd}">
        <option value="">Rest</option>
        ${DATA.days.map(d => `<option value="${d.id}"${DATA.schedule[wd] === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
      </select></label>`).join('') + '</div>';
  h += '<h2 class="section">Workout days</h2><div class="list">' + DATA.days.map(d => `
    <button class="row" data-action="nav" data-to="/settings/day/${d.id}">
      <div class="row-main"><div class="row-title">${esc(d.name)}</div><div class="row-sub">${d.exerciseIds.length ? esc(d.exerciseIds.map(id => DATA.exercises[id]?.name).join(', ')) : 'No exercises'}</div></div>${chev}</button>`).join('') +
    '<button class="row add-row" data-action="day-add"><span class="accent">+ New workout day</span></button></div>';
  h += `<h2 class="section">Exercises</h2><div class="list"><button class="row" data-action="nav" data-to="/settings/exercises">
    <div class="row-main"><div class="row-title">All exercises</div><div class="row-sub">Rename, rep ranges, delete</div></div>${chev}</button></div>`;
  const t = DATA.settings.theme;
  h += `<h2 class="section">Appearance</h2><div class="seg">${['system', 'dark', 'light'].map(v =>
    `<button class="${t === v ? 'on' : ''}" data-action="theme" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  h += `<h2 class="section">Backup</h2><div class="card">
    <p class="muted small">Your data lives only on this phone. Export a backup now and then (Save to Files / iCloud Drive), and import it if you change phones.</p>
    <button class="btn primary block" data-action="export">Export data</button>
    <button class="btn block" data-action="import">Import data</button>
    <p class="muted small center">${DATA.sessions.length} sessions saved${DATA.settings.lastExport ? ' · last export ' + esc(fmtDate(DATA.settings.lastExport)) : ''}</p>
  </div>
  <p class="muted small center">Gym Log v${APP_VERSION}</p>`;
  return h + '</div>';
}

function exEditRow(ex, opts) {
  return `<div class="ed-row">
    <div class="ed-line">
      <input class="input" value="${esc(ex.name)}" data-bind="ex-name" data-ex="${ex.id}" aria-label="Exercise name" autocomplete="off">
      <button class="icon-btn" data-action="${opts.del}" data-ex="${ex.id}" aria-label="${opts.delLabel}">✕</button>
    </div>
    <div class="ed-line">
      <span class="muted small">Reps</span>
      <input class="input tiny" type="text" inputmode="numeric" pattern="[0-9]*" value="${ex.repMin}" data-bind="ex-min" data-ex="${ex.id}" aria-label="Min reps">
      <span class="muted">–</span>
      <input class="input tiny" type="text" inputmode="numeric" pattern="[0-9]*" value="${ex.repMax}" data-bind="ex-max" data-ex="${ex.id}" aria-label="Max reps">
      <span class="grow"></span>
      ${opts.extra || ''}
    </div>
  </div>`;
}

function viewDayEdit(id) {
  const day = getDay(id);
  if (!day) { go('/settings'); return ''; }
  let h = header({ title: day.name, sub: 'Workout day', back: '/settings', backLabel: 'Settings' }) + '<div class="pad">';
  h += `<div class="card"><label class="field"><span>Name</span><input class="input" value="${esc(day.name)}" data-bind="day-name" data-day="${day.id}" autocomplete="off"></label></div>`;
  h += '<h2 class="section">Exercises (in order)</h2><div class="list">';
  h += day.exerciseIds.map((xid, i) => exEditRow(DATA.exercises[xid], {
    del: 'day-ex-rm', delLabel: 'Remove from this day',
    extra: `<button class="icon-btn" data-action="day-ex-move" data-ex="${xid}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="icon-btn" data-action="day-ex-move" data-ex="${xid}" data-dir="1" ${i === day.exerciseIds.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>`
  })).join('');
  h += `<button class="row add-row" data-action="picker" data-mode="day" data-day="${day.id}"><span class="accent">+ Add exercise</span></button></div>
    <p class="muted small">Renaming keeps all history. Removing an exercise from this day doesn’t delete its history.</p>
    <button class="btn ghost danger-text block" data-action="day-del" data-day="${day.id}">Delete workout day</button>`;
  return h + '</div>';
}

function viewAllExercises() {
  let h = header({ title: 'All exercises', back: '/settings', backLabel: 'Settings' }) + '<div class="pad">';
  const exs = Object.values(DATA.exercises).sort(byName);
  h += exs.length
    ? '<div class="list">' + exs.map(ex => exEditRow(ex, { del: 'ex-del', delLabel: 'Delete exercise' })).join('') + '</div>'
    : '<div class="card"><p class="muted">No exercises yet. Add them to a workout day.</p></div>';
  return h + '<p class="muted small">Renaming keeps all history.</p></div>';
}

// ---------- Exercise picker (session / day template / editing a past session) ----------
function pickerTargetIds() {
  const p = UI.picker;
  if (p.mode === 'session') return DATA.active.order;
  if (p.mode === 'day') return getDay(p.dayId).exerciseIds;
  return UI.editing.entries.map(e => e.exerciseId);
}
function openPicker(mode, dayId) {
  UI.picker = { mode, dayId, q: '' };
  const tplDay = mode === 'session' ? getDay(DATA.active.dayId) : null;
  openSheet(`<div class="sheet-head"><h3>Add exercise</h3><button class="icon-btn" data-action="sheet-close" aria-label="Close">✕</button></div>
    <input id="pk-q" class="input" placeholder="Search, or type a new name" data-bind="pk-q" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    ${tplDay ? `<label class="check-line"><input type="checkbox" id="pk-tpl"> Also add to ${esc(tplDay.name)} template</label>` : ''}
    <div id="pk-list" class="list pk-list"></div>`);
  renderPickerList();
}
function renderPickerList() {
  const q = UI.picker.q.trim(), ql = q.toLowerCase();
  const taken = pickerTargetIds();
  const all = Object.values(DATA.exercises);
  const matches = all.filter(e => !taken.includes(e.id) && (!ql || e.name.toLowerCase().includes(ql))).sort(byName);
  const exact = all.find(e => e.name.trim().toLowerCase() === ql);
  let h = '';
  if (q && !exact) h += `<button class="row" data-action="pk-new"><div class="row-main"><div class="row-title accent">+ Create “${esc(q)}”</div><div class="row-sub">New exercise · reps ${DEFAULT_MIN}–${DEFAULT_MAX}</div></div></button>`;
  h += matches.map(e => `<button class="row" data-action="pk-pick" data-ex="${e.id}"><div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub">Reps ${e.repMin}–${e.repMax}</div></div></button>`).join('');
  if (exact && taken.includes(exact.id)) h += `<p class="muted small center">“${esc(exact.name)}” is already in the list.</p>`;
  else if (!h) h = '<p class="muted small center">Type a name to create a new exercise.</p>';
  $('#pk-list').innerHTML = h;
}
function pickExercise(ex) {
  const p = UI.picker;
  if (p.mode === 'session') {
    const a = DATA.active;
    if (!a.order.includes(ex.id)) a.order.push(ex.id);
    const day = getDay(a.dayId);
    if (day && $('#pk-tpl')?.checked && !day.exerciseIds.includes(ex.id)) day.exerciseIds.push(ex.id);
    saveData();
    closeSheet();
    go('/session/' + ex.id);
  } else if (p.mode === 'day') {
    const day = getDay(p.dayId);
    if (!day.exerciseIds.includes(ex.id)) day.exerciseIds.push(ex.id);
    saveData();
    closeSheet();
    render();
  } else {
    UI.editing.entries.push({ exerciseId: ex.id, sets: [{ w: '', r: ex.repMin }] });
    saveData(); // persists a newly created exercise; the session edit itself saves on "Save changes"
    closeSheet();
    render();
  }
}

// ---------- sheet / dialogs / toast ----------
function openSheet(html) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet">${html}</div>`;
  w.hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; UI.picker = null; }

function ask(title, msg, buttons) {
  return new Promise(res => {
    UI.askResolve = res;
    UI.askButtons = buttons;
    const w = $('#dialog');
    w.innerHTML = `<div class="dialog" role="alertdialog" aria-labelledby="dlg-t"><h3 id="dlg-t">${esc(title)}</h3><p>${msg}</p>
      ${buttons.map((b, i) => `<button class="btn block ${b.cls || ''}" data-action="ask" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
    w.hidden = false;
  });
}
function answer(i) {
  const w = $('#dialog');
  w.hidden = true;
  w.innerHTML = '';
  const res = UI.askResolve;
  UI.askResolve = null;
  if (res) res(i == null ? null : UI.askButtons[i].v);
}

let toastTimer;
function toast(msg, cls) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (cls ? ' ' + cls : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- backup ----------
async function exportData() {
  const stamp = todayStr();
  const json = JSON.stringify({ app: 'gym-log', version: APP_VERSION, exportedAt: new Date().toISOString(), data: DATA }, null, 1);
  const name = `gym-log-backup-${stamp}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let ok = false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); ok = true; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!ok) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  DATA.settings.lastExport = stamp;
  saveData();
  render();
}

async function importFile(file) {
  let next;
  try {
    const parsed = JSON.parse(await file.text());
    next = normalizeData(parsed && parsed.data ? parsed.data : parsed);
  } catch (e) {
    return ask('Couldn’t read that file', 'Pick a JSON backup exported from this app.', [{ label: 'OK', v: null, cls: 'primary' }]);
  }
  const when = next.sessions.length ? ` (latest session ${esc(fmtDate(next.sessions.slice().sort(sessionOrder).pop().date, true))})` : '';
  const v = await ask('Replace all data?', `The backup has ${next.sessions.length} sessions and ${Object.keys(next.exercises).length} exercises${when}. Everything currently on this phone will be replaced.`, [
    { label: 'Replace with backup', v: 'ok', cls: 'danger' }, { label: 'Cancel', v: null, cls: 'ghost' }
  ]);
  if (!v) return;
  next.settings.theme = DATA.settings.theme;
  DATA = next;
  saveData();
  applyTheme();
  render();
  toast('Backup restored');
}

function applyTheme() {
  const t = DATA.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// ---------- router ----------
function render() {
  const route = location.hash.slice(1) || '/';
  const [a, b, c] = route.split('/').filter(Boolean);
  if (route !== UI.route) {
    if (UI.route) window.scrollTo(0, 0);
    if (!(a === 'history' && UI.editing && UI.editing.id === b)) UI.editing = null;
    UI.route = route;
  }
  let html = '', tab = a || 'today', after = null;
  if (!a) html = viewHome();
  else if (a === 'session') {
    if (!DATA.active) return go('/');
    html = b ? viewExercise(b) : viewSession();
    tab = 'today';
  } else if (a === 'history') html = b ? viewSessionDetail(b) : viewHistory();
  else if (a === 'progress') { html = b ? viewProgressDetail(b) : viewProgress(); if (b) after = () => drawChart(b); }
  else if (a === 'settings') html = b === 'day' ? viewDayEdit(c) : b === 'exercises' ? viewAllExercises() : viewSettings();
  else return go('/');
  if (!html) return;
  $('#view').innerHTML = html;
  document.querySelectorAll('.tabs button').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  if (after) after();
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  switch (d.action) {
    case 'nav': go(d.to); break;
    case 'tab': go(d.tab === 'today' ? (DATA.active ? '/session' : '/') : '/' + d.tab); break;
    case 'start': onStart(d.day); break;
    case 'discard': {
      const v = await ask('Discard session?', 'Nothing from this session will be saved.', [{ label: 'Discard', v: 'd', cls: 'danger' }, { label: 'Cancel', v: null, cls: 'ghost' }]);
      if (v) { DATA.active = null; saveData(); go('/'); }
      break;
    }
    case 'finish': finishSession(); break;
    case 'ex-done': {
      const en = DATA.active.entries[d.ex];
      const wasDone = en.done;
      en.done = true;
      saveData();
      go('/session');
      if (!wasDone && beatLastTime(d.ex)) toast('✓ Beat last time', 'win');
      break;
    }
    case 'ex-undone': DATA.active.entries[d.ex].done = false; saveData(); render(); break;
    case 'rep-step': {
      const sets = getSets(d.scope, d.ex);
      const s = sets[+d.i];
      const ex = DATA.exercises[d.ex];
      const cur = parseInt(s.r, 10);
      s.r = Number.isFinite(cur) ? Math.max(0, cur + +d.delta) : ex.repMin;
      persist(d.scope);
      const row = el.closest('.set-row');
      row.querySelector('.r-in').value = s.r;
      row.querySelector('.reps').classList.toggle('over', s.r > ex.repMax);
      updateOverHint(d.scope, d.ex);
      break;
    }
    case 'set-add': {
      const sets = getSets(d.scope, d.ex);
      const prev = sets[sets.length - 1];
      sets.push(prev ? { ...prev } : { w: '', r: DATA.exercises[d.ex].repMin });
      persist(d.scope);
      render();
      break;
    }
    case 'set-del': getSets(d.scope, d.ex).splice(+d.i, 1); persist(d.scope); render(); break;
    case 'picker': openPicker(d.mode, d.day); break;
    case 'pk-pick': pickExercise(DATA.exercises[d.ex]); break;
    case 'pk-new': if (UI.picker.q.trim()) pickExercise(createExercise(UI.picker.q)); break;
    case 'sheet-close': closeSheet(); break;
    case 'ask': answer(+d.i); break;
    case 'draft-start': startEdit(d.id); break;
    case 'draft-cancel': UI.editing = null; render(); break;
    case 'draft-save': saveEdit(); break;
    case 'draft-rm': UI.editing.entries = UI.editing.entries.filter(x => x.exerciseId !== d.ex); render(); break;
    case 'session-del': {
      const v = await ask('Delete session?', 'This can’t be undone.', [{ label: 'Delete', v: 'd', cls: 'danger' }, { label: 'Cancel', v: null, cls: 'ghost' }]);
      if (v) { DATA.sessions = DATA.sessions.filter(s => s.id !== d.id); saveData(); go('/history'); toast('Session deleted'); }
      break;
    }
    case 'day-add': {
      const day = { id: uid('d'), name: 'New day', exerciseIds: [] };
      DATA.days.push(day);
      saveData();
      go('/settings/day/' + day.id);
      setTimeout(() => { const i = $('[data-bind="day-name"]'); if (i) { i.focus(); i.select(); } }, 50);
      break;
    }
    case 'day-del': {
      const day = getDay(d.day);
      const v = await ask(`Delete “${day.name}”?`, 'Past sessions stay in your history. Weekdays using it become Rest.', [{ label: 'Delete', v: 'd', cls: 'danger' }, { label: 'Cancel', v: null, cls: 'ghost' }]);
      if (!v) break;
      DATA.days = DATA.days.filter(x => x.id !== d.day);
      for (let i = 0; i < 7; i++) if (DATA.schedule[i] === d.day) DATA.schedule[i] = null;
      saveData();
      go('/settings');
      break;
    }
    case 'day-ex-rm': {
      const day = getDay(location.hash.split('/').pop());
      day.exerciseIds = day.exerciseIds.filter(x => x !== d.ex);
      saveData();
      render();
      break;
    }
    case 'day-ex-move': {
      const day = getDay(location.hash.split('/').pop());
      const ids = day.exerciseIds, i = ids.indexOf(d.ex), j = i + +d.dir;
      if (j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      saveData();
      render();
      break;
    }
    case 'ex-del': {
      const ex = DATA.exercises[d.ex];
      const n = historyFor(ex.id).length;
      const v = await ask(`Delete “${ex.name}”?`, n ? `This also deletes it from ${n} logged session${n === 1 ? '' : 's'}. This can’t be undone.` : 'It will be removed from all workout days.', [{ label: 'Delete', v: 'd', cls: 'danger' }, { label: 'Cancel', v: null, cls: 'ghost' }]);
      if (!v) break;
      delete DATA.exercises[ex.id];
      DATA.days.forEach(day => { day.exerciseIds = day.exerciseIds.filter(x => x !== ex.id); });
      DATA.sessions.forEach(s => { s.entries = s.entries.filter(e => e.exerciseId !== ex.id); });
      if (DATA.active) { DATA.active.order = DATA.active.order.filter(x => x !== ex.id); delete DATA.active.entries[ex.id]; }
      saveData();
      render();
      break;
    }
    case 'theme': DATA.settings.theme = d.v; saveData(); applyTheme(); render(); break;
    case 'export': exportData(); break;
    case 'import': $('#import-file').click(); break;
    case 'update': applyUpdate(); break;
  }
});

function updateOverHint(scope, exId) {
  if (scope !== 'active') return;
  const h = $('#over-hint');
  if (h) h.hidden = !hitTop(DATA.exercises[exId], getSets(scope, exId));
  updateTarget(exId);
}

document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.bind === 'set-w') {
    getSets(d.scope, d.ex)[+d.i].w = el.value.replace(',', '.').replace(/[^0-9.]/g, '');
    persist(d.scope);
    updateOverHint(d.scope, d.ex);
  } else if (d.bind === 'set-r') {
    const v = el.value.replace(/\D/g, '').slice(0, 3);
    if (v !== el.value) el.value = v;
    getSets(d.scope, d.ex)[+d.i].r = v === '' ? '' : parseInt(v, 10);
    persist(d.scope);
    el.closest('.reps').classList.toggle('over', parseInt(v, 10) > DATA.exercises[d.ex].repMax);
    updateOverHint(d.scope, d.ex);
  } else if (d.bind === 'pk-q') {
    UI.picker.q = el.value;
    renderPickerList();
  }
});

document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  switch (d.bind) {
    case 'sched': DATA.schedule[d.wd] = el.value || null; saveData(); break;
    case 'ex-name': {
      const v = el.value.trim();
      if (v) DATA.exercises[d.ex].name = v; else el.value = DATA.exercises[d.ex].name;
      saveData();
      break;
    }
    case 'ex-min':
    case 'ex-max': {
      const ex = DATA.exercises[d.ex];
      const n = Math.min(100, Math.max(1, parseInt(el.value, 10) || (d.bind === 'ex-min' ? DEFAULT_MIN : DEFAULT_MAX)));
      if (d.bind === 'ex-min') { ex.repMin = n; if (ex.repMax < n) ex.repMax = n; }
      else { ex.repMax = n; if (ex.repMin > n) ex.repMin = n; }
      saveData();
      render();
      break;
    }
    case 'day-name': {
      const v = el.value.trim();
      const day = getDay(d.day);
      if (v) day.name = v; else el.value = day.name;
      saveData();
      $('header.top h1').textContent = day.name;
      break;
    }
    case 'draft-date': if (el.value) UI.editing.date = el.value; render(); break;
  }
});

// Enter / "Done" on the keyboard just closes it
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) {
    if (e.target.dataset.bind === 'pk-q') {
      const first = $('#pk-list [data-action]');
      if (first) first.click();
    } else e.target.blur();
  }
});

$('#import-file').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) importFile(f);
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ---------- boot ----------
loadData();
applyTheme();
window.addEventListener('hashchange', render);
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- updates ----------
// Tapping "Update available" must always end in a reload, even if iOS drops an event along the way.
let reloading = false, updateRequested = false;
const reloadOnce = () => { if (!reloading) { reloading = true; location.reload(); } };
function applyUpdate() {
  const btn = $('#update');
  btn.textContent = 'Updating…';
  btn.disabled = true;
  updateRequested = true;
  if (!('serviceWorker' in navigator)) return reloadOnce();
  navigator.serviceWorker.getRegistration().then(reg => {
    // Ask the registration fresh: the worker remembered when the pill appeared may be stale.
    const w = (reg && reg.waiting) || window.__waitingSW;
    if (!w || w.state === 'redundant' || w.state === 'activated') return reloadOnce();
    w.addEventListener('statechange', () => { if (w.state === 'activated') reloadOnce(); });
    w.postMessage('skipWaiting');
    setTimeout(reloadOnce, 2500); // fallback if no event arrives
  }).catch(reloadOnce);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const notify = w => { window.__waitingSW = w; $('#update').hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // Only reload when an update replaces an existing worker (or the user tapped Update), not on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController || updateRequested) reloadOnce(); });
}
