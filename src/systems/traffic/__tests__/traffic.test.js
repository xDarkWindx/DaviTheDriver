// Testes da IA de trânsito em Node puro (sem navegador):  node src/systems/traffic/__tests__/traffic.test.js
// (opcional: MINUTOS=10 node ... para simular mais tempo no teste longo)
// Nada de coordenadas fixas: posições de teste saem dos dados da malha (spawnPoints, sinais, faixas, balões).
import assert from 'node:assert/strict';
import { MAP } from '../../../world/mapData.js';
import { RoadNetwork } from '../../../world/roadNetwork.js';
import { SignalController } from '../../../world/signals.js';
import { EventBus, EV } from '../../../core/events.js';
import { obbVsObb, makeOBB, makeContact } from '../../../core/collision.js';
import { TrafficSim, LEAD } from '../sim.js';

const net = new RoadNetwork(MAP);
const DT = 1 / 60;
let fails = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`  ok   ${name} (${Date.now() - t0} ms)`); } catch (e) { fails++; console.log(`  FAIL ${name}\n       ${e.stack.split('\n').slice(0, 3).join('\n       ')}`); }
}
function makePlayer(x, z, heading = 0) {
  return { phys: { x, z, heading, vx: 0, vz: 0, speed: 0 }, vehicle: { length: 3.68, width: 1.579, massKg: 783 } };
}
function makeSim(signals, opts = {}) {
  const events = new EventBus();
  const sig = signals || new SignalController(net, events);
  const sim = new TrafficSim({ net, signals: sig, events, EV, maxVehicles: opts.max || 40, maxPedestrians: 24 });
  return { sim, events, sig };
}
const fakeSignals = (state) => ({ st: state, stateForLane(l) { return l.signal ? this.st : null; }, isPedWalk() { return this.st === 'red'; }, timeToChange() { return 10; }, update() {} });

/** Ponto FORA da pista, ao lado de um spawnPoint de uma via do tipo `kind` (o jogador "estaciona" ali). */
function parkingSpot(kind, k = 0) {
  const sps = net.spawnPoints.filter((p) => { const l = net.lanes[p.laneId]; const s = net.getSegment(l.segId); return s.kind === kind; });
  for (let i = k * 7; i < sps.length; i++) {
    const p = sps[(i * 37) % sps.length];
    for (const off of [30, 40, 55]) {
      const x = p.x + Math.cos(p.heading) * off, z = p.z - Math.sin(p.heading) * off;
      if (!net.isOnRoad(x, z) && net.clearance(x, z, 40) > 6) return { x, z };
    }
  }
  throw new Error('sem ponto fora da pista para ' + kind);
}

/** Pares de IA sobrepostos (exceto viadutos). Retorna lista de "id-id". */
const _a = makeOBB(), _b = makeOBB(), _c = makeContact();
function overlaps(sim, out) {
  const vs = sim.vehicles;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const a = vs[i], b = vs[j];
    if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14) continue;
    const la = a.w.lane, lb = b.w.lane;
    if (la.segId && lb.segId && la.segId !== lb.segId && net.isGradeSeparated(la.segId, lb.segId)) continue;
    _a.x = a.x; _a.z = a.z; _a.hx = a.width / 2 - 0.1; _a.hz = a.length / 2 - 0.15; _a.angle = a.heading;
    _b.x = b.x; _b.z = b.z; _b.hx = b.width / 2 - 0.1; _b.hz = b.length / 2 - 0.15; _b.angle = b.heading;
    if (obbVsObb(_a, _b, _c) && _c.depth > 0.35) out.push({ key: Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id), a, b, depth: _c.depth });
  }
  return out;
}

console.log(`trânsito: ${net.lanes.length} faixas, ${net.crosswalks.length} faixas de pedestre, ${net.roundabouts.length} balões, ${net.spawnPoints.length} spawns`);

// ---------------------------------------------------------------- longo: seguimento, presos, desempenho
const MIN = Number(process.env.MINUTOS || 6);
test(`${MIN} min simulados em 4 regiões: sem engavetamento, ninguém preso para sempre`, () => {
  const { sim, sig } = makeSim();
  const spots = [parkingSpot('urban', 0), parkingSpot('eixo', 0), parkingSpot('urban', 3), parkingSpot('local', 0)];
  const player = makePlayer(spots[0].x, spots[0].z);
  sim.setPlayer(player);
  sim.reset({ seed: 1234, timeOfDay: 'tarde' });
  const pairSeen = new Map(), stopT = new Map();
  let worstStop = 0, worstWho = '', steps = 0, maxActive = 0, tStep = 0, nStep = 0, tMax = 0;
  const N = Math.round(MIN * 60 / DT);
  const ov = [];
  let rearEnds = 0, crossings = 0;
  for (let i = 0; i < N; i++) {
    if (i % Math.round(N / spots.length) === 0) { const s = spots[(i / Math.round(N / spots.length)) | 0] || spots[0]; player.phys.x = s.x; player.phys.z = s.z; if (i) sim.reset({ seed: 1234 + i, timeOfDay: 'tarde' }); }
    sig.update(DT);
    const t0 = performance.now();
    sim.step(DT);
    const dtm = performance.now() - t0;
    if (sim.vehicles.length >= sim.maxV * 0.95 && i > 600) { tStep += dtm; nStep++; if (dtm > tMax) tMax = dtm; }
    steps++;
    maxActive = Math.max(maxActive, sim.vehicles.length);
    ov.length = 0; overlaps(sim, ov);
    for (const o of ov) if (!pairSeen.has(o.key)) {
      pairSeen.set(o.key, o);
      const same = o.a.w.lane.id === o.b.w.lane.id || o.a.path.slice(0, o.a.pathN).includes(o.b.w.lane.id) || o.b.path.slice(0, o.b.pathN).includes(o.a.w.lane.id);
      if (same) rearEnds++; else crossings++;
      if (process.env.VERBOSE) console.log('      sobreposição', o.key, same ? 'mesma faixa' : 'cruzando', o.a.persona, o.a.w.lane.id, o.a.w.lane.isConnector, o.b.persona, o.b.w.lane.id, o.b.w.lane.isConnector, o.depth.toFixed(2), 'lead', o.a.leadKind, o.b.leadKind, 'ghost', o.a.ghostT > 0, o.b.ghostT > 0);
    }
    for (const v of sim.vehicles) {
      const t = v.speed < 0.3 ? (stopT.get(v.id) || 0) + DT : 0;
      stopT.set(v.id, t);
      if (t > worstStop) {
        worstStop = t; worstWho = `${v.persona} na faixa ${v.w.lane.id} (${v.w.lane.name}) lead=${v.leadKind}`;
        if (process.env.VERBOSE && t > 40 && Math.abs(t % 5) < DT) {
          let u = v, chain = [];
          for (let g = 0; g < 8 && u; g++) { chain.push(`${u.id}:${u.persona}@${u.w.lane.id}${u.w.lane.isConnector ? 'c' : ''} s=${u.w.s.toFixed(1)} v=${u.speed.toFixed(1)} lk=${u.leadKind} gap=${u.leadGap.toFixed(1)} legit=${u.waitLegit}`); u = u.leadSlot >= 0 ? sim.veh[u.leadSlot] : null; }
          console.log('      parada longa:', chain.join(' -> '));
        }
      }
    }
  }
  const avg = tStep / Math.max(1, nStep);
  console.log(`       ${steps} passos, até ${maxActive} veículos ativos; spawns ${sim.stats.spawned}, despawns ${sim.stats.despawned}, fantasmas ${sim.stats.ghosted}, presos removidos ${sim.stats.stuckRemoved}`);
  console.log(`       sobreposições IA×IA: ${rearEnds} na mesma faixa/caminho, ${crossings} cruzando; maior parada contínua ${worstStop.toFixed(1)} s (${worstWho})`);
  console.log(`       custo do passo com a frota cheia: média ${avg.toFixed(3)} ms, pior ${tMax.toFixed(2)} ms (${nStep} amostras)`);
  assert.ok(maxActive >= sim.maxV * 0.75, 'frota não encheu: ' + maxActive);
  assert.equal(rearEnds, 0, 'engavetamento na mesma faixa');
  assert.ok(crossings <= Math.max(2, MIN), 'muitas sobreposições em cruzamentos: ' + crossings);
  assert.ok(worstStop < 120, 'IA presa por ' + worstStop.toFixed(0) + ' s: ' + worstWho);
});

// ---------------------------------------------------------------- semáforo vermelho
test('para no sinal vermelho e sai no verde', () => {
  const sig = fakeSignals('red');
  const { sim } = makeSim(sig);
  const lane = net.lanes.find((l) => l.signal && !l.isConnector && l.length > 90 && l.kind === 'normal');
  const far = parkingSpot('eixo');
  const player = makePlayer(far.x, far.z); sim.setPlayer(player);
  sim.autoSpawn = false; sim.reset({ seed: 5 });
  const v = sim.spawn('normal', 'sedan', lane.id, lane.length - 80, { exact: true, speed: 13 });
  for (let i = 0; i < 60 * 15; i++) sim.step(DT);
  assert.equal(v.w.lane.id, lane.id, 'atravessou o vermelho');
  const front = v.w.s + v.length / 2;
  assert.ok(v.speed < 0.2, 'não parou: ' + v.speed);
  assert.ok(front <= sim.laneStop[lane.id] + 0.2 && front > sim.laneStop[lane.id] - 4, `parou longe da linha: frente ${front.toFixed(1)} vs ${sim.laneStop[lane.id].toFixed(1)}`);
  sig.st = 'green';
  for (let i = 0; i < 60 * 10; i++) sim.step(DT);
  assert.notEqual(v.w.lane.id, lane.id, 'não saiu no verde');
});

// ---------------------------------------------------------------- faixa de pedestre
test('para na faixa de pedestre ocupada e segue depois', () => {
  const { sim } = makeSim(fakeSignals('green'));
  const cw = net.crosswalks.find((c) => !c.auto && c.laneHits.some((h) => h.s > 90));
  const hit = cw.laneHits.find((h) => h.s > 90);
  const far = parkingSpot('local'); sim.setPlayer(makePlayer(far.x, far.z));
  sim.autoSpawn = false; sim.reset({ seed: 9 });
  const v = sim.spawn('normal', 'hatch', hit.laneId, hit.s - 70, { exact: true, speed: 12 });
  const p = sim.debugSpawnPed(cw.id, true);
  p.speed = 0.6; // devagar, para a travessia durar
  let minGap = 1e9, crossedWhileOcc = false;
  for (let i = 0; i < 60 * 30; i++) {
    sim.step(DT);
    const front = v.w.lane.id === hit.laneId ? v.w.s + v.length / 2 : 1e9;
    if (p.state === 'crossing' && v.w.lane.id === hit.laneId) { minGap = Math.min(minGap, hit.s - front); if (front > hit.s - 1) crossedWhileOcc = true; }
    if (p.state !== 'crossing' && !p.active && v.w.lane.id !== hit.laneId) break;
  }
  assert.ok(!crossedWhileOcc, 'passou por cima da faixa ocupada');
  assert.ok(minGap > 1.5 && minGap < 12, 'parada estranha antes da faixa: ' + minGap.toFixed(1));
  assert.ok(v.active && (v.w.lane.id !== hit.laneId || v.w.s > hit.s), 'não seguiu depois que o pedestre passou');
});

test('pedestre que espera na faixa sem semáforo acaba atravessando (os carros param)', () => {
  const { sim } = makeSim(fakeSignals('green'));
  const cw = net.crosswalks.find((c) => !c.auto && net.getSegment(c.segId).kind === 'urban');
  const hit = cw.laneHits[0];
  const far = parkingSpot('local'); sim.setPlayer(makePlayer(far.x, far.z));
  sim.autoSpawn = false; sim.reset({ seed: 11 });
  for (let k = 0; k < 4; k++) sim.spawn('normal', 'sedan', hit.laneId, Math.max(5, hit.s - 40 - k * 25), { exact: true, speed: 12 });
  const p = sim.debugSpawnPed(cw.id, false);
  let crossed = false;
  for (let i = 0; i < 60 * 40 && !crossed; i++) { sim.step(DT); if (p.state === 'crossing') crossed = true; }
  assert.ok(crossed, 'pedestre nunca atravessou');
});

// ---------------------------------------------------------------- rotatória
test('preferência no balão: quem entra espera quem já está circulando', () => {
  const { sim } = makeSim(fakeSignals('green'));
  const far = parkingSpot('local'); sim.setPlayer(makePlayer(far.x, far.z));
  let checked = 0;
  for (let ai = 0; ai < net.lanes.length && checked < 3; ai++) {
    if (sim.laneRing[ai] < 0) continue;
    const app = net.lanes[ai]; if (app.length < 40) continue;
    const rb = net.roundabouts[sim.laneRing[ai]];
    // faixa do anel que chega ao mesmo nó
    const ringLane = net.lanes.find((l) => sim.laneOnRing[l.id] === sim.laneRing[ai] && l.segId && l.endNode === app.endNode && l.length > 30);
    if (!ringLane) continue;
    sim.autoSpawn = false; sim.reset({ seed: 21 + ai });
    const entering = sim.spawn('normal', 'sedan', app.id, app.length - 12, { exact: true, speed: 6 });
    const circ = sim.spawn('normal', 'sedan', ringLane.id, Math.max(0, ringLane.length - 10), { exact: true, speed: 9 });
    let circPassed = -1, entered = -1;
    for (let i = 0; i < 60 * 12; i++) {
      sim.step(DT);
      if (circPassed < 0 && circ.w.lane.id !== ringLane.id) circPassed = i;
      if (entered < 0 && entering.w.lane.id !== app.id) entered = i;
    }
    assert.ok(entered > 0, `não entrou no ${rb.name}`);
    assert.ok(circPassed >= 0 && entered >= circPassed, `${rb.name}: entrou (${entered}) antes de quem circulava passar (${circPassed})`);
    checked++;
  }
  assert.ok(checked > 0, 'nenhum balão testado');
});

// ---------------------------------------------------------------- eventos do jogador
test('ultrapassagem, fechada e colisão com o jogador geram eventos', () => {
  const { sim, events } = makeSim(fakeSignals('green'));
  const lane = net.lanes.find((l) => !l.isConnector && l.kind === 'normal' && l.length > 400 && net.siblingLanes(l).length >= 2 && net.lanes[net.siblingLanes(l)[0]].kind === 'normal');
  const o = net.sampleLane(lane, 60, {});
  const player = makePlayer(o.x, o.z, o.heading);
  sim.setPlayer(player); sim.autoSpawn = false; sim.reset({ seed: 3 });
  const got = {};
  for (const k of ['OVERTAKEN', 'CUT_OFF', 'COLLISION', 'PLAYER_OVERTOOK', 'TAILGATED', 'HONKED_AT', 'NEAR_MISS']) events.on(EV[k], (p) => { (got[k] = got[k] || []).push(p); });
  // jogador a 8 m/s; apressado vem atrás pela faixa ao lado
  const sib = net.siblingLanes(lane), other = sib.find((id) => id !== lane.id);
  const fast = sim.spawn('apressado', 'sedan', other, 20, { exact: true, speed: 18 });
  for (let i = 0; i < 60 * 6; i++) {
    const ph = player.phys; ph.vx = Math.sin(ph.heading) * 8; ph.vz = Math.cos(ph.heading) * 8;
    const r = net.laneAt(ph.x, ph.z, ph.heading, {}); const q = net.sampleLane(r.lane, r.s + 8 * DT, {}); ph.x = q.x; ph.z = q.z; ph.heading = q.heading;
    sim.step(DT);
  }
  assert.ok(got.OVERTAKEN && got.OVERTAKEN.length >= 1, 'sem OVERTAKEN');
  assert.ok(got.OVERTAKEN[0].id === fast.id && (got.OVERTAKEN[0].side === 'left' || got.OVERTAKEN[0].side === 'right'));
  // colisão: jogador acerta a traseira de um carro parado
  sim.debugClear();
  const stopped = sim.debugSpawn('sedan', 9, 0, { speed: 0 });
  stopped.crashT = 99; // fica parado
  for (let i = 0; i < 60 * 2 && !got.COLLISION; i++) {
    const ph = player.phys; ph.vx = Math.sin(ph.heading) * 6; ph.vz = Math.cos(ph.heading) * 6; ph.x += ph.vx * DT; ph.z += ph.vz * DT;
    sim.step(DT);
  }
  assert.ok(got.COLLISION && got.COLLISION[0].b === 'vehicle' && got.COLLISION[0].playerAtFault === true && got.COLLISION[0].impactKmh > 10, 'colisão: ' + JSON.stringify(got.COLLISION && got.COLLISION[0]));
  console.log('       eventos:', Object.entries(got).map(([k, v]) => `${k}×${v.length}`).join(' '));
});

test('fiscalização e frutas sorteadas por semente (reprodutível)', () => {
  const { sim } = makeSim(fakeSignals('green'));
  const far = parkingSpot('local'); sim.setPlayer(makePlayer(far.x, far.z)); sim.autoSpawn = false;
  sim.reset({ seed: 77 });
  const a = JSON.stringify([sim.radars.map((r) => r.id), sim.agents.map((r) => r.id), sim.hazards.map((h) => [h.kind, h.x.toFixed(2)])]);
  sim.reset({ seed: 78 });
  const b = JSON.stringify([sim.radars.map((r) => r.id), sim.agents.map((r) => r.id)]);
  sim.reset({ seed: 77 });
  const c = JSON.stringify([sim.radars.map((r) => r.id), sim.agents.map((r) => r.id), sim.hazards.map((h) => [h.kind, h.x.toFixed(2)])]);
  assert.equal(a, c); assert.notEqual(a.slice(0, b.length), b);
  assert.ok(sim.radars.length > 0 && sim.agents.length >= 2 && sim.hazards.length >= 5);
  const ag = sim.revealAgent(sim.agents[0].id);
  for (let i = 0; i < 150; i++) sim.step(DT);
  assert.ok(ag.revealed && Math.hypot(ag.x - ag.standX, ag.z - ag.standZ) < 0.01, 'agente não saiu do esconderijo');
});

console.log(fails ? `\n${fails} FALHA(S)` : '\ntudo ok');
process.exit(fails ? 1 : 0);
