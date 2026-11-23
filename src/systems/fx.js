// Efeitos visuais. (Dono: agente de áudio/efeitos.)
//  - Overlays DOM/CSS baratos em #fx-layer (criado aqui, acima do canvas e abaixo de #ui-layer):
//    visão em túnel (ansiedade) + pulsação no ritmo do batimento + linhas de velocidade, borda vermelha e
//    veias (estresse/pico), borda fria (pânico do passageiro no modo perigo), flashes (pardal/batida), filtro retrô.
//  - Partículas 3D num único THREE.Points (poeira, fumaça de pneu, faíscas, sopro do turbo) e marcas de pneu num
//    único InstancedMesh (ver ./fx/particles.js).
//  - Humor: o do Davi (driver se ele dirige; passageiro com peso 0,5 em 'carona'). Ver ./fx/curves.js.
//  Sem pós-processamento próprio (o bloom/tone mapping do perfil HD ficam em render/hd.js). HD (quality.fxSoft): partículas suaves,
//  faíscas num pool aditivo (acendem o bloom), emissão ×1,6 e marcas de pneu esfumadas.
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { clamp, damp } from '../core/math.js';
import { Overlay } from './fx/overlay.js';
import { Particles, SkidMarks } from './fx/particles.js';
import { heartBpm, beatEnv, smooth01, getSettings, daviMood, panicBars } from './fx/curves.js';

const SETTINGS_EV = EV.SETTINGS_CHANGE || 'settings:change';
const mood = { bars: null, weight: 0 };

const S = {
  ctx: null, ov: null, parts: null, skids: null, reduced: false,
  tun: 0, red: 0, cold: 0, speed: 0, veins: 0, flash: 0, flashColor: '#fff', flashDecay: 3,
  kick: 0, relax: 0, redKick: 0, phase: 0, beatEnv: 0,
  shakeT: 0, skidAcc: [0, 0], smokeAcc: 0, dustAcc: 0, prevThrottle: 0, prevTurbo: 0, puffCool: 0,
  retro: null, lastPlace: 0, offs: [], sparks: null, rate: 1, // HD: sparks = pool aditivo; rate = multiplicador de emissão
};

function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

function doFlash(v, color, decay) {
  if (S.reduced) { v *= 0.35; decay *= 1.4; }
  if (v > S.flash) { S.flash = v; S.flashColor = color; S.flashDecay = decay; }
}
function doShake(amount, duration) {
  if (S.reduced) amount *= 0.3;
  S.ctx.cameraRig.shake(amount, duration);
}

function resetAll() {
  S.tun = S.red = S.cold = S.speed = S.veins = S.flash = 0; S.kick = S.relax = S.redKick = 0;
  S.shakeT = 0; S.skidAcc[0] = S.skidAcc[1] = 0; S.smokeAcc = S.dustAcc = 0; S.prevThrottle = S.prevTurbo = 0; S.puffCool = 0;
  if (S.ov) S.ov.clear();
  if (S.parts) S.parts.clear();
  if (S.sparks) S.sparks.clear();
  if (S.skids) S.skids.clear();
}

// ---------------------------------------------------------------------------------------------
// emissão
const rnd = (a, b) => a + Math.random() * (b - a);

function wheelPos(pm, vehicle, side, out) {
  // roda traseira: centro - f * 0.3 L ± r * 0.43 W   (f=(sin h, cos h), r=(-cos h, sin h))
  const h = pm.rotation.y, sh = Math.sin(h), ch = Math.cos(h);
  const back = vehicle.length * 0.3, lat = vehicle.width * 0.43 * side;
  out.x = pm.position.x - sh * back - ch * lat; out.z = pm.position.z - ch * back + sh * lat;
  out.sh = sh; out.ch = ch;
}
const _w = { x: 0, z: 0, sh: 0, ch: 0 };

function sparks(x, z, nx, nz, impactKmh) {
  const n = Math.round(clamp(impactKmh / 1.6, 10, 42) * S.rate);
  const P = S.sparks || S.parts; // HD: pool aditivo à parte (faísca acende o bloom)
  for (let i = 0; i < n; i++) {
    const sp = rnd(2, 6 + impactKmh * 0.06);
    P.spawn(x, rnd(0.2, 0.8), z, nx * sp + rnd(-2.5, 2.5), rnd(1.5, 4.5), nz * sp + rnd(-2.5, 2.5),
      rnd(0.3, 0.7), 1.1, 0.35, 1, rnd(0.75, 0.98), rnd(0.25, 0.5), 1, 0.4, 14);
  }
  const m = Math.round(clamp(impactKmh / 5, 3, 10));
  for (let i = 0; i < m; i++) {
    S.parts.spawn(x + rnd(-0.4, 0.4), rnd(0.4, 1), z + rnd(-0.4, 0.4), nx * rnd(0.5, 2) + rnd(-0.6, 0.6), rnd(0.4, 1.4), nz * rnd(0.5, 2) + rnd(-0.6, 0.6),
      rnd(0.6, 1.1), 0.9, 2.8, 0.55, 0.53, 0.5, 0.45, 2.2, 0);
  }
}

function dustBurst(x, z, n) {
  n = Math.round(n * S.rate);
  for (let i = 0; i < n; i++) S.parts.spawn(x + rnd(-0.5, 0.5), rnd(0.1, 0.4), z + rnd(-0.5, 0.5), rnd(-1.5, 1.5), rnd(0.3, 1.2), rnd(-1.5, 1.5),
    rnd(0.9, 1.6), 1.0, 4.2, 0.72, 0.38, 0.22, 0.8, 2.0, 0);
}

function emitDrive(dt) {
  const { state, player } = S.ctx, sp = state.player, pm = player.model && player.model.root;
  if (!pm) return;
  const v = player.vehicle, kmh = sp.speedKmh, spd = sp.speed;
  const h = sp.heading, sh = Math.sin(h), ch = Math.cos(h);
  const lat = Math.abs(-sp.vx * ch + sp.vz * sh);          // velocidade lateral (m/s)
  const skidding = kmh > 8 && (lat > 2.4 || (sp.handbrake && kmh > 14)) && !sp.offroad;
  const hardBrake = kmh > 55 && sp.brake > 0.85 && !sp.offroad;
  // marcas + fumaça de pneu
  if (skidding || hardBrake) {
    const rate = (skidding ? 38 : 14) * S.rate;
    S.smokeAcc += dt * rate;
    const dir = Math.atan2(sp.vx, sp.vz);
    for (let s = 0; s < 2; s++) {
      wheelPos(pm, v, s === 0 ? -1 : 1, _w);
      S.skidAcc[s] += Math.hypot(sp.vx, sp.vz) * dt;
      if (S.skidAcc[s] >= 0.9) {
        const len = Math.min(S.skidAcc[s] + 0.15, 6), d2 = skidding ? dir : h;
        S.skidAcc[s] = 0;
        S.skids.add(_w.x - Math.sin(d2) * len * 0.5, 0.1, _w.z - Math.cos(d2) * len * 0.5, d2, 0.24, len);   // segmento cobre o trecho percorrido
      }
      while (S.smokeAcc >= 1) {
        S.smokeAcc -= 1;
        S.parts.spawn(_w.x + rnd(-0.2, 0.2), 0.2, _w.z + rnd(-0.2, 0.2), sp.vx * 0.15 + rnd(-0.5, 0.5), rnd(0.5, 1.1), sp.vz * 0.15 + rnd(-0.5, 0.5),
          rnd(0.7, 1.2), 0.5, 2.2, 0.86, 0.86, 0.88, skidding ? 0.38 : 0.22, 1.2, -0.2);
      }
    }
  } else { S.skidAcc[0] = S.skidAcc[1] = 0.9; }
  // poeira fora da pista
  if (sp.offroad && kmh > 5) {
    S.dustAcc += dt * (28 + kmh * 1.5) * S.rate;
    while (S.dustAcc >= 1) {
      S.dustAcc -= 1;
      wheelPos(pm, v, Math.random() < 0.5 ? -1 : 1, _w);
      S.parts.spawn(_w.x + rnd(-0.2, 0.2), rnd(0.1, 0.3), _w.z + rnd(-0.2, 0.2),
        -sp.vx * 0.12 + rnd(-0.9, 0.9), rnd(0.3, 1.0), -sp.vz * 0.12 + rnd(-0.9, 0.9),
        rnd(1.0, 1.8), 1.1, 4.6 + kmh * 0.03, 0.72, 0.38, 0.22, 0.9, 1.6, 0);
    }
  }
  // sopro do turbo (Cactus): alívio do acelerador com turbo cheio
  S.puffCool -= dt;
  if (v.turboBoost > 0 && S.prevThrottle > 0.5 && sp.throttle < 0.25 && S.prevTurbo > 0.35 && S.puffCool <= 0 && !sp.reversing) {
    S.puffCool = 0.8;
    const sgn = spd >= 0 ? -1 : 1;
    const bx = pm.position.x + sh * v.length * 0.5 * sgn, bz = pm.position.z + ch * v.length * 0.5 * sgn;
    for (let i = 0; i < 6; i++) S.parts.spawn(bx + rnd(-0.3, 0.3), rnd(0.3, 0.6), bz + rnd(-0.3, 0.3), sh * sgn * rnd(1, 3) + rnd(-0.6, 0.6), rnd(0.2, 0.8), ch * sgn * rnd(1, 3) + rnd(-0.6, 0.6),
      rnd(0.4, 0.7), 0.3, 1.1, 0.88, 0.93, 1, 0.32, 3, 0);
  }
  S.prevThrottle = sp.throttle; S.prevTurbo = sp.turbo;
}

// ---------------------------------------------------------------------------------------------
export default {
  name: 'fx',

  init(ctx) {
    S.ctx = ctx; S.reduced = reducedMotion();
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const f = () => { S.reduced = mq.matches; };
      if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
    } catch (e) { /* sem matchMedia */ }
    const q = ctx.quality;
    S.ov = new Overlay().mount({ grain: q.fxGrain !== false });
    const soft = !!q.fxSoft; // HD: partículas suaves, faíscas aditivas, mais emissão, marcas de pneu esfumadas
    S.rate = soft ? 1.6 : 1;
    S.parts = new Particles(ctx.THREE, ctx.view.scene, q.maxParticles || 300, { soft });
    S.sparks = soft ? new Particles(ctx.THREE, ctx.view.scene, Math.round((q.maxParticles || 300) / 4), { soft: true, additive: true }) : null;
    S.skids = new SkidMarks(ctx.THREE, ctx.view.scene, q.fxSkidMax || 160, { soft });
    S.ov.setMenu(ctx.state.mode === MODE.MENU);
    S.retro = null; // força aplicar
    const ev = ctx.events, on = (n, f) => S.offs.push(ev.on(n, f));
    for (const f of S.offs) f();
    S.offs.length = 0;

    on(EV.STATE_CHANGE, (p) => {
      S.ov.setMenu(p.to === MODE.MENU);
      if (p.to === MODE.MENU) resetAll();
    });
    on(EV.COLLISION, (p) => {
      const imp = p.impactKmh || 0;
      if (imp < 3) return;
      sparks(p.x, p.z, p.nx || 0, p.nz || 0, imp);
      const k = clamp(imp / 70, 0.1, 1);
      doShake(0.12 + k * 0.8, 0.25 + k * 0.45);
      doFlash(0.12 + k * 0.5, '#fff', 3 - k * 1.2);
      S.kick = Math.max(S.kick, k);
    });
    on(EV.FINE, (p) => {
      if (p && p.by === 'agent') { doFlash(0.18, '#7ab0ff', 5); doShake(0.08, 0.2); return; }
      doFlash(0.95, '#ffffff', 2.4); doShake(0.1, 0.18);
    });
    on(EV.OFFROAD, (p) => { if (p.on && S.ctx.state.player.speedKmh > 6) dustBurst(p.x, p.z, 16); });
    on(EV.MOOD_PEAK, (p) => {
      const who = p && p.who;
      if (who === 'dono') { doFlash(0.3, '#8a7bff', 4); doShake(0.15, 0.25); return; }
      if (p && p.bar === 'anxiety') { S.kick = Math.max(S.kick, 0.8); return; }
      S.veins = 1; S.redKick = 1; doShake(0.18, 0.4);
    });
    on(EV.NEAR_MISS, () => {
      if (panicBars(S.ctx.state)) { doFlash(0.28, '#9a8cff', 5); doShake(0.2, 0.28); S.cold = Math.min(1, S.cold + 0.25); }
      else S.kick = Math.max(S.kick, 0.35);
    });
    on(EV.OVERTAKEN, () => { S.redKick = Math.max(S.redKick, 0.55); });
    on(EV.CUT_OFF, () => { S.redKick = Math.max(S.redKick, 0.8); doShake(0.08, 0.2); });
    on(EV.HONKED_AT, () => { S.redKick = Math.max(S.redKick, 0.3); });
    on(EV.CURSE, () => { S.redKick = Math.max(S.redKick, 0.5); });
    on(EV.BREATHE, () => { S.relax = 1; });
    on(SETTINGS_EV, () => { S.retro = null; });
  },

  reset(ctx, trip) {
    void trip;
    resetAll();
    S.ov.setMenu(false);
    S.ov.place();
  },

  update(dt, ctx) { void dt; void ctx; },

  /** Diagnóstico: partículas vivas / marcas de pneu / camadas. */
  stats() { return { particles: S.parts ? S.parts.alive : 0, poolSize: S.parts ? S.parts.max : 0, skids: S.skids ? S.skids.n : 0, tunnel: +S.tun.toFixed(2), red: +S.red.toFixed(2), cold: +S.cold.toFixed(2), speed: +S.speed.toFixed(2), flash: +S.flash.toFixed(2), reduced: S.reduced }; },

  frame(dt, alpha, ctx) {
    void alpha;
    const { state, cameraRig, view } = ctx, ov = S.ov;
    if (!ov) return;
    const mode = state.mode;
    // filtro retrô (ligável em tempo real; vale em qualquer estado)
    const retro = getSettings(state).retro !== false;
    if (retro !== S.retro) { S.retro = retro; ov.setRetro(retro); }
    if (mode === MODE.MENU) { ov.setMenu(true); S.parts.update(0, 1); if (S.sparks) S.sparks.update(0, 1); return; }
    ov.setMenu(false);

    const live = mode === MODE.PLAYING;
    const paused = mode === MODE.PAUSED;
    const ddt = paused ? 0 : Math.min(dt, 0.1);

    // ---- alvos
    daviMood(state, mood);
    const bars = mood.bars, w = mood.weight;
    const fin = mode === MODE.FINISHED;
    let aT = fin ? 0 : smooth01(bars.anxiety, 28, 100) * w;
    let sT = fin ? 0 : smooth01(bars.stress, 32, 100) * (w === 1 ? 1 : 0.7 * (w > 0 ? 1 : 0));
    const pb = panicBars(state);
    let cT = fin || !pb ? 0 : smooth01((pb.anxiety + pb.stress) * 0.5, 25, 92);
    const sp = state.player;
    let vT = fin ? 0 : smooth01(sp.speedKmh, 62, 150) * (0.3 + 0.7 * Math.max(aT, w > 0 ? 0.25 : 0));

    if (!paused) {
      S.tun = damp(S.tun, aT, 2.2, ddt); S.red = damp(S.red, sT, 2.2, ddt);
      S.cold = damp(S.cold, cT, 2.2, ddt); S.speed = damp(S.speed, vT, 3, ddt);
      S.kick = Math.max(0, S.kick - ddt * 1.5); S.relax = Math.max(0, S.relax - ddt * 0.55);
      S.redKick = Math.max(0, S.redKick - ddt * 1.2);
      S.flash = Math.max(0, S.flash - ddt * S.flashDecay);
      // veias: decaem; no pico de estresse alto, ficam um pouco
      const veinHold = sT > 0.92 ? 0.22 : 0;
      S.veins = Math.max(veinHold, S.veins - ddt * 0.4);
      // batimento (mesma fórmula do áudio)
      S.phase += ddt * heartBpm(bars.anxiety) / 60; S.phase -= Math.floor(S.phase);
      S.beatEnv = beatEnv(S.phase);
    }

    // ---- aplica nos overlays
    const pulse = S.beatEnv * S.tun;
    const open = clamp(S.relax * 0.35, 0, 0.35);
    const tunAmt = clamp(S.tun - open, 0, 1);
    const pulseAmp = S.reduced ? 0.01 : 0.035;
    const scale = 1.6 - 0.86 * clamp(tunAmt + S.kick * 0.25, 0, 1) - pulse * pulseAmp * 3;
    const throb = S.reduced ? 0 : (S.red > 0.8 ? 0.08 * Math.sin(state.time.real * 14) : 0);
    ov.apply({
      tunnel: clamp(tunAmt * 0.98 + S.kick * 0.1, 0, 1), tunnelScale: Math.max(0.7, scale),
      red: clamp(S.red * 0.95 + S.redKick * 0.35 + throb, 0, 1),
      cold: S.cold * 0.95, speed: S.speed * 0.5, veins: S.veins * 0.9,
      flash: S.flash, flashColor: S.flashColor,
    }, dt, S.reduced);

    // ---- tremida da câmera pelo estresse alto (sutil)
    if (live && !S.reduced && sT > 0.35) {
      S.shakeT -= ddt;
      if (S.shakeT <= 0) { S.shakeT = 0.14; cameraRig.shake(0.012 + 0.05 * (sT - 0.35) / 0.65 * w, 0.2); }
    }

    // ---- partículas
    if (live) emitDrive(ddt);
    const cam = cameraRig.camera, visH = cam.top - cam.bottom;
    S.parts.update(ddt, view.renderer.domElement.height / Math.max(1, visH));
    if (S.sparks) S.sparks.update(ddt, view.renderer.domElement.height / Math.max(1, visH));
    if (fin || mode === MODE.PLAYING || paused) { /* marcas continuam visíveis */ }
  },
};
