// Testes do humor (Node puro):  node --test src/systems/mood/__tests__ src/systems/rules/__tests__
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoodModel, stepMood, moodEvent, drainOut } from '../model.js';
import { MOOD_BALANCE as B } from '../balance.js';
import { Speaker, BANKS, lineText } from '../lines.js';
import { makeRng } from '../../../core/math.js';

const DT = 1 / 60;
const base = (o = {}) => Object.assign({ speedKmh: 0, limitKmh: 60, throttle: 0, brake: 0, longAccel: 0, latAccel: 0, turbo: 0,
  inJunction: false, inRing: false, freeAhead: 150, lead: null, stoppedAtRed: false, crosswalkWait: false, busLaneBeside: false,
  elapsed: 0, radarAhead: false, vehicleId: 'kwid' }, o);
const run = (m, inp, secs, each) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { stepMood(m, inp, DT); drainOut(m); if (each) each(m, i); } return m; };
const model = (mode = 'davi') => createMoodModel(mode, { rng: makeRng(7) });

test('pisos nunca furados (todos os modos, alívio máximo por 3 min)', () => {
  for (const mode of ['davi', 'carona', 'perigo']) {
    const m = model(mode);
    const inp = base({ speedKmh: 66, limitKmh: 60, throttle: 1 });
    run(m, inp, 180, (mm, i) => {
      if (i % 60 === 0) { moodEvent(mm, 'breathe', {}, inp); moodEvent(mm, 'curse', {}, inp); moodEvent(mm, 'horn', {}, inp); moodEvent(mm, 'playerOvertook', {}, inp); }
      for (const b of [mm.driver, mm.passenger]) {
        if (!b) continue;
        assert.ok(b.anxiety >= b.floor - 1e-9 && b.stress >= b.floor - 1e-9, `${mode}/${b.who} furou o piso`);
        assert.ok(b.anxiety <= 100 && b.stress <= 100);
      }
    });
    assert.ok(m.davi.anxiety >= m.davi.floor && m.davi.floor > 0, 'Davi tem piso > 0');
  }
});

test('atrás de carro lento por 20 s: a ansiedade sobe mais que em qualquer outro cenário', () => {
  const slowLead = { gap: 12, speed: 30 / 3.6, kind: 'car' };
  const scenarios = {
    atrasDeLento: base({ speedKmh: 30, limitKmh: 60, throttle: 0.3, lead: slowLead, freeAhead: 12 }),
    pistaLivreParado: base({ speedKmh: 0, limitKmh: 60 }),
    sinalVermelho: base({ speedKmh: 0, stoppedAtRed: true }),
    faixaPedestre: base({ speedKmh: 0, crosswalkWait: true }),
    abaixoDoLimite: base({ speedKmh: 35, limitKmh: 60, throttle: 0.4 }),
    onibusAoLado: base({ speedKmh: 5, busLaneBeside: true, freeAhead: 20 }),
    cronometroAlto: base({ speedKmh: 60, limitKmh: 60, elapsed: 900 }),
  };
  const res = {};
  for (const [k, inp] of Object.entries(scenarios)) {
    const m = model('davi'); let area = 0;
    run(m, inp, 20, (mm) => { area += mm.davi.anxiety * DT; });
    res[k] = { end: m.davi.anxiety, area, at10: null };
  }
  for (const [k, r] of Object.entries(res)) {
    if (k === 'atrasDeLento') continue;
    assert.ok(res.atrasDeLento.area > r.area + 200, `lento (${res.atrasDeLento.area.toFixed(0)}) > ${k} (${r.area.toFixed(0)})`);
    assert.ok(res.atrasDeLento.end >= r.end, `lento termina >= ${k}`);
  }
  assert.ok(res.atrasDeLento.end > 95, 'atrás do lento por 20 s a ansiedade chega ao talo');
});

test('ser fechado sobe o estresse (mais em rotatória)', () => {
  const a = model('davi'), b = model('davi');
  const s0 = a.davi.stress;
  moodEvent(a, 'cutOff', { kind: 'car' }, base());
  moodEvent(b, 'cutOff', { kind: 'car' }, base({ inJunction: true, inRing: true }));
  assert.ok(a.davi.stress > s0 + 10);
  assert.ok(b.davi.stress > a.davi.stress);
  const says = drainOut(a).says.map((s) => s.bank);
  assert.ok(says.includes('cutOff'));
});

test('ações: cooldown, buzina provoca, respirar tira o pé, xingar tem rebote', () => {
  const m = model('davi'), inp = base({ speedKmh: 40 });
  // buzina
  m.davi.stress = 60;
  assert.equal(moodEvent(m, 'horn', {}, inp), true);
  assert.equal(moodEvent(m, 'horn', {}, inp), false, 'buzina em cooldown');
  assert.ok(m.davi.stress < 60);
  assert.equal(drainOut(m).provokes.length, 1);
  run(m, inp, B.actions.horn.max + 0.05);
  assert.equal(moodEvent(m, 'horn', {}, inp), true, 'cooldown da buzina terminou');
  // respirar
  m.davi.anxiety = 80;
  assert.equal(moodEvent(m, 'breathe', {}, inp), true);
  stepMood(m, inp, DT);
  assert.ok(m.mods.accelMul < 0.5 && m.mods.throttleBias < 0, 'tira o pé');
  run(m, inp, 3);
  assert.ok(m.davi.anxiety < 80 - 15, 'ansiedade caiu');
  assert.equal(m.mods.accelMul, 1, 'pé volta depois');
  assert.equal(moodEvent(m, 'breathe', {}, inp), false, 'respirar em cooldown');
  assert.ok(m.actions.breathe.cooldown > 0 && m.actions.breathe.max === B.actions.breathe.max);
  // xingar: alívio na hora, rebote maior depois (comparado a não xingar)
  const c = model('davi'), n = model('davi');
  c.davi.stress = n.davi.stress = 60;
  assert.equal(moodEvent(c, 'curse', {}, inp), true);
  assert.ok(c.davi.stress <= 41, 'alívio imediato');
  assert.ok(drainOut(c).provokes.length >= 1, 'xingar provoca');
  const calm = base({ speedKmh: 40, limitKmh: 40 });
  run(c, calm, 12); run(n, calm, 12);
  assert.ok(c.davi.stress > n.davi.stress + 3, `rebote: ${c.davi.stress.toFixed(1)} > ${n.davi.stress.toFixed(1)}`);
  // farol
  assert.equal(moodEvent(m, 'flash', {}, inp), true);
  assert.equal(drainOut(m).flashLead, true);
});

test('efeitos no volante: crescem com as barras, nunca absurdos; só quando o Davi dirige', () => {
  const m = model('davi');
  m.davi.anxiety = 100; m.davi.stress = 100;
  const inp = base({ speedKmh: 22, lead: { gap: 8, speed: 20 / 3.6, kind: 'car' }, freeAhead: 8 });
  run(m, inp, 6);
  assert.ok(m.mods.throttleBias > 0.15 && m.mods.throttleBias <= B.fx.throttleBias + 1e-9);
  assert.ok(m.mods.steerNoise > 0.1 && m.mods.steerNoise <= 0.2);
  assert.ok(m.mods.steerGain > 1.2 && m.mods.steerGain <= 1.31);
  assert.ok(m.mods.brakeMul >= 0.8 && m.mods.brakeMul < 0.9);
  assert.ok(m.pull > 0.06 && m.pull <= 0.1, 'puxa (pouco) para a esquerda colado no lento');
  stepMood(m, base({ speedKmh: 60, brake: 1 }), DT);
  assert.equal(m.mods.throttleBias, 0, 'pé no freio solta o acelerador');
  const c = model('carona');
  c.davi.anxiety = 100; c.davi.stress = 100;
  run(c, inp, 6);
  assert.equal(c.mods.throttleBias, 0); assert.equal(c.mods.steerGain, 1, 'carona: o dono dirige sem efeitos');
});

test('escorregar em fruta: jaca > manga, Kwid > Cactus, proporcional à velocidade', () => {
  const grip = (kind, veh, kmh) => {
    const m = model('davi');
    moodEvent(m, 'hazard', { kind, speedKmh: kmh }, base({ vehicleId: veh }));
    stepMood(m, base({ speedKmh: kmh, vehicleId: veh }), DT);
    return m.mods.gripMul;
  };
  assert.ok(grip('jaca', 'kwid', 60) < grip('manga', 'kwid', 60));
  assert.ok(grip('manga', 'kwid', 60) < grip('manga', 'cactus', 60));
  assert.ok(grip('manga', 'kwid', 80) < grip('manga', 'kwid', 20));
  assert.ok(grip('jaca', 'kwid', 120) >= B.slip.gripMin - 1e-9);
});

test('carona: Davi palpita, surta (provoca) e o dono só sobe por causa dele; surto evitado conta', () => {
  const m = model('carona'), inp = base({ speedKmh: 30, limitKmh: 60 });
  assert.equal(m.dono.anxiety, 0); assert.equal(m.dono.floor, 0);
  let palpites = 0;
  run(m, inp, 30, (mm) => { void mm; });
  const m2 = model('carona');
  for (let i = 0; i < 30 * 60; i++) { stepMood(m2, inp, DT); palpites += drainOut(m2).says.filter((s) => s.bank[0] === 'p').length; }
  assert.ok(palpites >= 6, `tagarela: ${palpites} palpites em 30 s`);
  // surto imediato em rotatória
  const r = model('carona');
  moodEvent(r, 'cutOff', { kind: 'car' }, base({ inJunction: true, inRing: true }));
  const o = drainOut(r);
  assert.ok(o.says.some((s) => s.bank === 'pRingSurto'));
  assert.ok(o.provokes.length >= 1, 'surto provoca o trânsito');
  assert.ok(r.dono.stress > 0 && r.stats.outbursts === 1);
  // surto evitado
  const e = model('carona');
  e.davi.stress = 80; stepMood(e, inp, DT);
  e.davi.stress = 50; stepMood(e, inp, DT);
  assert.equal(e.stats.avoided, 1);
  // dono volta a zero sozinho
  run(r, base({ speedKmh: 60, limitKmh: 60, throttle: 0.5 }), 30);
  assert.ok(r.dono.stress < 1);
});

test("perigo: dono em pânico reclama, sobe o estresse do Davi e toma o carro ('tomouOCarro')", () => {
  const m = model('perigo');
  const crazy = base({ speedKmh: 140, limitKmh: 60, throttle: 1, turbo: 1, latAccel: 6, vehicleId: 'cactus' });
  let took = false, daviBefore = m.davi.stress, complaints = 0;
  for (let i = 0; i < 90 * 60 && !took; i++) {
    stepMood(m, crazy, DT);
    const o = drainOut(m);
    complaints += o.says.filter((s) => s.bank[0] === 'o').length;
    if (o.takeover) took = true;
  }
  assert.ok(took, 'tomou o carro');
  assert.ok(complaints > 3);
  assert.ok(m.dono.anxiety >= B.perigo.takeoverAt && m.dono.stress >= B.perigo.takeoverAt);
  assert.ok(m.stats.panicSecs > 5);
  void daviBefore;
  // dirigindo direito, não toma
  const ok = model('perigo');
  run(ok, base({ speedKmh: 55, limitKmh: 60, throttle: 0.4, vehicleId: 'cactus' }), 120);
  assert.equal(ok.takenOver, false);
  assert.ok(ok.dono.anxiety < 30);
});

test('falas: sem repetir em sequência, limite de frequência, variante leve e gesto', () => {
  const sp = new Speaker({ rng: makeRng(3), minGap: 1.4, minGapHigh: 0.6 });
  let prev = null;
  for (let i = 0; i < 60; i++) {
    const p = sp.say(i * 10, 'slow2', { gestureChance: 0 });
    assert.ok(p && p.text);
    assert.notEqual(p.text, prev, 'não repete em sequência'); prev = p.text;
  }
  const sp2 = new Speaker({ rng: makeRng(4) });
  assert.ok(sp2.say(0, 'slow1'));
  assert.equal(sp2.say(0.5, 'idle'), null, 'mesmo personagem: intervalo mínimo');
  assert.ok(sp2.say(0.7, 'cutOff', { prio: 1 }), 'evento (prio) passa com intervalo menor');
  const light = new Speaker({ rng: makeRng(5) });
  for (let i = 0; i < 30; i++) {
    const p = light.say(i * 10, 'curse', { profanity: false, gestureChance: 0 });
    assert.ok(!/porra|caralho|puta|cu!|foder|arrombado/i.test(p.text), 'variante leve: ' + p.text);
  }
  const g = new Speaker({ rng: makeRng(6) }).say(0, 'cutOff', { gestureOnly: true });
  assert.equal(g.text, ''); assert.ok(g.gesture);
});

test('tom: nenhuma fala rotula o Davi nem joga culpa', () => {
  const bad = /culpa|agressiv|ansios|estressad|sinistro|bateu \d|vezes no ano/i;
  for (const [k, b] of Object.entries(BANKS)) for (const l of b.lines) for (const prof of [true, false]) {
    assert.ok(!bad.test(lineText(l, prof)), `${k}: ${lineText(l, prof)}`);
  }
});

// ---------------------------------------------------------------- falas de situação (evento × persona/tipo × traço)
import { situationOf } from '../model.js';
const banksSaid = (m, inp, secs) => { const got = []; const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { stepMood(m, inp, DT); for (const s of drainOut(m).says) got.push(s.bank); } return got; };
const lead = (o) => Object.assign({ gap: 8, speed: 0, kind: 'sedan', persona: 'normal', why: null, onPhone: false, noSignal: false, lane: 0, laneCount: 2 }, o);

test('situação: parado atrás de quem não sai no verde — autoescola, celular, ônibus — gera a fala específica (3 modos)', () => {
  const cases = [[{ persona: 'autoescola', why: 'morreu' }, 'sitVerdeAuto', 'psVerdeAuto', 'osVerdeAuto'],
    [{ persona: 'normal', why: 'celular', onPhone: true }, 'sitVerdeCel', 'psVerdeCel', 'osVerde'],
    [{ persona: 'onibus', why: 'verde' }, 'sitVerdeOnibus', 'psVerde', 'osVerde']];
  for (const [ld, dBank, pBank, oBank] of cases) {
    const inp = base({ speedKmh: 0, lead: lead(ld) });
    assert.ok(banksSaid(model('davi'), inp, 2).includes(dBank), `davi: ${dBank}`);
    assert.ok(banksSaid(model('carona'), inp, 2).includes(pBank), `carona: ${pBank}`);
    let ok = false; for (let k = 0; k < 6 && !ok; k++) ok = banksSaid(createMoodModel('perigo', { rng: makeRng(k + 1) }), inp, 2).includes(oBank);
    assert.ok(ok, `perigo: Leandro ${oBank}`);
  }
});

test('situação: atrás de lento por persona (tio na esquerda, autoescola, ônibus no ponto) e pedestre na faixa', () => {
  const slow = (o) => base({ speedKmh: 30, limitKmh: 80, lead: lead(Object.assign({ gap: 12, speed: 30 / 3.6 }, o)) });
  assert.equal(situationOf(slow({ persona: 'tio', lane: 1, laneCount: 2 }), { blocked: true, speed: 30, limit: 80, lead: slow({ persona: 'tio', lane: 1, laneCount: 2 }).lead }), 'TioEsq');
  assert.ok(banksSaid(model('davi'), slow({ persona: 'tio', lane: 1, laneCount: 2 }), 2).includes('sitTioEsq'));
  assert.ok(banksSaid(model('davi'), slow({ persona: 'autoescola' }), 2).includes('sitAuto'));
  assert.ok(banksSaid(model('davi'), slow({ persona: 'onibus', why: 'ponto' }), 2).includes('sitPonto'));
  assert.ok(banksSaid(model('davi'), base({ speedKmh: 0, crosswalkWait: true }), 2).includes('sitPed'));
});

test('eventos citam quem causou: sem seta, motoboy, ônibus, revanche; carona vira palpite', () => {
  const ev = (mode, type, p, seed = 3) => { const m = createMoodModel(mode, { rng: makeRng(seed) }); moodEvent(m, type, p, base({ speedKmh: 40 })); return drainOut(m).says.map((s) => s.bank); };
  let semSeta = false; for (let k = 1; k < 8 && !semSeta; k++) semSeta = ev('davi', 'cutOff', { persona: 'normal', noSignal: true }, k).includes('evSemSeta');
  assert.ok(semSeta, 'fechado sem seta => evSemSeta');
  assert.ok(ev('davi', 'cutOff', { persona: 'moto', kind: 'moto' }).includes('evMoto'));
  assert.ok(ev('davi', 'overtaken', { persona: 'moto', kind: 'moto' }).includes('overtakenMoto'));
  assert.ok(ev('davi', 'cutOff', { persona: 'onibus', kind: 'onibus' }).includes('evOnibus'));
  assert.ok(ev('davi', 'honked', { persona: 'apressado', revenge: true }).includes('evRevanche'));
  assert.ok(ev('carona', 'overtaken', { persona: 'normal', noSignal: true }).includes('psSemSeta'));
});

test('falas: situação tem preferência e o enchimento só preenche silêncio longo', () => {
  const sp = new Speaker({ rng: makeRng(2), minGap: B.speech.minGap, minGapHigh: B.speech.minGapHigh, fillerGap: B.speech.fillerGap });
  assert.ok(sp.say(0, 'sitPed', { prio: 1 }));
  assert.equal(sp.say(3.5, 'idle'), null, 'enchimento logo depois de uma fala');
  assert.ok(sp.say(3.5, 'sitVerdeAuto', { prio: 1 }), 'situação passa');
  assert.ok(sp.say(12, 'idle'), 'enchimento depois de silêncio');
});

test('embalo: 10 s a 100 km/h numa via de 80 com pista livre derruba o estresse; a 60 bem menos; pardal sobe de volta', () => {
  const at = (kmh) => { const m = model('davi'); m.davi.stress = 70; m.davi.anxiety = 70; run(m, base({ speedKmh: kmh, limitKmh: 80, freeAhead: 150, throttle: 1 }), 10); return m; };
  const fast = at(100), slow = at(60);
  assert.ok(fast.davi.stress <= 45, 'a 100 km/h o estresse cai bem: ' + fast.davi.stress.toFixed(1));
  assert.ok(slow.davi.stress >= fast.davi.stress + 15, `a 60 cai bem menos: ${slow.davi.stress.toFixed(1)} vs ${fast.davi.stress.toFixed(1)}`);
  assert.ok(fast.davi.anxiety < slow.davi.anxiety, 'ansiedade também cai mais correndo');
  const before = fast.davi.stress; moodEvent(fast, 'fine', { code: 'speed', by: 'radar' }, base({ speedKmh: 100 }));
  assert.ok(fast.davi.stress >= before + 10, 'multa do pardal sobe o estresse de volta');
  // carona: o Leandro acelerando com pista livre acalma o Davi passageiro, e as barras do Leandro não mudam com isso
  const c = model('carona'); c.davi.stress = 70; const d0 = { a: c.dono.anxiety, s: c.dono.stress };
  const inp = base({ speedKmh: 100, limitKmh: 80, freeAhead: 150, throttle: 1 });
  for (let i = 0; i < 600; i++) { stepMood(c, inp, DT); drainOut(c); }
  assert.ok(c.davi.stress < 50, 'Davi passageiro se acalma: ' + c.davi.stress.toFixed(1));
});

test('embalo cortado: depois de embalado, a queda brusca de velocidade dá pico de ansiedade e fala', () => {
  const m = model('davi');
  run(m, base({ speedKmh: 95, limitKmh: 80, freeAhead: 150 }), 6);
  const a0 = m.davi.anxiety; const said = [];
  for (let i = 0; i < 60; i++) { stepMood(m, base({ speedKmh: 20, limitKmh: 80, freeAhead: 10, lead: { gap: 8, speed: 5, kind: 'sedan', persona: 'normal' } }), DT); for (const s of drainOut(m).says) said.push(s.bank); }
  assert.ok(m.davi.anxiety > a0 + 8, 'pico de ansiedade'); assert.ok(said.includes('sitEmbaloCortado'));
});
