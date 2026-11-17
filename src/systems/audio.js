// Áudio 100% sintetizado (Web Audio). Nenhum arquivo de som. (Dono: agente de áudio/efeitos.)
//  - AudioContext só nasce/retoma após gesto do usuário (pointerdown/keydown/touchstart) ou TRIP_START.
//  - Cadeia: buses (motor/sfx/música) -> ganho mestre (volume/mudo/pausa) -> DynamicsCompressor (limitador) -> saída.
//  - Motor por carro com marchas, turbo (assobio + "pshh"), pneus, rolagem, cascalho, buzinas, batida, multa/pardal,
//    apito, humor (batimento, zumbido de estresse, respiração), resmungos (blips), jingles e música chiptune.
//  - API pública (ctx.modules.audio): vehiclePass(x, z, kind, speed, id?), stats(), unlock(), playSpeech(who, text, intensity).
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { VEHICLES } from '../config.js';
import { clamp } from '../core/math.js';
import { Synth } from './audio/synth.js';
import { Music } from './audio/music.js';
import { heartBpm, smooth01, getSettings, daviMood } from './fx/curves.js';

const SETTINGS_EV = EV.SETTINGS_CHANGE || 'settings:change';

const ENGINES = {
  kwid: { cyl: 3, idle: 900, red: 6200, up: 5700, down: 1700, ratios: [150, 88, 60, 45, 35], mix: [0.5, 0.3, 0.12], lp: [900, 2700, 700], horn: 'kwid' },
  cactus: { cyl: 4, idle: 850, red: 6500, up: 5500, down: 1900, ratios: [105, 66, 47, 36, 29, 23], mix: [0.5, 0.1, 0.42], lp: [420, 1500, 500], horn: 'cactus' },
};
const PASS_SLOTS = 4;

const A = {
  ctx: null, ac: null, syn: null, ready: false, unlockBound: false,
  master: null, comp: null, bus: {}, music: null,
  eng: null, tire: null, mood: null, whistle: null,
  profile: ENGINES.kwid, vehId: 'kwid',
  rpm: 900, gear: 0, shiftCut: 0, prevThrottle: 0, prevTurbo: 0, blowCool: 0,
  horn: null, hornAt: 0,
  heart: { phase: 0, last: 0 },
  slots: [], now: 0,
  vol: -1, muted: null, paused: false, playing: false, offs: [], hiddenOff: null,
  dbg: { events: 0 },
};
const _mood = { bars: null, weight: 0 };

const rnd = (a, b) => a + Math.random() * (b - a);
function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const st = () => A.ctx.state;

// ---------------------------------------------------------------------------------------------
// construção do grafo
function build(ctx) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor || A.ac) return;
  let ac;
  try { ac = new Ctor({ latencyHint: 'interactive' }); } catch (e) { return; }
  A.ac = ac; const syn = A.syn = new Synth(ac);
  A.master = ac.createGain(); A.master.gain.value = 0;
  A.comp = ac.createDynamicsCompressor();
  A.comp.threshold.value = -14; A.comp.knee.value = 10; A.comp.ratio.value = 14; A.comp.attack.value = 0.003; A.comp.release.value = 0.18;
  const out = ac.createGain(); out.gain.value = 0.92;
  A.master.connect(A.comp); A.comp.connect(out); out.connect(ac.destination);
  for (const k of ['engine', 'sfx', 'mood', 'musicIn']) { const g = ac.createGain(); g.gain.value = k === 'engine' ? 0.7 : 1; g.connect(A.master); A.bus[k] = g; }
  A.music = new Music(syn, A.bus.musicIn);

  // --- motor
  const e = A.eng = {};
  e.sum = ac.createGain(); e.lp = ac.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 600; e.out = ac.createGain(); e.out.gain.value = 0;
  e.sum.connect(e.lp); e.lp.connect(e.out); e.out.connect(A.bus.engine);
  e.g = [ac.createGain(), ac.createGain(), ac.createGain()];
  e.o = [syn.loopOsc('sawtooth', 40, e.g[0]), syn.loopOsc('square', 80, e.g[1]), syn.loopOsc('triangle', 20, e.g[2])];
  for (const g of e.g) g.connect(e.sum);
  e.wG = ac.createGain(); e.wG.gain.value = 0; e.wG.connect(A.bus.engine); e.w = syn.loopOsc('sine', 2000, e.wG);

  // --- pneus / rolagem / cascalho
  const t = A.tire = {};
  t.scG = ac.createGain(); t.scG.gain.value = 0; t.scF = ac.createBiquadFilter(); t.scF.type = 'bandpass'; t.scF.Q.value = 5; t.scF.frequency.value = 1600;
  t.scF.connect(t.scG); t.scG.connect(A.bus.sfx); t.scN = syn.loopNoise(t.scF);
  t.sqG = ac.createGain(); t.sqG.gain.value = 0; t.sqG.connect(A.bus.sfx); t.sq = syn.loopOsc('sawtooth', 900, t.sqG);
  t.rlF = ac.createBiquadFilter(); t.rlF.type = 'lowpass'; t.rlF.frequency.value = 260; t.rlG = ac.createGain(); t.rlG.gain.value = 0;
  t.rlF.connect(t.rlG); t.rlG.connect(A.bus.sfx); t.rl = syn.loopNoise(t.rlF, true);
  t.grF = ac.createBiquadFilter(); t.grF.type = 'bandpass'; t.grF.frequency.value = 2200; t.grF.Q.value = 0.8;
  t.grAM = ac.createGain(); t.grAM.gain.value = 0.55; t.grG = ac.createGain(); t.grG.gain.value = 0;
  t.grF.connect(t.grAM); t.grAM.connect(t.grG); t.grG.connect(A.bus.sfx); t.gr = syn.loopNoise(t.grF);
  t.grLfo = syn.loopOsc('square', 23, ac.createGain()); // LFO -> profundidade -> grAM.gain
  const depth = ac.createGain(); depth.gain.value = 0.45; t.grLfo.disconnect(); t.grLfo.connect(depth); depth.connect(t.grAM.gain);

  // --- humor: zumbido/ruído tenso
  const m = A.mood = {};
  m.tin = ac.createGain(); m.tin.gain.value = 0; m.tin.connect(A.bus.mood); m.oTin = syn.loopOsc('sine', 3150, m.tin);
  m.bzF = ac.createBiquadFilter(); m.bzF.type = 'lowpass'; m.bzF.frequency.value = 280; m.bz = ac.createGain(); m.bz.gain.value = 0;
  m.bzF.connect(m.bz); m.bz.connect(A.bus.mood); m.oBz = syn.loopOsc('sawtooth', 57, m.bzF);
  m.nF = ac.createBiquadFilter(); m.nF.type = 'bandpass'; m.nF.frequency.value = 2600; m.nF.Q.value = 5; m.nG = ac.createGain(); m.nG.gain.value = 0;
  m.nF.connect(m.nG); m.nG.connect(A.bus.mood); m.n = syn.loopNoise(m.nF);

  ac.onstatechange = () => { if (ac.state === 'running') afterRunning(); };
  applyEngineProfile(ctx.state.trip.vehicleId || 'kwid');
  applySettings(true);
  A.ready = true;
  A.music.start();
}

function afterRunning() { applySettings(true); }

/** Tenta criar/retomar o contexto (deve ser chamado a partir de gesto do usuário). */
function unlock() {
  const ctx = A.ctx; if (!ctx) return false;
  if (!A.ac) build(ctx);
  const ac = A.ac; if (!ac) return false;
  if (ac.state === 'suspended' && !document.hidden) { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignora */ } }
  return ac.state === 'running';
}

function bindUnlock() {
  if (A.unlockBound) return; A.unlockBound = true;
  const h = () => {
    if (unlock() && A.ac.state === 'running') {
      for (const n of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.removeEventListener(n, h, true);
      A.unlockBound = false;
    }
  };
  for (const n of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.addEventListener(n, h, true);
}

function applySettings(force) {
  if (!A.ac) return;
  const s = getSettings(st());
  const vol = clamp(+s.volume, 0, 1), muted = !!s.muted;
  const paused = st().mode === MODE.PAUSED;
  if (!force && vol === A.vol && muted === A.muted && paused === A.paused) return;
  A.vol = vol; A.muted = muted; A.paused = paused;
  const target = muted || paused ? 0 : vol * vol * 1.0 + vol * 0.0;   // curva quadrática: mais resolução em volumes baixos
  A.master.gain.setTargetAtTime(target, A.ac.currentTime, paused ? 0.03 : 0.05);
}

function applyEngineProfile(id) {
  A.vehId = ENGINES[id] ? id : 'kwid'; A.profile = ENGINES[A.vehId];
  A.rpm = A.profile.idle; A.gear = 0; A.shiftCut = 0;
  const m = A.profile.mix; for (let i = 0; i < 3; i++) A.eng.g[i].gain.value = m[i];
  A.eng.o[0].type = A.vehId === 'kwid' ? 'sawtooth' : 'sawtooth';
  A.eng.o[1].type = A.vehId === 'kwid' ? 'square' : 'sine';
  A.eng.o[2].type = 'triangle';
}

// ---------------------------------------------------------------------------------------------
// utilidades
function pan(x, z) {
  const ctx = A.ctx, p = ctx.state.player;
  const e = ctx.cameraRig.camera.matrixWorld.elements;   // coluna 0 = eixo "direita" da câmera
  let rx = e[0], rz = e[2]; const l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
  return clamp(((x - p.x) * rx + (z - p.z) * rz) / 28, -1, 1) * 0.85;
}
const T = () => A.ac.currentTime;
const sfx = () => A.bus.sfx;

function startHorn() {
  if (!A.ready || A.horn) return;
  const ac = A.ac, syn = A.syn, t = T(), kw = A.vehId === 'kwid';
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(kw ? 0.11 : 0.14, t + 0.025);
  const f = ac.createBiquadFilter();
  if (kw) { f.type = 'highpass'; f.frequency.value = 420; } else { f.type = 'lowpass'; f.frequency.value = 2300; }
  f.connect(g); g.connect(sfx());
  const oscs = kw ? [syn.loopOsc('square', 505, f), syn.loopOsc('square', 640, f)] : [syn.loopOsc('sawtooth', 342, f), syn.loopOsc('sawtooth', 428, f), syn.loopOsc('triangle', 171, f)];
  A.horn = { g, f, oscs }; A.hornAt = performance.now();
}
function stopHorn() {
  const h = A.horn; if (!h) return; A.horn = null;
  const t = T(); h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0.0001, t, 0.03);
  for (const o of h.oscs) { try { o.stop(t + 0.18); } catch (e) { /* já parado */ } }
  setTimeout(() => { try { h.g.disconnect(); h.f.disconnect(); } catch (e) { /* ok */ } }, 400);
}

function otherHorn(p) {
  if (!A.ready) return;
  const nowMs = performance.now();
  A.honks = (A.honks || []).filter((t) => nowMs - t < 700);
  if (A.honks.length >= 3) return;      // no máx. 3 buzinas de terceiros ao mesmo tempo
  A.honks.push(nowMs);
  const id = p && p.otherId != null ? p.otherId : Math.random(), h = hash(id), t = T(), syn = A.syn;
  const base = [392, 440, 466, 494, 523, 349, 587][Math.floor(h * 7)];
  const type = h > 0.5 ? 'square' : 'sawtooth', dur = 0.22 + hash(id + 'd') * 0.35, double = hash(id + 'x') > 0.55;
  const pn = p && p.x != null ? pan(p.x, p.z) : (hash(id + 'p') * 2 - 1) * 0.8;
  const vol = 0.07;
  const once = (t0, d) => {
    syn.tone(type, base, base * 0.995, t0, d, vol, sfx(), { attack: 0.015, sustain: true, filter: 'lowpass', ff: 2000 + h * 1500, pan: pn });
    syn.tone(type, base * 1.26, base * 1.25, t0, d, vol * 0.8, sfx(), { attack: 0.015, sustain: true, filter: 'lowpass', ff: 2000 + h * 1500, pan: pn });
  };
  once(t, dur); if (double) once(t + dur + 0.07, dur * 0.8);
}

function collision(p) {
  if (!A.ready) return;
  const k = clamp((p.impactKmh || 10) / 60, 0.12, 1), t = T(), syn = A.syn, d = sfx();
  const pn = p.x != null ? pan(p.x, p.z) * 0.6 : 0;
  syn.burst(t, 0.28 + k * 0.3, 0.32 + k * 0.4, d, { filter: 'lowpass', f0: 2600, f1: 220, prio: 2, pan: pn });
  syn.tone('sine', 120, 38, t, 0.32, 0.55 * (0.4 + k), d, { prio: 2, attack: 0.002 });
  if (p.b === 'pedestrian') { syn.tone('triangle', 520, 240, t + 0.02, 0.18, 0.12, d, { prio: 2 }); return; }
  if (k > 0.25) {
    syn.tone('square', 410, 380, t, 0.22, 0.07 * k, d, { prio: 2, filter: 'bandpass', ff: 900, q: 6 });
    syn.tone('square', 655, 610, t + 0.01, 0.2, 0.05 * k, d, { prio: 2, filter: 'bandpass', ff: 1400, q: 6 });
  }
  if (k > 0.6) for (let i = 0; i < 7; i++) syn.burst(t + 0.05 + Math.random() * 0.35, 0.03, 0.09, d, { filter: 'highpass', f0: 4500, prio: 1 });
}

function kaChing(t) {
  const syn = A.syn, d = sfx();
  syn.burst(t, 0.03, 0.15, d, { filter: 'highpass', f0: 3000, prio: 2 });
  syn.burst(t + 0.07, 0.025, 0.12, d, { filter: 'bandpass', f0: 2200, q: 2, prio: 2 });
  for (const [f, v, t0] of [[1568, 0.1, 0.1], [2093, 0.1, 0.1], [3136, 0.06, 0.1], [1760, 0.09, 0.2], [2349, 0.09, 0.2]]) syn.tone('sine', f, f, t + t0, 0.9, v, d, { prio: 2, attack: 0.002 });
}
function pardal(t) {
  const syn = A.syn, d = sfx();
  syn.burst(t, 0.05, 0.3, d, { filter: 'highpass', f0: 2500, prio: 2 });          // clique do obturador
  syn.tone('sine', 300, 2400, t + 0.03, 0.22, 0.07, d, { prio: 2, attack: 0.01 }); // carga do flash
  syn.burst(t + 0.26, 0.09, 0.28, d, { filter: 'highpass', f0: 3500, q: 1, prio: 2 }); // estalo do flash
}
function whistle(t0, dur) {
  const ac = A.ac, syn = A.syn;
  if (!syn.canPlay(2)) return;
  const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = 2750; l.frequency.value = 31; lg.gain.value = 170; l.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.13, t0 + 0.02); g.gain.setValueAtTime(0.13, t0 + dur - 0.04); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(sfx());
  syn._track(o, [g, lg], false); syn._track(l, [lg], false);
  o.start(t0); o.stop(t0 + dur + 0.02); l.start(t0); l.stop(t0 + dur + 0.02);
  syn.burst(t0, dur, 0.04, sfx(), { filter: 'highpass', f0: 4000, hold: dur * 0.8, prio: 2 });
}

function breathe() {
  if (!A.ready) return;
  const t = T(), syn = A.syn, d = sfx();
  syn.burst(t, 1.0, 0.2, d, { filter: 'bandpass', f0: 500, f1: 1150, q: 0.9, attack: 0.55, prio: 1 });
  syn.burst(t + 1.15, 1.3, 0.2, d, { filter: 'bandpass', f0: 950, f1: 420, q: 0.9, attack: 0.15, prio: 1 });
}

/** Fala sintetizada: sequência de blips (sem voz real). curse = resmungo com queda de tom. */
function speak(who, text, intensity, curse) {
  if (!A.ready) return;
  const syn = A.syn, ac = A.ac;
  if (!syn.canPlay(0)) return;
  const davi = who !== 'dono', k = clamp(intensity == null ? 0.5 : intensity, 0, 1);
  const txt = text ? String(text) : (curse ? 'xingamento' : 'ahn');
  const n = curse ? 7 + Math.floor(Math.random() * 4) : clamp(Math.round(txt.length / 2.4), 3, 18);
  const syl = (davi ? 0.058 : 0.085) * (1 - 0.25 * k), base = (davi ? 250 : 132) * (1 + 0.22 * k);
  const t = T() + 0.01;
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = davi ? (curse ? 'sawtooth' : 'square') : 'triangle'; f.type = 'lowpass'; f.frequency.value = davi ? 1700 : 1000;
  o.connect(f); f.connect(g); g.connect(A.bus.sfx);
  const vol = davi ? 0.07 : 0.1;
  for (let i = 0; i < n; i++) {
    const tt = t + i * syl, h = ((txt.charCodeAt(i % txt.length) * 131 + i * 37) % 97) / 97;
    let fr = base * (0.7 + h * 0.85);
    if (curse) fr *= 1 - (i / n) * 0.35;
    o.frequency.setValueAtTime(fr, tt);
    o.frequency.linearRampToValueAtTime(fr * (curse ? 0.85 : 1.06), tt + syl * 0.8);
    g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(vol * (0.7 + 0.3 * h), tt + 0.008);
    g.gain.linearRampToValueAtTime(0.0001, tt + syl * 0.86);
  }
  const end = t + n * syl + 0.05;
  syn._track(o, [g, f], false); o.start(t); o.stop(end);
}

function jingleWin() {
  if (!A.ready) return;
  const t = T() + 0.05, syn = A.syn, d = sfx(), sd = 0.095;
  const seq = [523.25, 659.25, 783.99, 1046.5];
  seq.forEach((f, i) => { syn.tone('pulse25', f, f, t + i * sd, i === 3 ? 0.65 : sd * 0.9, 0.16, d, { prio: 2, attack: 0.004 }); });
  syn.tone('pulse25', 1318.5, 1318.5, t + 4 * sd, 0.55, 0.1, d, { prio: 2 });
  syn.tone('triangle', 261.6, 261.6, t, 0.9, 0.2, d, { prio: 2 });
  syn.tone('triangle', 392, 392, t + 4 * sd, 0.8, 0.12, d, { prio: 2 });
}
function jingleSad() {
  if (!A.ready) return;
  const t = T() + 0.05, syn = A.syn, d = sfx();
  [[392, 0], [370, 0.28], [349.2, 0.56]].forEach(([f, o]) => syn.tone('sawtooth', f, f * 0.97, t + o, 0.26, 0.11, d, { prio: 2, filter: 'lowpass', ff: 1400, attack: 0.02 }));
  syn.tone('sawtooth', 329.6, 261.6, t + 0.84, 1.1, 0.13, d, { prio: 2, filter: 'lowpass', ff: 1100, attack: 0.04 });
  syn.tone('triangle', 98, 82, t + 0.84, 1.1, 0.2, d, { prio: 2 });
}

// ---------------------------------------------------------------------------------------------
// tráfego ambiente: no máx. PASS_SLOTS vozes simultâneas
function vehiclePass(x, z, kind = 'car', speed = 10, id = null) {
  if (!A.ready || !A.ac || A.ac.state !== 'running' || !A.playing) return;
  const p = A.ctx.state.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d > 75) return;
  let slot = null, best = 1e9;
  for (const s of A.slots) {
    if (!s.active) continue;
    if (id != null && s.id === id) { slot = s; break; }
    const dd = Math.hypot(s.x - x, s.z - z);
    if (id == null && dd < 9 && dd < best) { best = dd; slot = s; }
  }
  if (!slot) {
    slot = A.slots.find((s) => !s.active);
    if (!slot && A.slots.length < PASS_SLOTS) { slot = makeSlot(); if (slot) A.slots.push(slot); }
    if (!slot) {   // todos ocupados: só toma o lugar do mais distante se este veículo estiver mais perto
      let far = null;
      for (const s of A.slots) if (!far || s.d > far.d) far = s;
      if (!far || d >= far.d) return;
      stopSlot(far); slot = far;
    }
    startSlot(slot, kind); slot.id = id; slot.lastD = d; slot.t = A.now;
  }
  const dtt = Math.max(0.016, A.now - slot.t), vr = (d - (slot.lastD ?? d)) / dtt; // m/s afastando (+)
  slot.lastD = d; slot.t = A.now; slot.x = x; slot.z = z; slot.d = d; slot.kind = kind;
  const prof = kind === 'bus' ? [38, 0.9, 520] : kind === 'moto' ? [96, 1.6, 2400] : kind === 'truck' ? [32, 0.8, 480] : [55, 1.1, 900];
  const f = (prof[0] + speed * 2.6 * prof[1]) * (1 - clamp(vr, -30, 30) * 0.004);
  const near = Math.pow(1 - d / 75, 2), tt = A.ac.currentTime;
  slot.o.frequency.setTargetAtTime(f, tt, 0.05); slot.o2.frequency.setTargetAtTime(f * 2.01, tt, 0.05);
  slot.lp.frequency.setTargetAtTime(prof[2] + speed * 30, tt, 0.1);
  slot.g.gain.setTargetAtTime(near * (kind === 'bus' || kind === 'truck' ? 0.07 : 0.045), tt, 0.08);
  slot.pan.pan.setTargetAtTime(pan(x, z), tt, 0.06);
}
function makeSlot() {
  if (!A.syn.canPlay(1)) return null;
  const ac = A.ac;
  return { active: false, g: ac.createGain(), lp: ac.createBiquadFilter(), pan: ac.createStereoPanner(), o: null, o2: null, id: null, x: 0, z: 0, d: 99, t: 0, lastD: 0, kind: 'car' };
}
function startSlot(s, kind) {
  s.lp.type = 'lowpass'; s.g.gain.value = 0;
  s.mix = s.mix || A.ac.createGain(); s.mix.gain.value = 1;
  s.mix.connect(s.lp); s.lp.connect(s.g); s.g.connect(s.pan); s.pan.connect(sfx());
  s.o = A.syn.loopOsc('sawtooth', 60, s.mix); s.o2 = A.syn.loopOsc(kind === 'moto' ? 'square' : 'triangle', 120, s.mix);
  s.active = true;
}
function stopSlot(s) {
  try { s.o.stop(); s.o2.stop(); } catch (e) { /* ok */ }
  try { s.mix.disconnect(); s.lp.disconnect(); s.g.disconnect(); s.pan.disconnect(); } catch (e) { /* ok */ }
  s.active = false; s.o = s.o2 = null;
}
function housekeepSlots() {
  for (const s of A.slots) {
    if (!s.active) continue;
    const idle = A.now - s.t;
    if (idle > 0.18) s.g.gain.setTargetAtTime(0, A.ac.currentTime, 0.06);
    if (idle > 0.7) stopSlot(s);
  }
}

// ---------------------------------------------------------------------------------------------
// laço por frame
function updateEngine(dt, ctx, on) {
  const sp = ctx.state.player, P = A.profile, e = A.eng, ac = A.ac, t = ac.currentTime;
  const veh = VEHICLES[A.vehId], kmh = sp.speedKmh, thr = on ? sp.throttle : 0;
  const n = P.ratios.length;
  // marchas
  let rpmG = kmh * P.ratios[A.gear];
  if (A.gear < n - 1 && rpmG > P.up) { A.gear++; A.shiftCut = 0.13; rpmG = kmh * P.ratios[A.gear]; }
  else if (A.gear > 0 && rpmG < P.down) { A.gear--; rpmG = kmh * P.ratios[A.gear]; }
  let target = Math.max(rpmG, P.idle + thr * 2600 + kmh * 60 * (A.gear === 0 ? 1 : 0));
  if (A.gear === 0 && kmh < 22) target = Math.max(rpmG, P.idle + thr * 2900 + kmh * 70);
  target = clamp(target, P.idle, P.red);
  if (target >= P.red - 5 && thr > 0.5) target -= 220 * (Math.sin(ac.currentTime * 70) > 0 ? 1 : 0); // limitador de giro
  const rate = target > A.rpm ? 7 : 13;
  A.rpm += (target - A.rpm) * (1 - Math.exp(-rate * dt));
  A.shiftCut = Math.max(0, A.shiftCut - dt);
  const rn = clamp((A.rpm - P.idle) / (P.red - P.idle), 0, 1);
  const kw = A.vehId === 'kwid';
  const strain = kw ? rn * rn * rn * 0.8 + thr * rn * 0.35 : rn * rn * 0.35;
  const f = A.rpm / 60 * P.cyl / 2 * (1 + (kw ? 0.006 : 0.002) * Math.sin(ac.currentTime * 47) * strain);
  const s = 0.03;
  e.o[0].frequency.setTargetAtTime(f, t, 0.02); e.o[1].frequency.setTargetAtTime(f * 2, t, 0.02); e.o[2].frequency.setTargetAtTime(f * 0.5, t, 0.02);
  const mix = P.mix;
  e.g[1].gain.setTargetAtTime(mix[1] + (kw ? strain * 0.45 : 0), t, s);
  e.g[0].gain.setTargetAtTime(mix[0] * (kw ? 1 - strain * 0.25 : 1), t, s);
  e.lp.frequency.setTargetAtTime(P.lp[0] + rn * P.lp[1] + thr * P.lp[2], t, 0.04);
  e.lp.Q.setTargetAtTime(kw ? 1 + strain * 4 : 1.2, t, 0.1);
  const cut = A.shiftCut > 0 ? 0.35 : 1;
  const lvl = on ? (0.09 + 0.1 * rn + 0.1 * thr) * cut * (sp.offroad ? 0.9 : 1) : 0;
  e.out.gain.setTargetAtTime(lvl, t, 0.04);
  // turbo
  let wl = 0;
  if (on && veh.turboBoost > 0) {
    const tb = sp.turbo;
    wl = tb * (0.3 + 0.7 * Math.min(1, thr * 2)) * 0.03;
    e.w.frequency.setTargetAtTime(1300 + tb * 3200 + rn * 500, t, 0.05);
    A.blowCool -= dt;
    if (A.prevThrottle > 0.5 && thr < 0.25 && A.prevTurbo > 0.35 && A.blowCool <= 0 && !sp.reversing) {
      A.blowCool = 0.8;
      const tt = T(), syn = A.syn;
      syn.burst(tt, 0.5, 0.2 * A.prevTurbo + 0.05, sfx(), { filter: 'bandpass', f0: 3200, f1: 1500, q: 0.8, attack: 0.012, prio: 1 });
      syn.tone('sine', 3800, 1800, tt, 0.3, 0.035 * A.prevTurbo, sfx(), { prio: 1 });
    }
  }
  e.wG.gain.setTargetAtTime(wl, t, 0.06);
  A.prevThrottle = thr; A.prevTurbo = on ? sp.turbo : 0;
}

function updateTires(ctx, on) {
  const sp = ctx.state.player, T0 = A.tire, t = A.ac.currentTime, kmh = sp.speedKmh;
  const h = sp.heading, lat = Math.abs(-sp.vx * Math.cos(h) + sp.vz * Math.sin(h));
  let sc = 0;
  if (on && !sp.offroad && kmh > 7) {
    sc = Math.max(clamp((lat - 2.2) / 6, 0, 1), sp.handbrake && kmh > 14 ? 0.7 : 0, sp.brake > 0.85 && kmh > 55 ? 0.3 : 0);
  }
  const kw = A.vehId === 'kwid';
  T0.scG.gain.setTargetAtTime(sc * 0.3, t, 0.05);
  T0.scF.frequency.setTargetAtTime((kw ? 1700 : 1350) + kmh * 6 + lat * 40, t, 0.08);
  T0.sqG.gain.setTargetAtTime(sc * 0.022, t, 0.06);
  T0.sq.frequency.setTargetAtTime((kw ? 880 : 700) + kmh * 3 + lat * 30, t, 0.08);
  const roll = on && !sp.offroad ? clamp(kmh / 130, 0, 1) : 0;
  T0.rlG.gain.setTargetAtTime(roll * 0.5, t, 0.1);
  T0.rlF.frequency.setTargetAtTime(180 + kmh * 3, t, 0.1);
  const gr = on && sp.offroad ? clamp(kmh / 35, 0, 1) : 0;
  T0.grG.gain.setTargetAtTime(gr * 0.34, t, 0.08);
  T0.grF.frequency.setTargetAtTime(1500 + kmh * 20, t, 0.1);
  T0.grLfo.frequency.setTargetAtTime(14 + kmh * 0.5, t, 0.1);
}

function updateMood(dt, ctx, on) {
  const m = A.mood, t = A.ac.currentTime;
  daviMood(ctx.state, _mood);
  const bars = _mood.bars, w = _mood.weight;
  const a = on ? smooth01(bars.anxiety, 25, 100) * (w === 0 ? 0 : 1) : 0;
  const s = on ? smooth01(bars.stress, 40, 100) * (w === 0 ? 0 : 1) : 0;
  m.tin.gain.setTargetAtTime(s * s * 0.03, t, 0.3);
  m.oBz.frequency.setTargetAtTime(52 + s * 14, t, 0.3);
  m.bz.gain.setTargetAtTime(s * 0.07, t, 0.3);
  m.nG.gain.setTargetAtTime(s * 0.035, t, 0.3);
  m.nF.frequency.setTargetAtTime(2200 + s * 1800, t, 0.3);
  // batimento: lub-dub acelera e fica mais alto com a ansiedade
  if (on && a > 0.02) {
    const H = A.heart, bpm = heartBpm(bars.anxiety);
    H.phase += dt * bpm / 60;
    if (H.phase >= 1) {
      H.phase -= Math.floor(H.phase);
      const per = 60 / bpm, vol = (0.1 + 0.55 * a) * (w === 1 ? 1 : 0.7), tt = T() + 0.005, syn = A.syn, d = A.bus.mood;
      syn.tone('sine', 66, 38, tt, 0.16, vol, d, { prio: 1, attack: 0.004 });
      syn.tone('sine', 58, 36, tt + per * 0.27, 0.14, vol * 0.75, d, { prio: 1, attack: 0.004 });
      syn.burst(tt, 0.05, vol * 0.18, d, { filter: 'lowpass', f0: 220, prio: 0 });
    }
  }
  return a;
}

export default {
  name: 'audio',

  init(ctx) {
    A.ctx = ctx;
    for (const f of A.offs) f(); A.offs.length = 0;
    const on = (n, f) => A.offs.push(ctx.events.on(n, f));
    const guard = (fn) => (p) => { if (!A.ready) return; A.dbg.events++; try { fn(p); } catch (e) { console.warn('[audio]', e); } };
    bindUnlock();
    document.addEventListener('visibilitychange', () => {
      if (!A.ac) return;
      if (document.hidden) { try { A.ac.suspend(); } catch (e) { /* ok */ } } else { unlock(); }
    });

    on(EV.TRIP_START, (p) => {
      unlock();
      if (!A.ready) return;
      stopHorn(); applyEngineProfile(p.vehicleId); A.heart.phase = 0; A.prevThrottle = A.prevTurbo = 0;
    });
    on(EV.HORN, guard(() => startHorn()));
    on(EV.HORN_END, guard(() => stopHorn()));
    on(EV.HONKED_AT, guard((p) => otherHorn(p)));
    on(EV.COLLISION, guard((p) => collision(p)));
    on(EV.FINE, guard((p) => {
      const t = T() + 0.01;
      if (p && p.by === 'agent') { whistle(t, 0.28); whistle(t + 0.4, 0.5); kaChing(t + 1.0); return; }
      pardal(t); kaChing(t + 0.55);
    }));
    on(EV.BREATHE, guard(() => breathe()));
    on(EV.CURSE, guard(() => speak(ctx.state.mood.driver.who, null, 0.8, true)));
    const say = guard((p) => speak(ctx.state.mood.passenger.who || 'davi', p && p.text, p && p.intensity, false));
    on(EV.PASSENGER_SAY, say);
    if (EV.SAY) on(EV.SAY, say);
    on(EV.ARRIVED, guard(() => jingleWin()));
    on(EV.TRIP_FINISH, guard((p) => { stopHorn(); if (p && p.reason === 'bateu') jingleSad(); }));
    on(EV.STATE_CHANGE, guard((p) => { if (p.to !== MODE.PLAYING) stopHorn(); applySettings(true); }));
    on(SETTINGS_EV, () => applySettings(false));
  },

  reset(ctx, trip) {
    void trip; void ctx;
    if (!A.ready) return;
    stopHorn(); A.heart.phase = 0; A.rpm = A.profile.idle; A.gear = 0;
  },

  update(dt, ctx) { void dt; void ctx; },

  frame(dt, alpha, ctx) {
    void alpha;
    if (!A.ready || !A.ac) return;
    A.now += dt;
    applySettings(false);
    if (A.ac.state !== 'running') return;
    const mode = ctx.state.mode, playing = mode === MODE.PLAYING;
    A.playing = playing;
    dt = Math.min(dt, 0.05);
    if (A.horn && (performance.now() - A.hornAt > 7000 || !playing)) stopHorn();
    updateEngine(dt, ctx, playing);
    updateTires(ctx, playing);
    const a = updateMood(dt, ctx, playing);
    housekeepSlots();
    // música: alta no menu, baixa durante o jogo, muda em pausa
    const lvl = mode === MODE.MENU ? 0.5 : mode === MODE.PLAYING ? 0.17 : mode === MODE.FINISHED ? 0.07 : 0;
    daviMood(ctx.state, _mood);
    const an = Math.round(playing ? _mood.bars.anxiety * (_mood.weight || 0.5) : 0);
    if (lvl !== A.mLvl || an !== A.mAn) { A.mLvl = lvl; A.mAn = an; A.music.setTarget(lvl, an); }
    void a;
  },

  /** Registra/atualiza uma fonte de motor de tráfego (chame todo frame por veículo próximo; máx. 4 vozes). */
  vehiclePass,
  /** Fala sintetizada manual (who: 'davi'|'dono'). */
  playSpeech(who, text, intensity) { speak(who, text, intensity, false); },
  unlock,
  /** Diagnóstico: contagem de fontes de áudio vivas. */
  stats() {
    const s = A.syn;
    return { state: A.ac ? A.ac.state : 'none', ready: A.ready, live: s ? s.live : 0, persistent: s ? s.persistent : 0, peak: s ? s.peak : 0, dropped: s ? s.dropped : 0,
      events: A.dbg.events, gear: A.gear, rpm: Math.round(A.rpm), bpm: A.music ? Math.round(A.music.bpm) : 0, master: A.master ? A.master.gain.value : 0, slots: A.slots.filter((x) => x.active).length };
  },
};
