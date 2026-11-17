// MODELO DE HUMOR (puro: sem DOM, sem three, sem ctx). mood.js monta as entradas a partir do jogo,
// chama stepMood/moodEvent e aplica as saídas (state.mood, player.mods, falas, provocações, fim).
//
// Entradas por passo (inp):
//   { speedKmh, limitKmh, throttle, brake, longAccel, latAccel, turbo, inJunction, inRing,
//     freeAhead (m), lead: { gap, speed (m/s), kind } | null, stoppedAtRed, crosswalkWait, busLaneBeside,
//     elapsed (s), radarAhead (bool), vehicleId }
// Saídas (m.out, drenadas pelo chamador): says[{bank, prio, gestureOnly}], provokes[{amount, radius}],
//   autoHorn, flashLead, takeover, peaks[{who, bar, value}], yawKick (rad)
import { MOOD_BALANCE } from './balance.js';

export const ROLES = {
  davi: { driver: 'davi', passenger: null },
  carona: { driver: 'dono', passenger: 'davi' },
  perigo: { driver: 'davi', passenger: 'dono' },
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth01 = (v, a, b) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function neutralMods() {
  return { steerNoise: 0, steerGain: 1, steerDelay: 0, throttleBias: 0, accelMul: 1, brakeMul: 1, maxSpeedMul: 1, gripMul: 1 };
}

function startBars(B, who, role) {
  if (!who) return null;
  const key = who === 'davi' ? (role === 'driver' ? 'daviDriver' : 'daviPassenger') : (role === 'driver' ? 'donoDriver' : 'donoPassenger');
  const s = B.start[key];
  return { who, role, anxiety: s.anxiety, stress: s.stress, floor: s.floor, peakA: false, peakS: false };
}

export function createMoodModel(mode = 'davi', opts = {}) {
  const B = opts.balance || MOOD_BALANCE;
  const roles = ROLES[mode] || ROLES.davi;
  const driver = startBars(B, roles.driver, 'driver');
  const passenger = startBars(B, roles.passenger, 'passenger');
  const A = B.actions;
  const m = {
    mode, B, rng: opts.rng || Math.random,
    driver, passenger,
    davi: driver.who === 'davi' ? driver : passenger,
    dono: driver.who === 'dono' ? driver : passenger && passenger.who === 'dono' ? passenger : null,
    daviDrives: driver.who === 'davi',
    t: 0, behindSlow: 0, blocked: false, lastStressEvt: -99, desired: 60,
    breathe: { anxLeft: 0, stressLeft: 0, rate: 0, srate: 0, footOff: 0, accelMul: 1, throttleBias: 0, maxSpeedMul: 1 },
    rebound: [],
    slip: { t: 0, dur: 0, sev: 0 },
    actions: {
      horn: { cooldown: 0, max: A.horn.max }, breathe: { cooldown: 0, max: A.breathe.max },
      curse: { cooldown: 0, max: A.curse.max }, flash: { cooldown: 0, max: A.flash.max },
    },
    base: neutralMods(), mods: neutralMods(), ampA: 0, ampS: 0, pull: 0,
    // passageiro Davi (carona)
    outburstCd: 0, danger: false, palpiteT: 2.5, contradictT: 0,
    // dono passageiro (perigo)
    takeoverT: 0, takenOver: false, complainT: 3, hardBrakeT: 0,
    // falas do Davi motorista
    slowLineT: 0.8, idleT: 5, autoHornCd: 0, autoCurseCd: 0,
    stats: { panicSecs: 0, donoCalmSecs: 0, outbursts: 0, avoided: 0, maxBehindSlow: 0, hazards: 0, scrapes: 0, curses: 0, breaths: 0,
      maxDonoAnx: 0, maxDonoStress: 0, peaks: 0 },
    out: { says: [], provokes: [], autoHorn: false, flashLead: false, takeover: false, peaks: [], yawKick: 0 },
  };
  return m;
}

export function drainOut(m) {
  const o = m.out;
  const r = { says: o.says.slice(), provokes: o.provokes.slice(), autoHorn: o.autoHorn, flashLead: o.flashLead, takeover: o.takeover,
    peaks: o.peaks.slice(), yawKick: o.yawKick };
  o.says.length = 0; o.provokes.length = 0; o.peaks.length = 0; o.autoHorn = false; o.flashLead = false; o.takeover = false; o.yawKick = 0;
  return r;
}

/** Soma em uma barra respeitando piso e teto. */
export function addBar(bars, key, v) {
  if (!bars) return;
  bars[key] = clamp(bars[key] + v, bars.floor, 100);
}

const say = (m, bank, prio = 0, gestureOnly = false) => { m.out.says.push({ bank, prio, gestureOnly }); };

function desiredKmh(B, limitKmh) {
  const d = B.desire;
  return (limitKmh > 0 ? Math.max(limitKmh, d.minLimitKmh) : d.noLimitKmh) * d.overLimit;
}

/** Passo de simulação do humor. */
export function stepMood(m, inp, dt) {
  const B = m.B, AX = B.anx, SX = B.str;
  m.t += dt;
  for (const k in m.actions) { const a = m.actions[k]; a.cooldown = Math.max(0, a.cooldown - dt); }
  m.outburstCd = Math.max(0, m.outburstCd - dt);
  m.autoHornCd = Math.max(0, m.autoHornCd - dt); m.autoCurseCd = Math.max(0, m.autoCurseCd - dt);
  m.hardBrakeT = Math.max(0, m.hardBrakeT - dt);

  const speed = Math.max(0, inp.speedKmh || 0), limit = inp.limitKmh || 0;
  const desired = m.desired = desiredKmh(B, limit);
  const free = inp.freeAhead != null ? inp.freeAhead : 150;
  const lead = inp.lead;
  const leadKmh = lead ? lead.speed * 3.6 : 0;
  const blocked = m.blocked = !!(lead && lead.gap < AX.slowGap && leadKmh < desired * AX.slowLeadRatio && speed < leadKmh + 15);
  if (blocked) m.behindSlow += dt; else m.behindSlow = Math.max(0, m.behindSlow - AX.slowDecay * dt);
  if (m.behindSlow > m.stats.maxBehindSlow) m.stats.maxBehindSlow = m.behindSlow;
  const f = clamp((free - AX.freeRoadMinGap) / (AX.freeRoadFullGap - AX.freeRoadMinGap), 0, 1);
  const under = clamp((desired - speed) / desired, 0, 1);
  const waiting = !!(inp.stoppedAtRed || inp.crosswalkWait);
  const davi = m.davi, asPass = davi.role === 'passenger';

  // ---------------- ansiedade do Davi
  let ra = 0;
  if (!blocked && !waiting) {
    if (asPass) {
      ra += B.carona.freeSlow * f * under;
      if (inp.throttle > 0.6 && f > 0.3 && speed < desired) ra -= B.carona.accelRelief;
    } else {
      ra += AX.freeRoadMax * f * under * (1 - AX.freeRoadThrottleCut * (inp.throttle || 0));
    }
    if (free > AX.cruiseMinFree && limit > 0 && speed >= 0.95 * limit) ra -= AX.cruiseRelief * Math.min(1, speed / desired);
    if (speed > 5 && limit > 0 && speed < 0.8 * limit) ra += AX.belowLimit * under;
  }
  if (blocked) {
    const prox = clamp((AX.slowGap - lead.gap) / AX.slowGap, 0, 1);
    ra += (AX.slowBase + AX.slowGrowth * Math.min(m.behindSlow, AX.slowGrowthCap)) * (1 + AX.slowProximity * prox) * (asPass ? B.carona.slowMul : 1);
  }
  if (inp.stoppedAtRed) ra += AX.redLight;
  if (inp.crosswalkWait) ra += AX.crosswalk;
  ra += Math.min(AX.clockMax, AX.clockBase + AX.clockPer300s * (inp.elapsed || 0) / 300);
  if (inp.busLaneBeside) ra += AX.busLaneBeside;
  if (davi.stress > AX.stressCoupleFrom) ra += AX.stressCouple;

  // ---------------- estresse do Davi
  let rs = 0;
  const calm = !blocked && m.t - m.lastStressEvt > SX.calmAfter && !inp.crosswalkWait;
  rs -= calm ? SX.calmDecay : SX.busyDecay;
  if (inp.crosswalkWait) rs += SX.pedSlow;
  if (lead && lead.kind === 'bus' && lead.gap < 25) rs += SX.busLead;
  if (davi.anxiety > SX.anxCoupleFrom) rs += SX.anxCouple;

  addBar(davi, 'anxiety', ra * dt);
  addBar(davi, 'stress', rs * dt);

  // respiração (alívio progressivo) e rebote do xingamento
  const br = m.breathe;
  if (br.anxLeft > 0) { const d = Math.min(br.anxLeft, br.rate * dt); br.anxLeft -= d; addBar(davi, 'anxiety', -d); }
  if (br.stressLeft > 0) { const d = Math.min(br.stressLeft, br.srate * dt); br.stressLeft -= d; addBar(davi, 'stress', -d); }
  br.footOff = Math.max(0, br.footOff - dt);
  for (let i = m.rebound.length - 1; i >= 0; i--) {
    const r = m.rebound[i];
    r.delay -= dt;
    if (r.delay > 0) continue;
    const d = Math.min(r.left, r.rate * dt); r.left -= d; addBar(r.bars, 'stress', d);
    if (r.left <= 1e-6) m.rebound.splice(i, 1);
  }

  // ---------------- papéis
  if (m.mode === 'carona') stepCarona(m, inp, dt, { blocked, f, under, speed, limit, desired });
  if (m.mode === 'perigo') stepPerigo(m, inp, dt, { speed, limit, lead });
  if (m.daviDrives) stepDaviDriverLines(m, inp, dt, { blocked, f, under, speed, limit, free, lead });

  // ---------------- efeitos no volante
  computeMods(m, inp, dt, blocked);

  // ---------------- picos
  for (const b of [m.driver, m.passenger]) {
    if (!b) continue;
    for (const [key, flag] of [['anxiety', 'peakA'], ['stress', 'peakS']]) {
      if (!b[flag] && b[key] >= B.peak.at) {
        b[flag] = true; m.stats.peaks++; m.out.peaks.push({ who: b.who, bar: key, value: b[key] });
        if (b.who === 'davi' && b.role === 'driver') say(m, key === 'anxiety' ? 'peakAnx' : 'peakStress', 1);
      } else if (b[flag] && b[key] < B.peak.rearm) b[flag] = false;
    }
  }
  return m;
}

function stepCarona(m, inp, dt, c) {
  const C = m.B.carona, davi = m.davi, dono = m.dono;
  // dono volta a zero sozinho
  addBar(dono, 'anxiety', -C.donoDecay * dt); addBar(dono, 'stress', -C.donoDecay * dt);
  if (dono.anxiety < 3 && dono.stress < 3) m.stats.donoCalmSecs += dt;
  // surto evitado
  if (!m.danger && davi.stress >= C.dangerAt) m.danger = true;
  else if (m.danger && davi.stress < C.safeBelow) { m.danger = false; m.stats.avoided++; }
  // surto
  if (davi.stress >= C.outburstAt && m.outburstCd <= 0) outburst(m, false);
  // contradição agendada
  if (m.contradictT > 0) { m.contradictT -= dt; if (m.contradictT <= 0) say(m, 'pContradict', 1); }
  // palpites quase contínuos
  m.palpiteT -= dt;
  if (m.palpiteT <= 0) {
    const [lo, hi] = C.palpiteEvery;
    m.palpiteT = (lo + (hi - lo) * m.rng()) * (1.15 - 0.5 * davi.anxiety / 100);
    let bank = 'pInstr';
    if (inp.brake > 0.5 && c.speed > 15 && !(inp.lead && inp.lead.gap < 20)) bank = 'pBrake';
    else if (c.blocked) bank = m.rng() < 0.45 ? 'pGo' : 'pBlocked';
    else if (c.f > 0.4 && c.under > 0.3) bank = 'pFreeSlow';
    else if (c.limit > 0 && c.speed >= 0.95 * c.limit && c.f > 0.5 && m.rng() < 0.4) bank = 'pFast';
    else if (m.rng() < 0.25) bank = 'pGo';
    const gestureOnly = m.rng() < C.gestureChance;
    say(m, bank, 0, gestureOnly);
    if (bank === 'pGo' && !gestureOnly && m.rng() < 0.35) m.contradictT = 1.3;
    addBar(dono, 'anxiety', C.palpiteDonoAnx);
  }
}

function outburst(m, ring) {
  const C = m.B.carona, davi = m.davi, dono = m.dono;
  m.outburstCd = C.outburstCd; m.danger = false; m.stats.outbursts++;
  say(m, ring ? 'pRingSurto' : 'pOutburst', 1);
  m.out.provokes.push({ amount: C.outburstProvoke, radius: C.outburstRadius });
  addBar(davi, 'stress', C.outburstVent);
  addBar(dono, 'stress', C.outburstDonoStress); addBar(dono, 'anxiety', C.outburstDonoAnx);
  say(m, dono.stress > 40 ? 'oAnnoyed' : 'oCalm', 0);
}

function stepPerigo(m, inp, dt, c) {
  const P = m.B.perigo, dono = m.dono, davi = m.davi;
  let ra = 0, rs = 0, scared = false;
  const over = c.limit > 0 ? (c.speed - c.limit) / c.limit : 0;
  if (over > P.overLimitFrom) { ra += P.overLimit * Math.min(over, 1.5); scared = true; }
  const ms = c.speed / 3.6;
  const tailgating = c.lead && ms > 5.5 && c.lead.gap / ms < P.tailgateHeadway;
  if (tailgating) { ra += P.tailgate * (1 - (c.lead.gap / ms) / P.tailgateHeadway); scared = true; }
  const decel = -(inp.longAccel || 0);
  const hardBrake = decel > P.hardBrake && c.speed > 20;
  if (hardBrake) { ra += P.hardBrakeRate * Math.min(1, (decel - P.hardBrake) / P.hardBrake + 0.3); scared = true;
    if (m.hardBrakeT <= 0) { m.hardBrakeT = 1.5; say(m, 'oHardBrake', 1); } }
  const lat = Math.abs(inp.latAccel || 0);
  if (lat > P.corner) { ra += P.cornerRate * (lat - P.corner); scared = true; }
  if (c.speed > P.fastKmh) { ra += P.fast; scared = true; }
  const turbo = (inp.turbo || 0) > 0.85 && (inp.throttle || 0) > 0.6;
  if (turbo) { rs += P.turbo; scared = true; }
  if (dono.anxiety > P.panicFromSusto) rs += P.panicRate;
  if (scared) m.lastSustoT = m.t;
  if (!scared && m.t - (m.lastSustoT || -99) > P.calmAfter) { ra -= P.anxDecay; rs -= P.stressDecay; }
  addBar(dono, 'anxiety', ra * dt); addBar(dono, 'stress', rs * dt);
  m.stats.panicSecs += Math.max(0, (dono.anxiety + dono.stress) / 2 - 20) / 80 * dt;
  m.stats.maxDonoAnx = Math.max(m.stats.maxDonoAnx, dono.anxiety); m.stats.maxDonoStress = Math.max(m.stats.maxDonoStress, dono.stress);

  // tomar o carro
  if (dono.anxiety >= P.takeoverAt && dono.stress >= P.takeoverAt) m.takeoverT += dt;
  else m.takeoverT = Math.max(0, m.takeoverT - dt);
  if (m.takeoverT >= P.takeoverHold && !m.takenOver) { m.takenOver = true; m.out.takeover = true; say(m, 'oTakeover', 1); }

  // reclamações -> sobem o estresse do Davi (círculo vicioso)
  m.complainT -= dt;
  const lvlRaw = Math.max(dono.anxiety, dono.stress);
  if (lvlRaw >= P.complainFrom && m.complainT <= 0) {
    const lvl = clamp((lvlRaw - P.complainFrom) / (100 - P.complainFrom), 0, 1);
    const [lo, hi] = P.complainEvery;
    m.complainT = hi - (hi - lo) * lvl;
    let bank = 'oPanic';
    if (m.takeoverT > 0) bank = 'oTakeover';
    else if (inp.radarAhead && over > 0) bank = 'oRadar';
    else if (tailgating) bank = 'oTailgate';
    else if (turbo) bank = 'oTurbo';
    else if (lat > P.corner) bank = 'oCorner';
    else if (over > 0.1 && m.rng() < 0.6) bank = 'oOverLimit';
    say(m, bank, 0, m.rng() < 0.12);
    addBar(davi, 'stress', P.complainDaviStress + P.complainDaviStressPerLevel * lvl);
  }
}

function stepDaviDriverLines(m, inp, dt, c) {
  const S = m.B.speech, davi = m.davi, FX = m.B.fx;
  if (c.blocked) {
    m.slowLineT -= dt;
    if (m.slowLineT <= 0) {
      let lvl = m.behindSlow < 4 ? 0 : m.behindSlow < 10 ? 1 : m.behindSlow < 16 ? 2 : 3;
      if (davi.stress > 80) lvl = Math.max(lvl, 2);
      m.slowLineT = S.slowLineEvery - lvl * 0.3;
      say(m, 'slow' + lvl, 0, m.rng() < S.gestureChance);
    }
  } else {
    m.slowLineT = Math.min(m.slowLineT, 0.8);
    if (inp.stoppedAtRed) say(m, 'red');
    else if (inp.crosswalkWait) say(m, 'crosswalk');
    else if (inp.busLaneBeside) say(m, 'busLane');
    else if (c.lead && c.lead.kind === 'bus' && c.lead.gap < 25) say(m, 'bus');
    else if (c.f > 0.5 && c.under > 0.4 && davi.anxiety > 45) say(m, 'freeSlow');
    else if (c.limit > 0 && c.speed >= 0.95 * c.limit && c.free > 80 && davi.anxiety < 40) say(m, 'cruise');
    else if ((inp.elapsed || 0) > 120 && davi.anxiety > 50) say(m, 'clock');
    m.idleT -= dt;
    if (m.idleT <= 0) { const [lo, hi] = S.idleLineEvery; m.idleT = lo + (hi - lo) * m.rng(); say(m, 'idle', 0, m.rng() < S.gestureChance); }
  }
  // buzina e xingamento automáticos (estresse alto)
  const s = smooth01(davi.stress, FX.effectFrom, 100);
  if (s > FX.autoHornFrom && c.lead && c.lead.gap < 25 && m.autoHornCd <= 0 && m.rng() < FX.autoHornChance * dt) {
    m.autoHornCd = FX.autoHornCd; m.out.autoHorn = true;
  }
  if (s > FX.autoCurseFrom && m.autoCurseCd <= 0 && (c.blocked || m.t - m.lastStressEvt < 2)) {
    m.autoCurseCd = FX.autoCurseCd; m.stats.curses++;
    say(m, 'curse', 1);
    m.out.provokes.push({ amount: m.B.actions.curse.provoke, radius: m.B.actions.curse.radius });
    addBar(davi, 'stress', FX.autoCurseRelief);
    m.rebound.push({ bars: davi, delay: m.B.actions.curse.reboundDelay, left: FX.autoCurseRebound, rate: FX.autoCurseRebound / m.B.actions.curse.reboundDur });
  }
}

function computeMods(m, inp, dt, blocked) {
  const FX = m.B.fx, base = m.base, mods = m.mods;
  const a = m.daviDrives ? smooth01(m.driver.anxiety, FX.effectFrom, 100) : 0;
  const s = m.daviDrives ? smooth01(m.driver.stress, FX.effectFrom, 100) : 0;
  const k = Math.min(1, FX.smoothRate * dt);
  m.ampA += (a - m.ampA) * k; m.ampS += (s - m.ampS) * k;
  const A = m.ampA, S = m.ampS;
  base.steerNoise = A * FX.steerNoiseAnx + S * FX.steerNoiseStress;
  base.steerGain = 1 + S * FX.steerGain;
  base.steerDelay = S * FX.steerDelay;
  base.brakeMul = 1 - S * FX.brakeMul;
  base.throttleBias = (inp.speedKmh || 0) > FX.throttleBiasMinKmh && !(inp.brake > 0) ? A * FX.throttleBias : 0;
  base.accelMul = 1; base.maxSpeedMul = 1; base.gripMul = 1;
  const pullT = m.daviDrives && blocked && A > FX.pullFrom ? FX.pullBase + FX.pullAnx * A : 0;
  m.pull += (pullT - m.pull) * k;
  Object.assign(mods, base);
  // tirar o pé (respirar)
  const br = m.breathe;
  if (br.footOff > 0) { mods.accelMul *= br.accelMul; mods.maxSpeedMul *= br.maxSpeedMul; mods.throttleBias = Math.min(mods.throttleBias, br.throttleBias); }
  // escorregão
  const sl = m.slip;
  if (sl.t > 0) {
    sl.t = Math.max(0, sl.t - dt);
    const env = sl.dur > 0 ? sl.t / sl.dur : 0;
    const SL = m.B.slip;
    const grip = Math.max(SL.gripMin, 1 - SL.gripLoss * sl.sev);
    mods.gripMul *= 1 - (1 - grip) * env;
    mods.steerNoise += SL.steerNoise * Math.min(1, sl.sev) * env;
  }
}

/**
 * Evento externo/ação. type: overtaken | cutOff | honked | flashed | tailgated | nearMiss | fine | hazard | scrape |
 * playerOvertook | signalRun | horn | breathe | curse | flash. inp = últimas entradas (inJunction/inRing/speedKmh/vehicleId).
 * Ações retornam true se aceitas (fora do cooldown).
 */
export function moodEvent(m, type, p = {}, inp = {}) {
  const B = m.B, SX = B.str, davi = m.davi, dono = m.dono, AC = B.actions;
  const drv = m.daviDrives, carona = m.mode === 'carona', perigo = m.mode === 'perigo';
  const stressEvt = (v) => { addBar(davi, 'stress', v); m.lastStressEvt = m.t; };
  switch (type) {
    case 'overtaken': {
      const moto = p.kind === 'moto';
      stressEvt(SX.overtaken + SX.overtakenPerKmh * Math.max(0, p.relKmh || 0) + (moto ? SX.overtakenMoto : 0));
      addBar(davi, 'anxiety', B.anx.overtaken);
      say(m, drv ? (moto ? 'overtakenMoto' : 'overtaken') : 'pOvertaken', 1, m.rng() < 0.2);
      return true;
    }
    case 'cutOff': {
      const ring = !!(inp.inRing || inp.inJunction);
      stressEvt(SX.cutOff * (ring ? SX.cutOffRingMul : 1));
      if (carona && ring) { davi.stress = 100; m.outburstCd = 0; outburst(m, true); }
      else say(m, drv ? (ring ? 'cutOffRing' : 'cutOff') : 'pCutOff', 1, m.rng() < 0.2);
      return true;
    }
    case 'honked': stressEvt(SX.honked); say(m, drv ? 'honked' : 'pHonked', 1); return true;
    case 'flashed': stressEvt(SX.flashed); if (drv) say(m, 'flashed', 1); return true;
    case 'tailgated': stressEvt(SX.tailgated); if (drv) say(m, 'tailgated', 1); return true;
    case 'nearMiss':
      stressEvt(SX.nearMiss);
      if (perigo) { addBar(dono, 'stress', B.perigo.nearMiss); say(m, 'oNearMiss', 1); }
      say(m, drv ? 'nearMiss' : 'pNearMiss', 1);
      return true;
    case 'fine':
      stressEvt(SX.fine);
      if (perigo) { addBar(dono, 'stress', B.perigo.fine); say(m, 'oFine', 1); }
      say(m, drv ? (p.by === 'agent' ? 'fineAgent' : 'fineRadar') : 'pFine', 1);
      if (carona) addBar(dono, 'anxiety', B.carona.palpiteDonoAnx);
      return true;
    case 'hazard': {
      const SL = B.slip, kind = p.kind === 'jaca' ? 'jaca' : 'manga';
      stressEvt(SX.hazard[kind]);
      m.stats.hazards++;
      const spd = p.speedKmh != null ? p.speedKmh : inp.speedKmh || 0;
      const sev = clamp(Math.max(SL.minSpeedSev, spd / SL.speedRef) * (SL.kind[kind] || 1) * (SL.vehicle[inp.vehicleId] || 1), 0, SL.maxSev);
      m.slip.sev = sev; m.slip.dur = SL.durBase + SL.durPerSev * sev; m.slip.t = m.slip.dur;
      m.out.yawKick += SL.yawKick * sev * (m.rng() < 0.5 ? -1 : 1);
      if (perigo) { addBar(dono, 'stress', B.perigo.hazard); say(m, 'oHazard', 1); }
      say(m, drv ? kind : 'pHazard', 1);
      return true;
    }
    case 'scrape':
      stressEvt(SX.scrape); m.stats.scrapes++;
      if (perigo) { addBar(dono, 'stress', B.perigo.scrape); say(m, 'oScrape', 1); }
      say(m, drv ? 'scrape' : 'pScrape', 1);
      return true;
    case 'playerOvertook':
      addBar(davi, 'anxiety', -(B.anx.overtook + B.anx.overtookPerSlowSec * m.behindSlow));
      m.behindSlow = 0;
      say(m, drv ? 'overtook' : 'pFast', 1, m.rng() < 0.2);
      return true;
    case 'signalRun': {
      const red = p.state === 'red';
      if (perigo) { addBar(dono, 'stress', red ? B.perigo.redRun : B.perigo.yellowRun); say(m, red ? 'oRed' : 'oYellow', 1); }
      if (carona) { say(m, red ? 'pRed' : 'pYellow', 1); addBar(dono, 'anxiety', B.carona.palpiteDonoAnx); }
      return true;
    }
    // ---------------- ações do jogador
    case 'horn': {
      const a = m.actions.horn; if (a.cooldown > 0) return false;
      a.cooldown = a.max;
      addBar(davi, 'stress', carona ? AC.carona.horn.daviStress : AC.horn.stress);
      m.out.provokes.push({ amount: AC.horn.provoke, radius: AC.horn.radius });
      if (drv) say(m, 'horn', 1);
      return true;
    }
    case 'breathe': {
      const a = m.actions.breathe; if (a.cooldown > 0) return false;
      a.cooldown = a.max; m.stats.breaths++;
      const br = m.breathe, X = AC.breathe;
      const anx = carona ? AC.carona.breathe.daviAnxiety : X.anxiety, st = carona ? AC.carona.breathe.daviStress : X.stress;
      br.anxLeft = -anx; br.rate = -anx / X.spread; br.stressLeft = -st; br.srate = -st / X.spread;
      br.footOff = carona ? AC.carona.breathe.footOff : X.footOff;
      br.accelMul = carona ? AC.carona.breathe.accelMul : X.accelMul;
      br.throttleBias = X.throttleBias; br.maxSpeedMul = X.maxSpeedMul;
      say(m, drv ? 'breathe' : 'oCalm', 1);
      return true;
    }
    case 'curse': {
      const a = m.actions.curse; if (a.cooldown > 0) return false;
      a.cooldown = a.max; m.stats.curses++;
      const X = AC.curse;
      if (carona) {
        addBar(davi, 'stress', AC.carona.curse.daviStress);
        m.rebound.push({ bars: davi, delay: X.reboundDelay, left: AC.carona.curse.rebound, rate: AC.carona.curse.rebound / X.reboundDur });
        addBar(dono, 'stress', AC.carona.curse.donoStress);
      } else {
        addBar(davi, 'stress', X.stress);
        m.rebound.push({ bars: davi, delay: X.reboundDelay, left: X.rebound, rate: X.rebound / X.reboundDur });
        say(m, 'curse', 1);
        if (perigo) { addBar(dono, 'stress', AC.perigoCurseDonoStress); say(m, 'oCurseReact', 0); }
      }
      m.out.provokes.push({ amount: X.provoke, radius: X.radius });
      return true;
    }
    case 'flash': {
      const a = m.actions.flash; if (a.cooldown > 0) return false;
      a.cooldown = a.max; m.out.flashLead = true;
      addBar(davi, 'stress', AC.flash.stress);
      if (m.behindSlow > 0) addBar(davi, 'anxiety', AC.flash.anxietyIfBlocked);
      return true;
    }
    default: return false;
  }
}
