// Testes de regras (Node puro):  node --test src/systems/mood/__tests__ src/systems/rules/__tests__
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFineDetector, stepFines, speedBand } from '../fines.js';
import { createScore, stepScore } from '../score.js';
import { buildResult } from '../result.js';
import { RULES_BALANCE as B } from '../balance.js';
import { EV } from '../../../core/events.js';
import rules from '../../rules.js';
import mood from '../../mood.js';
import { makeCtx, fakeTraffic } from './fakes.js';

const DT = 1 / 60;
// Dirige em linha reta para o sul (heading 0 => +Z) de z0 a z1 a `kmh`, chamando stepFines a cada passo.
function drive(det, opts) {
  const { z0 = -50, z1 = 50, x = 0, kmh = 50, limitKmh = 50, radars = [], agents = [], approaches = [], crosswalks = [], onBusLane = false, t0 = 0 } = opts;
  const v = kmh / 3.6, fines = [], runs = [];
  let z = z0, pz = null, t = t0;
  while (z <= z1) {
    const snap = { t, x, z, px: pz == null ? null : x, pz, heading: 0, speedKmh: kmh, limitKmh, onBusLane, radars, agents, approaches, crosswalks };
    const o = stepFines(det, snap, DT);
    fines.push(...o.fines.map((f) => ({ ...f }))); runs.push(...o.signalRuns.map((r) => ({ ...r })));
    for (const id of o.reveal) fines[fines.length - 1].revealed = id;
    pz = z; z += v * DT; t += DT;
    if (v === 0 && t - t0 > (opts.secs || 0)) break;
  }
  return { fines, runs, t };
}

test('pardal: três faixas de excesso, tolerância e sem repetir', () => {
  assert.equal(speedBand(B, 56, 50), null, 'dentro da tolerância (7 km/h)');
  assert.equal(speedBand(B, 60, 50), 'speed20');
  assert.equal(speedBand(B, 75, 50), 'speed50');
  assert.equal(speedBand(B, 90, 50), 'speedMax');
  const radar = { id: 'r1', type: 'speed', x: 0, z: 0, heading: 0, range: 30, limitKmh: 50 };
  const a = drive(createFineDetector(), { kmh: 80, radars: [radar] });
  assert.equal(a.fines.length, 1); assert.equal(a.fines[0].code, 'speed'); assert.equal(a.fines[0].by, 'radar');
  assert.equal(a.fines[0].band, '50');
  assert.equal(drive(createFineDetector(), { kmh: 55, radars: [radar] }).fines.length, 0);
  // sentido contrário ao radar: não multa
  assert.equal(drive(createFineDetector(), { kmh: 90, radars: [{ ...radar, heading: Math.PI }] }).fines.length, 0);
  // passar 2x no mesmo radar em poucos segundos: 1 multa só
  const det = createFineDetector();
  const r1 = drive(det, { kmh: 80, radars: [radar] });
  const r2 = drive(det, { kmh: 80, radars: [radar], t0: r1.t + 1 });
  assert.equal(r1.fines.length + r2.fines.length, 1);
});

test('sinal vermelho: radar ou agente multa; sem ninguém vendo, não; amarelo nunca', () => {
  const ap = { key: 's', signalId: 3, group: 0, x: 0, z: 0, heading: 0, latMin: -7, latMax: 3, state: 'red' };
  const none = drive(createFineDetector(), { approaches: [{ ...ap }] });
  assert.equal(none.fines.length, 0); assert.equal(none.runs.length, 1); assert.equal(none.runs[0].seen, false);
  const cam = drive(createFineDetector(), { approaches: [{ ...ap }], radars: [{ id: 'c', type: 'redLight', x: 2, z: 1, signalId: 3 }] });
  assert.equal(cam.fines.length, 1); assert.equal(cam.fines[0].code, 'redLight'); assert.equal(cam.fines[0].by, 'radar');
  const agent = { id: 'ag1', x: 20, z: 0, heading: -Math.PI / 2, range: 60 };   // olhando para oeste (para a via)
  const ag = drive(createFineDetector(), { approaches: [{ ...ap }], agents: [agent] });
  assert.equal(ag.fines.length, 1); assert.equal(ag.fines[0].by, 'agent'); assert.equal(ag.fines[0].revealed, 'ag1');
  const back = drive(createFineDetector(), { approaches: [{ ...ap }], agents: [{ ...agent, heading: Math.PI / 2 }] });
  assert.equal(back.fines.length, 0, 'agente de costas não vê');
  const y = drive(createFineDetector(), { approaches: [{ ...ap, state: 'yellow' }], radars: [{ id: 'c', type: 'redLight', x: 0, z: 0, signalId: 3 }] });
  assert.equal(y.fines.length, 0); assert.equal(y.runs[0].state, 'yellow');
  const g = drive(createFineDetector(), { approaches: [{ ...ap, state: 'green' }], radars: [{ id: 'c', type: 'redLight', x: 0, z: 0, signalId: 3 }] });
  assert.equal(g.fines.length + g.runs.length, 0);
});

test('faixa de pedestre ocupada: sempre multa (agente se viu); vazia: nada', () => {
  const cw = { id: 7, x: 0, z: 0, heading: 0, halfWidth: 8, occupied: true };
  const a = drive(createFineDetector(), { kmh: 40, crosswalks: [cw] });
  assert.equal(a.fines.length, 1); assert.equal(a.fines[0].code, 'crosswalk');
  const b = drive(createFineDetector(), { kmh: 40, crosswalks: [{ ...cw, occupied: false }] });
  assert.equal(b.fines.length, 0);
  const c = drive(createFineDetector(), { kmh: 40, crosswalks: [cw], agents: [{ id: 'a', x: -15, z: 5, heading: Math.PI / 2, range: 50 }] });
  assert.equal(c.fines[0].by, 'agent');
});

test('faixa exclusiva de ônibus: sem ninguém vendo NÃO multa; agente/radar multam após o tempo mínimo', () => {
  // 30 s na faixa, ninguém olhando
  const none = drive(createFineDetector(), { kmh: 40, z0: 0, z1: 330, onBusLane: true });
  assert.equal(none.fines.length, 0);
  // agente escondido vê o trecho
  const agent = { id: 'ag', x: 12, z: 150, heading: -Math.PI / 2, range: 60 };
  const seen = drive(createFineDetector(), { kmh: 40, z0: 0, z1: 330, onBusLane: true, agents: [agent] });
  assert.equal(seen.fines.length, 1); assert.equal(seen.fines[0].code, 'busLane'); assert.equal(seen.fines[0].by, 'agent');
  assert.equal(seen.fines[0].revealed, 'ag');
  // só cruzou (menos que o tempo mínimo) na frente do agente: não multa
  const quick = drive(createFineDetector(), { kmh: 40, z0: 140, z1: 160, onBusLane: true, agents: [agent] });
  assert.equal(quick.fines.length, 0);
  // radar de faixa de ônibus
  const radar = drive(createFineDetector(), { kmh: 40, z0: 0, z1: 120, onBusLane: true, radars: [{ id: 'b', type: 'busLane', x: 0, z: 80, heading: 0, range: 45 }] });
  assert.equal(radar.fines.length, 1); assert.equal(radar.fines[0].by, 'radar');
});

test('agente multa excesso (>20%) no campo de visão', () => {
  const agent = { id: 'a', x: 15, z: 0, heading: -Math.PI / 2, range: 60 };
  assert.equal(drive(createFineDetector(), { kmh: 85, limitKmh: 60, agents: [agent] }).fines.length, 1);
  assert.equal(drive(createFineDetector(), { kmh: 66, limitKmh: 60, agents: [agent] }).fines.length, 0);
});

test('zona de equilíbrio e multiplicador', () => {
  const sc = createScore('davi');
  const inZ = { davi: { anxiety: 35, stress: 35 }, dono: null };
  for (let i = 0; i < 600; i++) stepScore(sc, inZ, DT);
  assert.ok(sc.inZone); assert.ok(sc.multiplier > 2); const m10 = sc.multiplier, p10 = sc.points;
  assert.ok(p10 > 100);
  stepScore(sc, { davi: { anxiety: 80, stress: 35 }, dono: null }, DT);
  assert.ok(!sc.inZone && sc.multiplier <= m10 * 0.5 + 1e-9, 'estourar o teto derruba o multiplicador');
  for (let i = 0; i < 600; i++) stepScore(sc, { davi: { anxiety: 80, stress: 35 }, dono: null }, DT);
  assert.equal(sc.multiplier, B.score.multBase.davi);
  assert.ok(sc.points - p10 < 15, 'fora da zona quase não pontua');
  const pg = createScore('perigo'); assert.equal(pg.multiplier, B.score.multBase.perigo);
  const ca = createScore('carona');
  for (let i = 0; i < 300; i++) stepScore(ca, { davi: { anxiety: 40, stress: 40 }, dono: { anxiety: 0, stress: 0 } }, DT);
  assert.ok(ca.inZone && ca.points > 50, 'carona: dono zerado pontua');
});

test('state.result coerente em cada fim (puro)', () => {
  const sc = createScore('davi'); sc.points = 2000; sc.time = 100; sc.zoneTime = 80;
  const fine = { code: 'speed', label: 'x', amount: 130.16, points: 4, by: 'radar' };
  const ch = buildResult({ reason: 'chegou', mode: 'davi', vehicleId: 'kwid', time: 100, par: 160, score: sc, fines: [] });
  assert.equal(ch.reason, 'chegou'); assert.equal(ch.grade, 'A'); assert.equal(ch.crash, null); assert.equal(ch.yearsLost, null);
  assert.ok(ch.points > 2000, 'bônus de tempo'); assert.ok(ch.title);
  const ch2 = buildResult({ reason: 'chegou', mode: 'davi', time: 100, par: 160, score: sc, fines: [fine, fine, fine] });
  assert.ok(ch2.points < ch.points && ch2.grade > ch.grade, 'multa desconta e piora a nota');
  const bt = buildResult({ reason: 'bateu', mode: 'davi', vehicleId: 'kwid', time: 50, score: sc, fines: [fine],
    crash: { b: 'static', kind: 'pole', impactKmh: 40 }, sinistroNo: 42 });
  assert.equal(bt.grade, 'F'); assert.equal(bt.crash.repairCost, null, 'Kwid: sem orçamento'); assert.equal(bt.crash.sinistroNo, 42);
  assert.ok(bt.points < 2000 * 0.4); assert.equal(bt.fines.length, 1);
  assert.ok(bt.crash.withWhat.includes('poste'));
  const mg = buildResult({ reason: 'bateu', mode: 'perigo', vehicleId: 'cactus', time: 50, score: sc, fines: [],
    crash: { b: 'vehicle', kind: 'bus', impactKmh: 50 }, lastHazard: { kind: 'manga', t: 46 }, now: 50, stats: { panicSecs: 40 } });
  assert.ok(/manga/i.test(mg.crash.excuse), 'causa = manga'); assert.ok(mg.crash.repairCost > 10000);
  assert.ok(mg.crash.repairItems.length >= 6); assert.ok(mg.yearsLost > 2);
  const tk = buildResult({ reason: 'tomouOCarro', mode: 'perigo', vehicleId: 'cactus', time: 70, score: sc, fines: [], stats: { panicSecs: 60 } });
  assert.equal(tk.reason, 'tomouOCarro'); assert.equal(tk.grade, 'F'); assert.ok(tk.yearsLost > 3);
  const ds = buildResult({ reason: 'desistiu', mode: 'carona', time: 30, score: sc, fines: [] });
  assert.equal(ds.grade, 'E'); assert.equal(ds.yearsLost, null);
  for (const r of [ch, bt, mg, tk, ds]) {
    assert.ok(/^[A-F]$/.test(r.grade)); assert.ok(Number.isInteger(r.points) && r.points >= 0);
    const txt = JSON.stringify(r);
    assert.ok(!/culpa|agressiv|ansios|estressad|sinistro n/i.test(txt), 'tom: ' + txt);
  }
});

// ---------------- integração: rules.js + mood.js com o Game real e trânsito falso ----------------
function setup(mode, extra = {}) {
  const traffic = fakeTraffic();
  const h = makeCtx([traffic, rules, mood], extra);
  const got = { finish: null, fines: [], says: [], resultAtFinish: null };
  h.events.on(EV.TRIP_FINISH, (f) => { got.finish = f; got.resultAtFinish = h.state.result; });
  h.events.on(EV.FINE, (f) => got.fines.push(f));
  h.events.on(EV.SAY, (s) => got.says.push(s));
  h.game.startTrip('casa-stj', mode);
  return { ...h, traffic, got };
}

test("integração: 'chegou' tem state.result pronto no TRIP_FINISH", () => {
  const s = setup('davi', { arriveAt: 20 });
  s.phys.speed = 12;
  s.game.advance(25);
  assert.equal(s.got.finish.reason, 'chegou');
  assert.equal(s.got.resultAtFinish.reason, 'chegou');
  assert.ok(s.state.score.points > 0);
  assert.ok(s.got.says.length > 0, 'falou alguma coisa');
  assert.ok(s.state.actions && s.state.actions.breathe.max > 0);
});

test("integração: batida forte => 'bateu' com boletim; raspão não encerra", () => {
  const s = setup('perigo');
  s.game.advance(2);
  s.events.emit(EV.COLLISION, { a: 'player', b: 'static', kind: 'guardrail', impactKmh: 8, x: 0, z: 0 });
  assert.equal(s.state.mode, 'PLAYING', 'raspão não encerra');
  assert.ok(s.state.mood.passenger.stress > 25, 'raspão sobe o pânico do dono');
  s.events.emit(EV.HAZARD_HIT, { kind: 'jaca', x: 0, z: 0, speedKmh: 60 });
  s.game.advance(0.1);
  assert.ok(s.player.mods.gripMul < 0.6, 'jaca: aderência despenca');
  s.events.emit(EV.COLLISION, { a: 'player', b: 'vehicle', kind: 'car', impactKmh: 45, x: 0, z: 0, otherId: 3 });
  assert.equal(s.state.mode, 'FINISHED');
  const r = s.got.resultAtFinish;
  assert.equal(r.reason, 'bateu'); assert.ok(/jaca/i.test(r.crash.excuse)); assert.ok(r.crash.repairCost > 0); assert.ok(r.yearsLost > 0);
  assert.ok(r.crash.sinistroNo >= 2 && r.crash.sinistroNo <= 99);
});

test('integração: atropelar pedestre encerra sempre; encostar devagar é "quase" (susto, multa de faixa, não encerra)', () => {
  const s = setup('carona');
  s.events.emit(EV.COLLISION, { a: 'player', b: 'pedestrian', kind: 'pedestrian', impactKmh: 22, x: 0, z: 0 });
  assert.equal(s.got.finish.reason, 'bateu'); assert.equal(s.got.resultAtFinish.reason, 'bateu');
  const q = setup('perigo');
  const donoBefore = q.state.mood.passenger.stress;
  q.events.emit(EV.COLLISION, { a: 'player', b: 'pedestrian', kind: 'pedestre', impactKmh: 5, soft: true, crosswalkId: 3, x: 0, z: 0 });
  assert.equal(q.got.finish, null, 'quase não encerra');
  assert.equal(q.got.fines.filter((f) => f.code === 'crosswalk').length, 1, 'multa de faixa');
  assert.ok(q.state.mood.passenger.stress > donoBefore + 30, 'pânico alto do Leandro');
  assert.ok(q.got.says.some((x) => x.who === 'dono'), 'Leandro reage');
});

test("integração: perigo dirigindo como louco => 'tomouOCarro'", () => {
  const s = setup('perigo');
  s.state.player.speedLimitKmh = 50;
  const origUpdate = s.player.update.bind(s.player);
  s.player.update = (dt, inp) => { origUpdate(dt, inp); const sp = s.state.player; sp.speedLimitKmh = 50; sp.throttle = 1; sp.turbo = 1; s.phys.latAccel = 6; };
  s.phys.speed = 40; // 144 km/h
  s.game.advance(120);
  assert.equal(s.got.finish && s.got.finish.reason, 'tomouOCarro');
  assert.equal(s.got.resultAtFinish.reason, 'tomouOCarro');
  assert.ok(s.got.resultAtFinish.yearsLost > 1);
  assert.ok(s.got.says.some((x) => x.who === 'dono'), 'dono reclamou');
});

test('integração: multa por radar do trânsito falso, revela agente, desistiu via menu', () => {
  const s = setup('davi');
  s.traffic.agents.push({ id: 'ag9', x: 15, z: 60, heading: -Math.PI / 2, range: 60, revealed: false });
  s.player.update = () => {
    const sp = s.state.player; s.phys.z += (110 / 3.6) / 60;
    sp.x = 0; sp.z = s.phys.z; sp.heading = 0; sp.speedKmh = 110; sp.speedLimitKmh = 60; sp.vehicleId = 'kwid';
  };
  s.game.advance(4);
  assert.ok(s.got.fines.length >= 1); assert.equal(s.got.fines[0].by, 'agent');
  assert.deepEqual(s.traffic.revealed, ['ag9']);
  assert.equal(s.state.fines.length, s.got.fines.length); assert.ok(s.state.fineTotal > 0);
  s.events.emit(EV.REQ_MENU, {});
  assert.equal(s.got.finish.reason, 'desistiu'); assert.equal(s.got.resultAtFinish.reason, 'desistiu');
  assert.equal(s.got.resultAtFinish.fines.length, s.got.fines.length);
});

test('integração: ações H/R/X/F com trânsito falso (provoke/flashLead) e funciona sem trânsito (stub)', () => {
  const s = setup('davi');
  s.events.emit(EV.HORN, { source: 'player' }); s.events.emit(EV.CURSE, { source: 'player' }); s.events.emit(EV.FLASH, { source: 'player' });
  assert.ok(s.traffic.provoked.length >= 2); assert.equal(s.traffic.flashed, 1);
  assert.ok(s.state.actions.curse.cooldown > 0);
  const stub = makeCtx([{ name: 'traffic' }, rules, mood]);
  stub.game.startTrip('stj-casa', 'carona');
  stub.game.advance(10);
  stub.events.emit(EV.HORN, { source: 'player' });
  assert.equal(stub.state.mode, 'PLAYING');
});

test('integração: multa de faixa de pedestre segue o critério POR CORREDOR do trânsito (crosswalkBlockedAt)', () => {
  const run = (blocked) => {
    const s = setup('davi');
    s.ctx.net.crosswalks = [{ id: 7, x: 0, z: 40, heading: 0, halfWidth: 8 }];
    s.traffic.pedestrians.push({ id: 1, x: 0, z: 40, state: 'crossing', crosswalkId: 7 }); // em cima da faixa pintada
    s.traffic.crosswalkBlockedAt = () => blocked;   // o trânsito diz se está no corredor do carro
    s.player.update = () => { const sp = s.state.player; s.phys.z += (40 / 3.6) / 60; sp.x = 0; sp.z = s.phys.z; sp.heading = 0; sp.speedKmh = 40; sp.speedLimitKmh = 60; sp.vehicleId = 'kwid'; };
    s.game.advance(6);
    return s.got.fines.filter((f) => f.code === 'crosswalk').length;
  };
  assert.equal(run(false), 0, 'pedestre fora do corredor (já passou / outra pista) não multa, mesmo em cima da faixa pintada');
  assert.equal(run(true), 1, 'pedestre no corredor (ou entrando) multa');
});
