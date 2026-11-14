/* Pure validation and timer logic; no networking or storage side effects. */
export const KEY = 'dailylog.life.v3';
export const CATEGORIES = ['專業進修', '鋼琴', '人工智慧探索', '陪伴家人', '休息', '其他'];
export const REFLECTIONS = ['比較有掌控感', '差不多', '比較困難'];
export const blank = () => ({ version: 3, days: {}, tasks: [], sessions: [], timer: null });
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = () => { throw new Error('備份格式不符，未更動現有資料。'); };
function str(x, max = 2000) { if (typeof x !== 'string' || x.length > max) fail(); return x; }
function num(x, max = 31536000000) { if (!Number.isFinite(x) || x < 0 || x > max) fail(); return x; }
export function validDay(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T12:00:00`);
  return !isNaN(d) && dayKey(d) === x;
}
export function validMonth(x) { return typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x); }
function category(x) { if (!CATEGORIES.includes(x)) fail(); return x; }
function id(x) { return str(x, 100) || fail(); }
function unique(items) { if (new Set(items.map(x => x.id)).size !== items.length) fail(); return items; }
function validateTimer(t) {
  if (t === null) return null;
  if (!object(t) || !['running', 'paused', 'ready'].includes(t.state) || !validDay(t.day)) fail();
  const r = { id: id(t.id), day: t.day, category: category(t.category), goal: str(t.goal), state: t.state,
    totalMs: num(t.totalMs), remainingMs: num(t.remainingMs), elapsedMs: num(t.elapsedMs), startedAt: t.startedAt };
  if (!r.totalMs || r.remainingMs > r.totalMs || Math.abs(r.elapsedMs + r.remainingMs - r.totalMs) > 1) fail();
  if (r.state === 'running') { num(r.startedAt, 8640000000000000); if (!r.remainingMs) fail(); }
  else if (r.startedAt !== null || (r.state === 'ready' && r.remainingMs !== 0) || (r.state === 'paused' && !r.remainingMs)) fail();
  return r;
}
export function validate(x) {
  if (!object(x) || x.version !== 3 || !object(x.days) || !Array.isArray(x.tasks) || !Array.isArray(x.sessions) || x.tasks.length > 5000 || x.sessions.length > 50000 || Object.keys(x.days).length > 20000) fail();
  const out = blank();
  for (const [date, r] of Object.entries(x.days)) {
    if (!validDay(date) || !object(r)) fail();
    const v = {};
    if ('category' in r) v.category = category(r.category);
    if ('goal' in r) v.goal = str(r.goal);
    if ('moment' in r) v.moment = str(r.moment, 100);
    if ('minutes' in r) { if (![5, 10, 15, 30].includes(r.minutes)) fail(); v.minutes = r.minutes; }
    if ('reflection' in r) { if (!REFLECTIONS.includes(r.reflection)) fail(); v.reflection = r.reflection; }
    if ('note' in r) v.note = str(r.note);
    if ('didSession' in r) { if (typeof r.didSession !== 'boolean') fail(); v.didSession = r.didSession; }
    out.days[date] = v;
  }
  out.tasks = unique(x.tasks.map(t => {
    if (!object(t) || typeof t.done !== 'boolean' || !['none', 'month', 'date'].includes(t.precision) || !str(t.name, 200).trim()) fail();
    if (t.precision === 'none' ? t.when !== '' : t.precision === 'date' ? !validDay(t.when) : !validMonth(t.when)) fail();
    return { id: id(t.id), name: t.name.trim(), precision: t.precision, when: t.when, next: str(t.next), done: t.done };
  }));
  out.sessions = unique(x.sessions.map(s => {
    if (!object(s) || !validDay(s.day) || typeof s.finishedAt !== 'string' || !Number.isFinite(Date.parse(s.finishedAt))) fail();
    return { id: id(s.id), day: s.day, category: category(s.category), goal: str(s.goal), elapsedMs: num(s.elapsedMs), finishedAt: s.finishedAt };
  }));
  out.timer = validateTimer(x.timer);
  if (out.timer && out.sessions.some(s => s.id === out.timer.id)) fail();
  return out;
}
export function parseBackup(raw) {
  const x = JSON.parse(raw);
  if (!object(x) || x.app !== 'dailylog-life' || x.backupVersion !== 1) fail();
  return validate(x.data);
}
export function settle(timer, now) {
  if (!timer || timer.state !== 'running') return timer;
  const consumed = Math.min(timer.remainingMs, Math.max(0, now - timer.startedAt));
  timer.remainingMs -= consumed;
  timer.elapsedMs += consumed;
  timer.startedAt = now;
  if (!timer.remainingMs) { timer.state = 'ready'; timer.startedAt = null; }
  return timer;
}
export function pause(timer, now) {
  settle(timer, now);
  if (timer.state === 'running') { timer.state = 'paused'; timer.startedAt = null; }
}
export function resume(timer, now) {
  if (timer.state === 'paused') { timer.state = 'running'; timer.startedAt = now; }
}
export function extend(timer, now) {
  settle(timer, now); timer.totalMs += 900000; timer.remainingMs += 900000;
  timer.state = 'running'; timer.startedAt = now;
}
// Optional conversion from the supplied v2 reference. Original source is never altered.
export function convertV2(x) {
  if (!object(x) || !object(x.days) || !Array.isArray(x.tasks) || !Array.isArray(x.sessions)) fail();
  const out = blank();
  const cat = s => {
    if (typeof s !== 'string') return '其他';
    return CATEGORIES.find(c => s.includes(c)) || (s.includes('人工智慧') ? '人工智慧探索' : '其他');
  };
  for (const [date, r] of Object.entries(x.days)) {
    if (!validDay(date) || !object(r)) fail();
    const v = {};
    if (r.category) v.category = cat(r.category);
    if (typeof r.goal === 'string') v.goal = r.goal;
    if (typeof r.moment === 'string') v.moment = r.moment;
    if ([5, 10, 15, 30].includes(r.minutes)) v.minutes = r.minutes;
    if (r.reflection) v.reflection = r.reflection === '比較有壓力' ? '比較困難' : r.reflection;
    if (typeof r.note === 'string') v.note = r.note;
    if (typeof r.didSession === 'boolean') v.didSession = r.didSession;
    out.days[date] = v;
  }
  out.tasks = x.tasks.map(t => ({ id: String(t.id), name: t.name, precision: t.date ? 'date' : t.month ? 'month' : 'none', when: t.date || t.month || '', next: t.next || '', done: t.done }));
  // Old elapsedMinutes included pauses. Keep original sessions only in the untouched v2 source.
  return validate(out);
}
