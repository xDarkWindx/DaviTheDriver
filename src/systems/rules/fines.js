// DETECTOR DE MULTAS (puro: sem ctx). rules.js monta o "snapshot" a cada passo e aplica as multas devolvidas.
//
// snap = { t, x, z, px, pz (posição anterior), heading, speedKmh, limitKmh, onBusLane,
//          radars:  [{ id, type:'speed'|'redLight'|'busLane', x, z, heading?, range?, limitKmh?, signalId? }],
//          agents:  [{ id, x, z, heading?, range }],
//          approaches: [{ key, signalId, group, x, z, heading, latMin, latMax, state:'green'|'yellow'|'red' }],  (linhas de retenção)
//          crosswalks: [{ id, x, z, heading, halfWidth, occupied }] }
// stepFines(det, snap, dt) -> { fines: [...], signalRuns: [...], reveal: [agentId...] }
import { RULES_BALANCE } from './balance.js';

export function createFineDetector(B = RULES_BALANCE) {
  return { B, recent: [], busT: 0, busOffT: 0, busFined: false, out: { fines: [], signalRuns: [], reveal: [] } };
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** O agente enxerga o ponto (x, z)? (alcance e campo de visão) */
export function agentSees(B, a, x, z) {
  const dx = x - a.x, dz = z - a.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > (a.range || 60) * B.agent.rangeMul) return false;
  if (typeof a.heading !== 'number' || d < 1) return true;
  return angleDiff(Math.atan2(dx, dz), a.heading) <= B.agent.fovHalf;
}

/** Cruzou a linha que passa por (lx, lz) perpendicular ao rumo h, no sentido de h? Devolve lateral ou null. */
export function crossedLine(px, pz, x, z, lx, lz, h, bothWays = false) {
  const fx = Math.sin(h), fz = Math.cos(h);
  const d0 = (px - lx) * fx + (pz - lz) * fz, d1 = (x - lx) * fx + (z - lz) * fz;
  const crossed = (d0 < 0 && d1 >= 0) || (bothWays && d0 > 0 && d1 <= 0);
  if (!crossed) return null;
  return (x - lx) * -fz + (z - lz) * fx;   // lateral (+ = direita do rumo)
}

/** Faixa de excesso pela velocidade medida e limite (com tolerância). Retorna chave de B.fines ou null. */
export function speedBand(B, measuredKmh, limitKmh) {
  if (!(limitKmh > 0)) return null;
  const S = B.speed;
  const considered = measuredKmh <= 100 ? measuredKmh - S.tolKmh : measuredKmh * (1 - S.tolPctAbove100);
  const over = (considered - limitKmh) / limitKmh;
  if (over <= 0) return null;
  return over <= 0.2 ? 'speed20' : over <= 0.5 ? 'speed50' : 'speedMax';
}

export function overPct(B, measuredKmh, limitKmh) {
  const S = B.speed;
  const considered = measuredKmh <= 100 ? measuredKmh - S.tolKmh : measuredKmh * (1 - S.tolPctAbove100);
  return limitKmh > 0 ? (considered - limitKmh) / limitKmh : 0;
}

function seenByAgent(B, agents, x, z) {
  for (let i = 0; i < agents.length; i++) if (agentSees(B, agents[i], x, z)) return agents[i];
  return null;
}

function isDup(det, code, x, z, t) {
  const D = det.B.dedupe;
  for (const r of det.recent) if (r.code === code && t - r.t < D.seconds && Math.hypot(r.x - x, r.z - z) < D.meters) return true;
  return false;
}

function addFine(det, key, snap, by, extra) {
  const def = det.B.fines[key];
  if (isDup(det, def.code, snap.x, snap.z, snap.t)) return false;
  det.recent.push({ code: def.code, x: snap.x, z: snap.z, t: snap.t });
  while (det.recent.length > 24) det.recent.shift();
  const f = { code: def.code, label: def.label, amount: def.amount, points: def.points, by, x: snap.x, z: snap.z };
  if (def.band) f.band = def.band;
  if (extra) Object.assign(f, extra);
  det.out.fines.push(f);
  if (by === 'agent' && extra && extra.agentId != null && det.out.reveal.indexOf(extra.agentId) < 0) det.out.reveal.push(extra.agentId);
  return true;
}

export function stepFines(det, snap, dt) {
  const B = det.B, out = det.out;
  out.fines.length = 0; out.signalRuns.length = 0; out.reveal.length = 0;
  const radars = snap.radars || [], agents = snap.agents || [];
  const { px, pz, x, z, heading } = snap;
  const kmh = snap.speedKmh || 0;
  const moved = px != null && (px !== x || pz !== z);

  // ---- 1) pardal de velocidade (ao passar pela linha do radar)
  if (moved && kmh > B.speed.minKmh) {
    for (const r of radars) {
      if (r.type !== 'speed') continue;
      const h = typeof r.heading === 'number' ? r.heading : heading;
      if (Math.cos(heading - h) < B.heading.alignCos) continue;
      const lat = crossedLine(px, pz, x, z, r.x, r.z, h);
      if (lat == null || Math.abs(lat) > Math.min(r.range || B.speed.radarLateral, B.speed.radarLateral)) continue;
      const band = speedBand(B, kmh, r.limitKmh || snap.limitKmh);
      if (band) addFine(det, band, snap, 'radar', { radarId: r.id, measuredKmh: Math.round(kmh), limitKmh: r.limitKmh || snap.limitKmh });
    }
  }

  // ---- 2) agentes: velocidade (radar móvel) no campo de visão
  if (kmh > B.speed.minKmh && snap.limitKmh > 0 && overPct(B, kmh, snap.limitKmh) > B.speed.agentMinOverPct) {
    const a = seenByAgent(B, agents, x, z);
    if (a) addFine(det, speedBand(B, kmh, snap.limitKmh), snap, 'agent', { agentId: a.id, measuredKmh: Math.round(kmh), limitKmh: snap.limitKmh });
  }

  // ---- 3) sinal vermelho (cruzar a linha de retenção no vermelho)
  if (moved && kmh > B.redLight.minKmh) {
    for (const ap of snap.approaches || []) {
      if (Math.cos(heading - ap.heading) < B.redLight.headingCos) continue;
      const lat = crossedLine(px, pz, x, z, ap.x, ap.z, ap.heading);
      if (lat == null || lat < ap.latMin || lat > ap.latMax) continue;
      if (ap.state !== 'red' && ap.state !== 'yellow') continue;
      let by = null, extra = null;
      if (ap.state === 'red') {
        for (const r of radars) {
          if (r.type !== 'redLight') continue;
          if (r.signalId === ap.signalId || Math.hypot(r.x - ap.x, r.z - ap.z) < B.redLight.radarDist) { by = 'radar'; extra = { radarId: r.id }; break; }
        }
        if (!by) { const a = seenByAgent(B, agents, ap.x, ap.z); if (a) { by = 'agent'; extra = { agentId: a.id }; } }
        if (by) addFine(det, 'redLight', snap, by, Object.assign({ signalId: ap.signalId }, extra));
      }
      out.signalRuns.push({ signalId: ap.signalId, group: ap.group, state: ap.state, x, z, seen: !!by });
    }
  }

  // ---- 4) faixa de pedestre ocupada (sempre multa: é Brasília. 'agent' se algum agente viu, senão câmera)
  if (moved && kmh > B.crosswalk.minKmh) {
    for (const cw of snap.crosswalks || []) {
      if (!cw.occupied) continue;
      const lat = crossedLine(px, pz, x, z, cw.x, cw.z, cw.heading, true);
      if (lat == null || Math.abs(lat) > (cw.halfWidth || 8) + 0.5) continue;
      const a = seenByAgent(B, agents, x, z);
      addFine(det, 'crosswalk', snap, a ? 'agent' : 'radar', a ? { agentId: a.id, crosswalkId: cw.id } : { crosswalkId: cw.id });
    }
  }

  // ---- 5) faixa exclusiva de ônibus: só multa se radar 'busLane' ou agente VIU, após tempo mínimo
  if (snap.onBusLane) { det.busT += dt; det.busOffT = 0; }
  else { det.busOffT += dt; if (det.busOffT > B.busLane.offGrace) { det.busT = 0; det.busFined = false; } }
  if (snap.onBusLane && det.busT >= B.busLane.minTime && !det.busFined) {
    let by = null, extra = null;
    for (const r of radars) {
      if (r.type !== 'busLane') continue;
      if (typeof r.heading === 'number' && Math.cos(heading - r.heading) < B.heading.alignCos) continue;
      if (Math.hypot(r.x - x, r.z - z) <= (r.range || B.busLane.radarRange)) { by = 'radar'; extra = { radarId: r.id }; break; }
    }
    if (!by) { const a = seenByAgent(B, agents, x, z); if (a) { by = 'agent'; extra = { agentId: a.id }; } }
    if (by) { det.busFined = true; addFine(det, 'busLane', snap, by, extra); }
  }
  return out;
}
