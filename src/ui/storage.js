// Persistência segura: localStorage pode lançar (file://, janela privada). Tudo com try/catch + cópia em memória.
const NS = 'davi-the-driver:v1:';
const mem = Object.create(null);

function read(key) {
  try { const v = window.localStorage.getItem(NS + key); if (v != null) { mem[key] = v; return v; } } catch (e) { /* sem storage */ }
  return mem[key] != null ? mem[key] : null;
}
function write(key, val) {
  mem[key] = val;
  try { window.localStorage.setItem(NS + key, val); return true; } catch (e) { return false; }
}
function readJSON(key, fallback) {
  const raw = read(key);
  if (raw == null) return fallback;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; }
}

// ---- opções -------------------------------------------------------------
/** Carrega as opções salvas por cima de `settings` (objeto de state.settings, mutado no lugar). */
export function loadSettings(settings) {
  const s = readJSON('settings', {});
  if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) settings.volume = s.volume;
  if (typeof s.muted === 'boolean') settings.muted = s.muted;
  if (typeof s.retro === 'boolean') settings.retro = s.retro;
  if (typeof s.profanity === 'boolean') settings.profanity = s.profanity;
  if (s.quality === 'leve') settings.quality = 'leve'; // 'hd' ainda não existe
  return settings;
}
export function saveSettings(settings) {
  write('settings', JSON.stringify({ volume: settings.volume, muted: settings.muted, retro: settings.retro, profanity: settings.profanity, quality: settings.quality }));
}

/** Última seleção do menu (modo + rota). */
export function loadSelection(def) {
  const s = readJSON('selection', null);
  return s && typeof s.mode === 'string' && typeof s.route === 'string' ? s : def;
}
export function saveSelection(sel) { write('selection', JSON.stringify({ mode: sel.mode, route: sel.route })); }

// ---- recordes (por modo + rota) -----------------------------------------
const recKey = (mode, route) => `${mode}|${route}`;

/** @returns {{points:number|null,time:number|null,runs:number}} */
export function getRecord(mode, route) {
  const all = readJSON('records', {});
  const r = all[recKey(mode, route)] || {};
  return { points: typeof r.points === 'number' ? r.points : null, time: typeof r.time === 'number' ? r.time : null, runs: r.runs | 0 };
}

/** Registra uma chegada. Devolve { newPoints, newTime, prev } (prev = recorde anterior). */
export function submitRecord(mode, route, points, time) {
  const all = readJSON('records', {});
  const k = recKey(mode, route);
  const prev = { points: null, time: null, runs: 0, ...(all[k] || {}) };
  const out = { newPoints: false, newTime: false, prev };
  const cur = { points: prev.points, time: prev.time, runs: (prev.runs | 0) + 1 };
  if (Number.isFinite(points) && (prev.points == null || points > prev.points)) { cur.points = points; out.newPoints = true; }
  if (Number.isFinite(time) && time > 0 && (prev.time == null || time < prev.time)) { cur.time = time; out.newTime = true; }
  all[k] = cur;
  write('records', JSON.stringify(all));
  return out;
}
