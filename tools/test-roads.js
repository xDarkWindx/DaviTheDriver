// Testes da API da malha viária (Node puro, sem navegador):  npm test
import { MAP } from '../src/world/mapData.js';
import { RoadNetwork } from '../src/world/roadNetwork.js';
import assert from 'node:assert/strict';

const t0 = Date.now();
const net = new RoadNetwork(MAP);
const ms = Date.now() - t0;
let fails = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '\n      ', e.message); }
}

console.log(`malha: ${net.nodes.size} nós, ${net.segments.size} segmentos, ${net.lanes.length} faixas (${net.lanes.filter((l) => l.isConnector).length} conectores), ` +
  `${net.signals.length} semáforos, ${net.crosswalks.length} faixas de pedestre, ${net.radarSpots.length} radares, ${net.spawnPoints.length} spawns — ${ms} ms`);

test('toda faixa de via tem saída, exceto nas bordas do mapa', () => {
  for (const l of net.lanes) {
    if (l.isConnector) { assert.equal(l.next.length, 1, `conector ${l.id}`); continue; }
    const end = net.getNode(l.endNode);
    if (end.type === 'edge') continue;
    assert.ok(l.next.length > 0, `faixa ${l.id} (${l.segId} dir ${l.dir} idx ${l.index}) termina em ${l.endNode} sem saída`);
  }
});

test('faixas têm comprimento positivo', () => {
  for (const l of net.lanes) assert.ok(l.length > 0.5 || l.isConnector, `faixa ${l.id} ${l.segId} curta: ${l.length}`);
});

const casa = net.snapStart(net.starts.casa), stj = net.snapStart(net.starts.stj);
const toStj = net.laneForZone('stj'), toCasa = net.laneForZone('casa');

test('largadas caem em faixas no sentido certo', () => {
  assert.equal(casa.lane.segId, 'qrsw2');
  assert.equal(stj.lane.segId, 's3_safs');
  assert.ok(Math.abs(casa.heading + Math.PI / 2) < 0.2, 'casa rumo oeste');
  assert.ok(Math.abs(stj.heading + Math.PI / 2) < 0.2, 'stj rumo oeste');
});

const names = (r) => net.routeNames(r).join(' > ');
const hasUturn = (r) => r.some((id) => net.lanes[id].turn === 'uturn');
const segSeq = (r) => [...new Set(r.map((id) => net.lanes[id].segId).filter(Boolean))];
const inOrder = (seq, want) => { let i = 0; for (const x of seq) if (x === want[i]) i++; return i === want.length; };

test('GPS livre: Casa → STJ e STJ → Casa saem pelo Eixo, sem retorno', () => {
  const r1 = net.planRoute(casa.lane.id, casa.s, toStj.targets);
  assert.ok(r1, 'sem rota casa->stj');
  console.log('        casa→stj:', names(r1), `(${net.routeLength(r1, casa.s, toStj.s).toFixed(0)} m)`);
  assert.ok(inOrder(segSeq(r1), ['qrsw2', 'jaq_n', 'eixo_s1_a', 'eixo_s1_b', 'eixo_s1_c', 's2_alca', 's2_a']), segSeq(r1).join(','));
  assert.ok(!hasUturn(r1), 'retorno na rota casa->stj');
  const r2 = net.planRoute(stj.lane.id, stj.s, toCasa.targets);
  assert.ok(r2, 'sem rota stj->casa');
  console.log('        stj→casa:', names(r2), `(${net.routeLength(r2, stj.s, toCasa.s).toFixed(0)} m)`);
  assert.ok(inOrder(segSeq(r2), ['s3_safs', 's2_a', 'alca_rodo', 'eixo_n1', 'jaq_n', 'qrsw2']), segSeq(r2).join(','));
  assert.ok(!hasUturn(r2), 'retorno na rota stj->casa');
  // a primeira faixa da rota segue no sentido da largada (seta não aponta para trás)
  for (const [st, r] of [[casa, r1], [stj, r2]]) {
    const l = net.lanes[r[0]];
    assert.equal(l.segId, st.lane.segId); assert.equal(l.dir, st.lane.dir);
  }
});

test('corredores das 2 rotas × 2 sentidos (planRouteVia)', () => {
  const want = {
    'eixo casa-stj': ['qrsw2', 'jaq_n', 'eixo_s1_a', 'eixo_s1_b', 'eixo_s1_c0', 'eixo_s1_c', 's2_alca', 's2_a', 'l2_n', 's3_safs'],
    'eixo stj-casa': ['s3_safs', 'l2_n', 's2_a', 'alca_rodo', 'eixo_n1', 'jaq_n', 'qrsw2'],
    'parque casa-stj': ['qrsw2', 'jaq_m', 'jaq_s', 'jaq_s2', 'primeira_av', 'parque', 's3_scs', 's3_mid', 's3_mid_e', 's3_saus', 's3_safs'],
    'parque stj-casa': ['s3_safs', 's3_saus', 's3_mid_e', 's3_mid', 's3_scs', 'parque', 'primeira_av', 'jaq_s2', 'jaq_s', 'jaq_m', 'qrsw2'],
  };
  for (const cid of ['eixo', 'parque']) for (const dirId of ['casa-stj', 'stj-casa']) {
    const [st, to] = dirId === 'casa-stj' ? [casa, toStj] : [stj, toCasa];
    const r = net.planRouteVia(st.lane.id, st.s, net.routeCorridors[cid][dirId], to.targets);
    assert.ok(r, `sem rota ${cid} ${dirId}`);
    const L = net.routeLength(r, st.s, to.s);
    console.log(`        ${cid.padEnd(6)} ${dirId}: ${names(r)} (${L.toFixed(0)} m)`);
    assert.ok(!hasUturn(r), `retorno em ${cid} ${dirId}`);
    const seq = segSeq(r).filter((x) => !net.segments.get(x).roundaboutId);
    assert.deepEqual(seq, want[`${cid} ${dirId}`], `${cid} ${dirId}: ${seq.join(',')}`);
    assert.equal(net.lanes[r[0]].dir, st.lane.dir, 'largada no sentido da rota');
  }
});

test('rotas alternativas (W3/tesourinha) existem', () => {
  const w3 = net.getSegment('w3_m').laneIdsF[0];
  const a = net.planRoute(casa.lane.id, casa.s, w3), b = net.planRoute(w3, 0, toStj.targets);
  assert.ok(a && b, 'rota via W3 inexistente');
  const tes = net.getSegment('tes').laneIdsF[0];
  assert.ok(net.planRoute(casa.lane.id, casa.s, tes) && net.planRoute(tes, 0, toStj.targets), 'rota via tesourinha inexistente');
  // trevo Eixo × Eixão: alça Eixo → Eixão Sul dirigível
  const al = net.getSegment('alca_eixao').laneIdsF[0];
  assert.ok(net.planRoute(casa.lane.id, casa.s, al), 'alça Eixo→Eixão');
  assert.ok(net.lanes[al].next.length > 0);
});

test('Av. das Jaqueiras: árvores de avenida e candidatos a fruta', () => {
  const segs = new Set(net.avenueTreeSlots.map((t) => t.segId));
  for (const id of ['jaq_n', 'jaq_m', 'jaq_s', 'jaq_s2']) assert.ok(segs.has(id), 'sem árvores em ' + id);
  assert.ok(net.fruitSpots.length >= 20, 'poucos candidatos: ' + net.fruitSpots.length);
  const kinds = new Set(net.fruitSpots.map((f) => f.fruit));
  assert.ok(kinds.has('manga') && kinds.has('jaca'));
  for (const f of net.fruitSpots) {
    assert.ok(net.isOnRoad(f.x, f.z), 'fruta fora da pista ' + f.id);
    assert.ok(Math.hypot(f.treeX - f.x, f.treeZ - f.z) < 6, 'árvore longe da fruta');
    assert.ok(net.clearance(f.treeX, f.treeZ) > 0.5 && net.clearance(f.treeX, f.treeZ) < 3, 'árvore não está rente à pista');
  }
  console.log(`        ${net.avenueTreeSlots.length} árvores de avenida, ${net.fruitSpots.length} candidatos a fruta`);
});

test('nearestLane respeita o sentido', () => {
  const o = {};
  // Eixo Sul é mão única leste
  const r = net.nearestLane(-300, 40, o, Math.PI / 2);
  assert.ok(r && r.lane.segId === 'eixo_s1_c0', 'esperava eixo_s1_c0, veio ' + (r && r.lane.segId));
  // W3 Sul: rumo norte (heading PI) deve achar faixa dir -1 (to→from)
  const r2 = net.nearestLane(-426, 600, {}, Math.PI);
  assert.ok(r2 && r2.lane.segId === 'w3_m' && r2.lane.dir === -1, 'w3 norte');
  const r3 = net.nearestLane(-434, 600, {}, 0);
  assert.ok(r3 && r3.lane.dir === 1, 'w3 sul');
});

test('roadInfoAt: pista, canteiro, fora', () => {
  const o = {};
  assert.ok(net.roadInfoAt(-300, 40, o).onRoad, 'Eixo Sul');
  assert.equal(o.limitKmh, 70);
  assert.ok(!net.roadInfoAt(-300, 0, o).onRoad, 'gramado central do Eixo não é pista');
  assert.ok(!net.roadInfoAt(-430, 600, o).onRoad, 'canteiro da W3 não é pista');
  assert.ok(net.roadInfoAt(-1050 + 26, 680, o).onRoad, 'balão');
  assert.ok(!net.roadInfoAt(-1050, 680, o).onRoad, 'ilha do balão');
  assert.ok(!net.roadInfoAt(-800, 300, o).onRoad, 'parque');
  assert.equal(net.speedLimitAt(0, 470, Math.PI), 80);
});

test('semáforos: todo semáforo tem aproximações e 1–2 grupos', () => {
  for (const s of net.signals) {
    assert.ok(s.approaches.length >= 2, `semáforo ${s.nodeId} com ${s.approaches.length} aproximações`);
    assert.ok(s.groups >= 1 && s.groups <= 2);
  }
});

test('desníveis encontrados', () => {
  assert.equal(net.gradeSeparations.length, 5);
  assert.ok(net.isGradeSeparated('eixao_n', 'eixo_s1_c'));
});

test('clearance: negativo na pista, positivo no parque', () => {
  assert.ok(net.clearance(-300, 40) < 0);
  assert.ok(net.clearance(-800, 300) > 10);
});

test('walker percorre 3 km sem travar', () => {
  const w = net.createWalker(casa.lane.id, casa.s);
  let d = 0;
  while (d < 3000 && !w.ended) { w.advance(2); d += 2; assert.ok(Number.isFinite(w.x + w.z + w.heading)); }
  assert.ok(d > 200);
});

test('faixas de ônibus, pontos, fiscalização e esconderijos', () => {
  const bus = net.lanes.filter((l) => l.kind === 'bus');
  const segs = new Set(bus.map((l) => l.segId));
  assert.ok(segs.has('s3_scs') && segs.has('eixo_s1_b'), 'faixas de ônibus esperadas');
  for (const l of bus) assert.equal(l.index, 0, 'faixa de ônibus deve ser a da direita');
  // Eixo Sul, faixa da direita (z ~ 43.5) = ônibus; faixa da esquerda (z ~ 36.5) não
  assert.ok(net.isBusLaneAt(-600, 43.5, Math.PI / 2), 'Eixo faixa da direita');
  assert.ok(!net.isBusLaneAt(-600, 36.5, Math.PI / 2), 'Eixo faixa da esquerda');
  assert.equal(net.nearestLane(-600, 43.5, {}, Math.PI / 2).kind, 'bus');
  assert.ok(net.busStops.length >= 6 && net.busStops.every((b) => Number.isFinite(b.shelterX)));
  const types = new Set(net.enforcementSpots.map((e) => e.type));
  assert.ok(types.has('speed') && types.has('redLight') && types.has('busLane'), [...types].join(','));
  assert.ok(net.agentHideouts.length >= 10);
  for (const h of net.agentHideouts) assert.ok(net.clearance(h.x, h.z) > 2, `esconderijo ${h.id} em cima da via`);
  console.log(`        ${bus.length} faixas de ônibus, ${net.busStops.length} pontos, ${net.enforcementSpots.length} pontos de fiscalização, ${net.agentHideouts.length} esconderijos`);
});

console.log(fails ? `\n${fails} falha(s)` : '\ntudo ok');
process.exit(fails ? 1 : 0);
