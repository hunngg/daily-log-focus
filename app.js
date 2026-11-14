import { KEY, CATEGORIES, REFLECTIONS, blank, dayKey, validate, parseBackup, convertV2, validDay, validMonth, settle, pause, resume, extend } from './core.js';
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let data = blank(), lastRaw = null, protectedSource = false, stale = false;
let selected = '', minutes = 10, reflection = '', currentDay = dayKey(), audio = null;
const legacyKeys = ['dailylog.v1', 'dailylog.timer.v1', 'life-focus.v2'];
function status(message) { $('status').textContent = message; $('status').classList.remove('hidden'); }
function storageError() { $('storageError').classList.remove('hidden'); }
try {
  lastRaw = localStorage.getItem(KEY);
  if (lastRaw !== null) data = validate(JSON.parse(lastRaw));
} catch { protectedSource = true; $('loadError').classList.remove('hidden'); }
function persist() {
  if (protectedSource || stale) { storageError(); return false; }
  try {
    if (localStorage.getItem(KEY) !== lastRaw) {
      stale = true; status('另一個分頁已更新資料。請先匯出此頁備份，再重新載入；此頁已停止寫入。'); return false;
    }
    const raw = JSON.stringify(validate(data));
    localStorage.setItem(KEY, raw); lastRaw = raw;
    $('storageError').classList.add('hidden'); return true;
  } catch { storageError(); return false; }
}
function patchDay(patch) { data.days[dayKey()] = { ...data.days[dayKey()], ...patch }; }
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, action) { const b = el('button', text); b.type = 'button'; b.onclick = action; return b; }
function renderChoices() {
  $('categories').replaceChildren(...CATEGORIES.map(name => {
    const b = button(name, () => { selected = name; savePlan(false); renderChoices(); });
    b.className = `choice${selected === name ? ' active' : ''}`;
    b.setAttribute('aria-pressed', String(name === selected)); b.disabled = !!data.timer; return b;
  }));
  $('durations').replaceChildren(...[5, 10, 15, 30].map(n => {
    const b = button(`${n} 分鐘`, () => { minutes = n; if (selected) savePlan(false); renderChoices(); });
    b.classList.toggle('active', n === minutes); b.setAttribute('aria-pressed', String(n === minutes)); b.disabled = !!data.timer; return b;
  }));
  $('start').disabled = !!data.timer;
  $('start').textContent = data.timer ? '已有一段進行中，請先繼續或結束' : '開始這一小段';
  for (const id of ['goal', 'moment', 'savePlan']) $(id).disabled = !!data.timer;
}
function savePlan(announce = true) {
  if (!selected) { if (announce) status('先選擇一個活動即可開始。'); return false; }
  patchDay({ category: selected, minutes, goal: $('goal').value.trim(), moment: $('moment').value.trim() });
  const saved = persist(); renderDays(); $('planSaved').textContent = saved ? '今天的安排已保存在此瀏覽器。' : '目前安排尚未成功保存，請先匯出。';
  if (announce && saved) status('已記下今天的安排。'); return true;
}
function renderReview() {
  $('reflections').replaceChildren(...REFLECTIONS.map(value => {
    const b = button(value, () => { reflection = value; renderReview(); });
    b.classList.toggle('active', reflection === value); b.setAttribute('aria-pressed', String(reflection === value)); return b;
  }));
}
function loadDay() {
  currentDay = dayKey(); const r = data.days[currentDay] || {};
  selected = r.category || ''; minutes = r.minutes || 10; reflection = r.reflection || '';
  $('dateLabel').textContent = currentDay; $('dateLabel').dateTime = currentDay;
  $('goal').value = r.goal || ''; $('moment').value = r.moment || ''; $('note').value = r.note || '';
  $('planSaved').textContent = r.category ? '已載入今天的安排。' : '';
  renderChoices(); renderReview(); renderDays();
}
function renderDays() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const date = dayKey(d), r = data.days[date];
    const recorded = r && (r.category || r.reflection || r.note || r.didSession);
    const box = el('div', `${d.getMonth() + 1}/${d.getDate()}`, `day${recorded ? ' recorded' : ''}`);
    box.append(el('span', recorded ? '有紀錄' : '—'));
    box.title = `${date}：${recorded ? [r.category, r.reflection, r.didSession ? '有投入活動' : ''].filter(Boolean).join('、') : '沒有紀錄'} `;
    box.setAttribute('aria-label', box.title); days.push(box);
  }
  $('days').replaceChildren(...days);
}
function taskWhen(t) {
  if (t.precision === 'month') return `${t.when.replace('-', ' 年 ')} 月（日期未定）`;
  if (t.precision === 'none') return '日期未定';
  return `${t.when}${!t.done && t.when < dayKey() ? ' · 已過預計日期' : ''}`;
}
function taskNode(t) {
  const box = el('div', undefined, `task${t.done ? ' done' : ''}`);
  box.dataset.taskId = t.id; box.append(el('strong', t.name), el('p', taskWhen(t), 'small muted'));
  if (t.next) box.append(el('p', `下一步：${t.next}`, 'small'));
  const actions = el('div', undefined, 'actions');
  actions.append(button(t.done ? '重新開啟' : '標記完成', () => { t.done = !t.done; persist(); renderTasks(); }));
  if (!t.done) actions.append(button('放進今天', () => {
    if (data.timer) { status('請先結束目前這一段，再安排下一步。'); return; }
    // Task category is intentionally left for the user to choose.
    selected = ''; $('goal').value = t.next || t.name; $('planDetails').open = true; renderChoices();
    status('已帶入下一步，請選擇適合的活動後開始。'); $('planPanel').scrollIntoView({ behavior: 'smooth' });
  }));
  actions.append(button('刪除', () => { if (confirm(`刪除「${t.name}」？`)) { data.tasks = data.tasks.filter(x => x.id !== t.id); persist(); renderTasks(); } }));
  box.append(actions); return box;
}
function renderTasks() {
  const sort = (a, b) => (a.when || '9999-99').localeCompare(b.when || '9999-99');
  const open = data.tasks.filter(t => !t.done).sort(sort);
  $('upcoming').replaceChildren(...(open.length ? open.slice(0, 2).map(taskNode) : [el('p', '目前沒有待辦的重要任務。', 'small muted')]));
  $('taskSummary').textContent = `完整任務清單（${data.tasks.length} 件）`;
  $('taskList').replaceChildren(...[...open, ...data.tasks.filter(t => t.done).sort(sort)].map(taskNode));
}
function unlockAudio() {
  if (!$('sound').checked) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { /* Visual prompt remains available. */ }
}
function chime() {
  if (document.hidden || !$('sound').checked || !audio || audio.state !== 'running') return;
  try {
    const o = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    o.type = 'sine'; o.frequency.value = 660;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.07, now + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    o.connect(gain); gain.connect(audio.destination); o.start(now); o.stop(now + 0.75);
    o.onended = () => { o.disconnect(); gain.disconnect(); };
  } catch { /* Never block switching on audio availability. */ }
}
function renderTimer() {
  const t = data.timer; $('session').classList.toggle('hidden', !t);
  if (!t) { $('session').classList.remove('ready'); return; }
  const left = Math.ceil(t.remainingMs / 1000);
  $('sessionTitle').textContent = t.category; $('sessionGoal').textContent = t.goal || '為自己留一段時間';
  $('clock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('progress').value = 100 * t.elapsedMs / t.totalMs;
  const ready = t.state === 'ready';
  $('session').classList.toggle('ready', ready); $('timeUp').classList.toggle('hidden', !ready);
  $('pause').classList.toggle('hidden', ready); $('pause').textContent = t.state === 'paused' ? '繼續' : '暫停';
  $('timerState').textContent = ready ? '不必急著開始下一件事。' : t.state === 'paused' ? '已暫停，這段等待不計入投入時間。' : '時間到，再有意識地選擇繼續或切換。';
}
function tick(quiet = false) {
  if (stale) return;
  if (currentDay !== dayKey()) { loadDay(); renderTasks(); }
  const before = data.timer?.state;
  if (data.timer) settle(data.timer, Date.now());
  renderTimer();
  if (before === 'running' && data.timer?.state === 'ready') {
    persist();
    if (!quiet) {
      chime();
      if (!document.hidden && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) $('timeUp').focus({ preventScroll: false });
    }
  }
}
$('start').onclick = () => {
  if (data.timer || !savePlan(false)) { if (!selected) status('先選擇一個活動即可開始。'); return; }
  unlockAudio(); const now = Date.now();
  data.timer = { id: uid(), day: dayKey(), category: selected, goal: $('goal').value.trim(), state: 'running', totalMs: minutes * 60000, remainingMs: minutes * 60000, elapsedMs: 0, startedAt: now };
  persist(); renderChoices(); renderTimer(); $('session').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('pause').onclick = () => { const t = data.timer; if (!t) return; if (t.state === 'paused') { unlockAudio(); resume(t, Date.now()); } else pause(t, Date.now()); persist(); renderTimer(); };
$('extend').onclick = () => { if (!data.timer) return; unlockAudio(); extend(data.timer, Date.now()); persist(); renderTimer(); status('已重新選擇再繼續 15 分鐘。'); };
$('finish').onclick = () => {
  if (!data.timer || stale) return;
  const t = settle(data.timer, Date.now());
  if (!data.sessions.some(s => s.id === t.id)) data.sessions.push({ id: t.id, day: dayKey(), category: t.category, goal: t.goal, elapsedMs: t.elapsedMs, finishedAt: new Date().toISOString() });
  patchDay({ didSession: true }); data.timer = null;
  const saved = persist(); renderTimer(); renderChoices(); renderDays();
  status(saved ? '已記錄這一段。可以休息，或選擇下一件事。' : '這一段尚未成功保存，請先匯出備份。');
};
$('savePlan').onclick = () => savePlan();
for (const id of ['goal', 'moment']) $(id).addEventListener('change', () => { if (selected && !data.timer) savePlan(false); });
$('saveReview').onclick = () => {
  if (!reflection && !$('note').value.trim()) { status('選一個感受，或留一句話即可。'); return; }
  patchDay({ ...(reflection ? { reflection } : {}), note: $('note').value.trim() });
  const saved = persist(); renderDays(); if (saved) status('已保存今天的簡短回顧。');
};
$('precision').onchange = () => {
  const precision = $('precision').value;
  $('dateField').classList.toggle('hidden', precision !== 'date'); $('monthField').classList.toggle('hidden', precision !== 'month');
  $('taskDate').required = precision === 'date'; $('taskMonth').required = precision === 'month';
  $('taskDate').disabled = precision !== 'date'; $('taskMonth').disabled = precision !== 'month';
};
$('precision').onchange();
$('taskForm').onsubmit = event => {
  event.preventDefault(); const name = $('taskName').value.trim(), precision = $('precision').value;
  const when = precision === 'date' ? $('taskDate').value : precision === 'month' ? $('taskMonth').value : '';
  if (!name || (precision === 'date' && !validDay(when)) || (precision === 'month' && !validMonth(when))) { status('請檢查名稱與日期／月份格式。'); return; }
  data.tasks.push({ id: uid(), name, precision, when, next: $('taskNext').value.trim(), done: false });
  const saved = persist(); renderTasks(); $('taskForm').reset(); $('precision').onchange(); $('taskDetails').open = false;
  if (saved) status('任務已保存。');
};
function legacyRaw() {
  const result = {};
  for (const key of [...legacyKeys, `${KEY}.before-import`]) { try { const raw = localStorage.getItem(key); if (raw !== null) result[key] = raw; } catch { /* Indicate storage error separately. */ } }
  return result;
}
function download(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = el('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').onclick = () => {
  if (data.timer) settle(data.timer, Date.now());
  download({ app: 'dailylog-life', backupVersion: 1, exportedAt: new Date().toISOString(), data, legacyRaw: legacyRaw(), ...(protectedSource ? { unreadableCurrentRaw: lastRaw } : {}) }, `Daily_Log_${dayKey()}.json`);
  status('已建立備份檔，請確認已下載並妥善保存。');
};
function replaceData(next) {
  try {
    const current = localStorage.getItem(KEY);
    if (current !== lastRaw) { status('資料已由其他分頁變更，請重新載入後再匯入。'); return false; }
    // Write recovery copy first. If quota is exhausted, leave current data untouched.
    if (current !== null) localStorage.setItem(`${KEY}.before-import`, current);
    const raw = JSON.stringify(validate(next)); localStorage.setItem(KEY, raw);
    lastRaw = raw; data = next; protectedSource = false; stale = false;
    $('loadError').classList.add('hidden'); $('storageError').classList.add('hidden');
    settle(data.timer, Date.now()); loadDay(); renderTasks(); renderTimer(); renderLegacy();
    return true;
  } catch { storageError(); status('匯入未完成，原有資料未取代。請先確認儲存空間。'); return false; }
}
$('importFile').onchange = async () => {
  const file = $('importFile').files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('備份超過 5 MB，未匯入。');
    const next = parseBackup(await file.text());
    if (!confirm(`已驗證備份：${Object.keys(next.days).length} 天、${next.tasks.length} 件任務、${next.sessions.length} 段活動。取代本版資料？匯入前會保留本版原始資料，舊版資料不受影響。`)) return;
    if (replaceData(next)) status('已匯入備份。原本本版資料保存在匯入前備份中，可隨匯出檔取回。');
  } catch (error) { status(error instanceof SyntaxError ? '不是有效的 JSON 備份，未更動現有資料。' : error.message); }
  finally { $('importFile').value = ''; }
};
function renderLegacy() {
  const raw = legacyRaw();
  $('legacyInfo').textContent = legacyKeys.some(k => k in raw) ? '偵測到舊版資料，保留原樣；匯出檔也會附上原始備份。' : '舊版使用獨立資料格式，本版不會覆寫它。';
  $('legacySection').classList.toggle('hidden', !raw['life-focus.v2']);
}
$('copyLegacy').onclick = () => {
  try {
    const next = convertV2(JSON.parse(localStorage.getItem('life-focus.v2')));
    if (confirm('複製第二版的安排、回顧與任務，取代本版資料？本版先保留一份原始備份，第二版原始資料不變。')) {
      if (replaceData(next)) status('已複製第二版資料；舊計時明細保留於原版，沒有轉換。');
    }
  } catch { status('第二版資料無法安全轉換，原始資料已保留，請先匯出備份。'); }
};
window.addEventListener('storage', event => {
  if (event.key === KEY && event.newValue !== lastRaw) { stale = true; status('另一個分頁已更新資料。請先匯出此頁備份，再重新載入；此頁已停止寫入。'); }
});
window.addEventListener('pagehide', () => { if (!stale && data.timer) { settle(data.timer, Date.now()); persist(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (data.timer && !stale) { settle(data.timer, Date.now()); persist(); } } else tick(); });
loadDay(); renderTasks(); renderLegacy(); tick(true); setInterval(tick, 1000);
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  const alreadyControlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(registration => {
    const ready = () => { if (registration.waiting && navigator.serviceWorker.controller) $('updateNotice').classList.remove('hidden'); };
    ready(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', ready));
    $('applyUpdate').onclick = () => { if (data.timer) { settle(data.timer, Date.now()); if (!persist()) return; } registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' }); };
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (alreadyControlled && !reloading) { reloading = true; location.reload(); } });
  }).catch(() => status('離線快取尚未就緒，請連線重新載入後再試。'));
}
