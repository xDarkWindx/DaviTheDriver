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
  assert.equal(casa.lane.segId, 'sud_local');
  assert.equal(stj.lane.segId, 'via_safs');
  assert.ok(Math.abs(casa.heading - Math.PI / 2) < 0.2, 'casa rumo leste');
});

test('existe rota Casa → STJ e STJ → Casa', () => {
  const r1 = net.planRoute(casa.lane.id, casa.s, toStj.targets);
  assert.ok(r1, 'sem rota casa->stj');
  const segs1 = [...new Set(r1.map((id) => net.lanes[id].segId).filter(Boolean))];
  console.log('        casa→stj:', segs1.join(' > '), `(${net.routeLength(r1, casa.s, toStj.s).toFixed(0)} m)`);
  const r2 = net.planRoute(stj.lane.id, stj.s, toCasa.targets);
  assert.ok(r2, 'sem rota stj->casa');
  const segs2 = [...new Set(r2.map((id) => net.lanes[id].segId).filter(Boolean))];
  console.log('        stj→casa:', segs2.join(' > '), `(${net.routeLength(r2, stj.s, toCasa.s).toFixed(0)} m)`);
});

test('rota alternativa (W3/L2) existe', () => {
  // força passar pela W3: casa -> faixa da W3 sul -> STJ
  const w3 = net.getSegment('w3_m2').laneIdsF[0];
  const a = net.planRoute(casa.lane.id, casa.s, w3);
  const b = net.planRoute(w3, 0, toStj.targets);
  assert.ok(a && b, 'rota via W3 inexistente');
  const segs = [...new Set([...a, ...b].map((id) => net.lanes[id].segId).filter(Boolean))];
  console.log('        via W3  :', segs.join(' > '), `(${(net.routeLength(a, casa.s) + net.routeLength(b, 0, toStj.s)).toFixed(0)} m)`);
  const tes = net.getSegment('tes').laneIdsF[0];
  const c = net.planRoute(casa.lane.id, casa.s, tes), d = net.planRoute(tes, 0, toStj.targets);
  assert.ok(c && d, 'rota via tesourinha inexistente');
});

test('nearestLane respeita o sentido', () => {
  const o = {};
  // Eixo Sul é mão única leste
  const r = net.nearestLane(-300, 40, o, Math.PI / 2);
  assert.ok(r && r.lane.segId === 'eixo_sul_b', 'esperava eixo_sul_b, veio ' + (r && r.lane.segId));
  // W3 Sul: rumo norte (heading PI) deve achar faixa dir -1 (to→from)
  const r2 = net.nearestLane(-596, 600, {}, Math.PI);
  assert.ok(r2 && r2.lane.segId === 'w3_m2' && r2.lane.dir === -1, 'w3 norte');
  const r3 = net.nearestLane(-604, 600, {}, 0);
  assert.ok(r3 && r3.lane.dir === 1, 'w3 sul');
});

test('roadInfoAt: pista, canteiro, fora', () => {
  const o = {};
  assert.ok(net.roadInfoAt(-300, 40, o).onRoad, 'Eixo Sul');
  assert.equal(o.limitKmh, 70);
  assert.ok(!net.roadInfoAt(-300, 0, o).onRoad, 'gramado central do Eixo não é pista');
  assert.ok(!net.roadInfoAt(-600, 600, o).onRoad, 'canteiro da W3 não é pista');
  assert.ok(net.roadInfoAt(-1250 + 24, 350, o).onRoad, 'balão');
  assert.ok(!net.roadInfoAt(-1250, 350, o).onRoad, 'ilha do balão');
  assert.ok(!net.roadInfoAt(-900, 200, o).onRoad, 'parque');
  assert.equal(net.speedLimitAt(0, 470, Math.PI), 80);
});

test('semáforos: todo semáforo tem aproximações e 1–2 grupos', () => {
  for (const s of net.signals) {
    assert.ok(s.approaches.length >= 2, `semáforo ${s.nodeId} com ${s.approaches.length} aproximações`);
    assert.ok(s.groups >= 1 && s.groups <= 2);
  }
});

test('desníveis encontrados', () => {
  assert.equal(net.gradeSeparations.length, 3);
  assert.ok(net.isGradeSeparated('eixao_n', 'eixo_sul_b'));
});

test('clearance: negativo na pista, positivo no parque', () => {
  assert.ok(net.clearance(-300, 40) < 0);
  assert.ok(net.clearance(-900, 220) > 10);
});

test('walker percorre 3 km sem travar', () => {
  const w = net.createWalker(casa.lane.id, casa.s);
  let d = 0;
  while (d < 3000 && !w.ended) { w.advance(2); d += 2; assert.ok(Number.isFinite(w.x + w.z + w.heading)); }
  assert.ok(d > 200);
});

console.log(fails ? `\n${fails} falha(s)` : '\ntudo ok');
process.exit(fails ? 1 : 0);
