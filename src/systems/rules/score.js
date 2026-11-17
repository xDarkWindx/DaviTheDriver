// PONTUAÇÃO durante a viagem (puro). Zona de equilíbrio + multiplicador.
//   davi/perigo: zona nas barras do Davi (motorista) — as DUAS dentro de [lo, hi] = pontos e multiplicador subindo;
//                qualquer uma acima de hi derruba o multiplicador.
//   carona:      zona = dono tranquilo [0, hi] (é o que a HUD desenha nas barras do motorista) e Davi abaixo de daviCeil.
import { RULES_BALANCE } from './balance.js';

export function createScore(mode = 'davi', B = RULES_BALANCE) {
  const S = B.score, z = S.zone[mode] || S.zone.davi;
  return {
    B, mode, points: 0, multiplier: S.multBase[mode] || 1, inZone: false, above: false,
    zoneLo: z.lo, zoneHi: z.hi, zoneTime: 0, time: 0, panicAcc: 0, breaks: 0,
  };
}

/** bars = { davi: {anxiety, stress}, dono: {anxiety, stress} | null } */
export function stepScore(sc, bars, dt) {
  const S = sc.B.score, mode = sc.mode, z = S.zone[mode] || S.zone.davi;
  const base = S.multBase[mode] || 1, max = S.multMax[mode] || 4;
  const d = bars.davi, o = bars.dono;
  let inZone, above;
  if (mode === 'carona' && o) {
    const donoOk = o.anxiety <= z.hi && o.stress <= z.hi;
    const daviOk = d.anxiety <= z.daviCeil && d.stress <= z.daviCeil;
    inZone = donoOk && daviOk; above = !inZone;
  } else {
    inZone = d.anxiety >= z.lo && d.anxiety <= z.hi && d.stress >= z.lo && d.stress <= z.hi;
    above = d.anxiety > z.hi || d.stress > z.hi;
  }
  if (above && !sc.above) { sc.multiplier = Math.max(base, sc.multiplier * S.multDropOnBreak); sc.breaks++; }
  sc.above = above; sc.inZone = inZone;
  sc.time += dt;
  if (inZone) {
    sc.zoneTime += dt;
    sc.multiplier = Math.min(max, sc.multiplier + S.multGain * dt);
    let rate = S.rate * sc.multiplier;
    if (mode === 'perigo' && o) rate *= 1 - S.perigoPanicCut * ((o.anxiety + o.stress) / 200);
    sc.points += rate * dt;
  } else {
    if (above) sc.multiplier = Math.max(base, sc.multiplier - S.multDecay * dt);
    sc.points += S.outRate * dt;
  }
  if (mode === 'carona' && o && o.anxiety < 3 && o.stress < 3) sc.points += S.donoZeroRate * dt;
  if (o) sc.panicAcc += (o.anxiety + o.stress) / 2 * dt;
  return sc;
}

export function penalize(sc, pts) { sc.points = Math.max(0, sc.points - pts); }

/** Copia para state.score (formato da UI). */
export function writeScore(sc, out) {
  out.points = Math.round(sc.points); out.multiplier = Math.round(sc.multiplier * 10) / 10;
  out.inZone = sc.inZone; out.zoneLo = sc.zoneLo; out.zoneHi = sc.zoneHi;
  return out;
}
