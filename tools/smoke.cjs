// Teste de fumaça (Playwright + Chromium com WebGL por software).
//   npm run build && node tools/smoke.cjs [pastaDeSaida]
// Abre index.html via file://, checa console, inicia viagens nos 3 modos, simula teclas,
// confere que o carro andou, mede draw calls/triângulos e salva screenshots.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.shots'));
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 30000 });
  console.log(`carregou em ${Date.now() - t0} ms`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '01-menu.png') });

  const info = () => page.evaluate(() => {
    const c = window.__davi, r = c.view.renderer.info;
    return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures,
      x: c.state.player.x, z: c.state.player.z, kmh: c.state.player.speedKmh, mode: c.state.mode, road: c.state.player.roadName,
      vehicle: c.state.trip.vehicleId, driver: c.state.trip.driver, passenger: c.state.trip.passenger, collisions: c.state.player.collisions,
      elapsed: c.state.trip.elapsed, guide: [c.state.trip.guideX, c.state.trip.guideZ], left: c.state.trip.routeDistLeft };
  });
  const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };

  const results = [];
  // 1) Modo davi via UI (clique nos botões), Casa -> STJ
  await page.click('button[data-mode="davi"]');
  await page.click('button[data-route="casa-stj"]');
  await page.click('#ui-start');
  await page.waitForTimeout(300);
  const a = await info();
  await hold(['KeyW'], 2500);
  await hold(['KeyW', 'KeyA'], 250);
  await hold(['KeyW'], 1200);
  const b = await info();
  await page.screenshot({ path: path.join(OUT, '02-davi-kwid.png') });
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  results.push({ mode: 'davi', moved, kmh: b.kmh, vehicle: b.vehicle, road: b.road, ok: moved > 4 && b.kmh > 10 && b.vehicle === 'kwid' });
  console.log('davi:', JSON.stringify({ moved: moved.toFixed(1), kmh: b.kmh.toFixed(0), road: b.road, calls: b.calls, tris: b.tris }));
  // eventos de ação (H/R/X) chegam ao barramento
  await page.evaluate(() => {
    const c = window.__davi, got = [];
    for (const n of ['HORN', 'BREATHE', 'CURSE']) c.events.on(c.EV[n], () => got.push(n));
    window.__gotActs = got;
  });
  await page.keyboard.press('KeyH'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyX');
  const acts2 = await page.evaluate(() => window.__gotActs);
  console.log('ações recebidas:', acts2.join(','));
  results.push({ mode: 'acoes-HRX', ok: acts2.length === 3 });

  // 2) Modo carona (Cactus) STJ -> Casa (tarde), via evento (API pública)
  await page.evaluate(() => window.__davi.events.emit(window.__davi.EV.REQ_START, { routeId: 'stj-casa', mode: 'carona' }));
  await page.waitForTimeout(300);
  const c1 = await info();
  await hold(['KeyW'], 2500);
  const c2 = await info();
  await page.screenshot({ path: path.join(OUT, '03-carona-cactus-tarde.png') });
  const movedC = Math.hypot(c2.x - c1.x, c2.z - c1.z);
  results.push({ mode: 'carona', moved: movedC, kmh: c2.kmh, vehicle: c2.vehicle, ok: movedC > 4 && c2.kmh > 10 && c2.vehicle === 'cactus' && c2.driver === 'dono' && c2.passenger === 'davi' });
  console.log('carona:', JSON.stringify({ moved: movedC.toFixed(1), kmh: c2.kmh.toFixed(0), driver: c2.driver, passenger: c2.passenger }));

  // 3) Modo perigo (Davi no Cactus) Casa -> STJ
  await page.evaluate(() => window.__davi.game.startTrip('casa-stj', 'perigo'));
  await page.waitForTimeout(300);
  const p1 = await info();
  await hold(['ArrowUp'], 2500);
  const p2 = await info();
  await page.screenshot({ path: path.join(OUT, '04-perigo-cactus.png') });
  const movedP = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  results.push({ mode: 'perigo', moved: movedP, kmh: p2.kmh, vehicle: p2.vehicle, ok: movedP > 4 && p2.kmh > 10 && p2.vehicle === 'cactus' && p2.driver === 'davi' && p2.passenger === 'dono' });
  console.log('perigo:', JSON.stringify({ moved: movedP.toFixed(1), kmh: p2.kmh.toFixed(0), driver: p2.driver, passenger: p2.passenger }));

  // 4) Percurso automático pela rota do GPS até a chegada (sim síncrona), checa 'chegou'
  const auto = await page.evaluate(() => {
    const c = window.__davi; c.game.startTrip('casa-stj', 'davi');
    const net = c.net, st = c.state; const w = net.createWalker(st.player.laneId >= 0 ? st.player.laneId : 0, 0);
    // teleporta o carro ao longo da rota sugerida, a 15 m/s, para validar GPS + chegada
    let route = []; let guard = 0;
    const near = net.nearestLane(st.player.x, st.player.z, {}, st.player.heading);
    route = net.planRoute(near.laneId, near.s, net.laneForZone('stj').targets, []);
    w.lane = net.getLane(route[0]); w.s = near.s; w.route = route; w.routeIdx = 0;
    while (st.mode === 'PLAYING' && guard++ < 20000) {
      w.advance(0.25);
      c.player.phys.x = w.x; c.player.phys.z = w.z; c.player.phys.heading = w.heading; c.player.phys.vx = 0; c.player.phys.vz = 0;
      c.game.step(1 / 60);
    }
    return { mode: st.mode, reason: st.finishReason, simTime: st.trip.elapsed, steps: guard };
  });
  console.log('rota automática:', JSON.stringify(auto));
  results.push({ mode: 'auto-chegada', ok: auto.mode === 'FINISHED' && auto.reason === 'chegou' });

  // 5) cena típica parada no Eixo Monumental (métricas de render)
  await page.evaluate(() => { const c = window.__davi; c.game.startTrip('casa-stj', 'davi'); const p = c.player.phys; p.x = -300; p.z = 40; p.heading = Math.PI / 2; c.cameraRig.snap(-300, 40); });
  await hold(['KeyW'], 1500);
  const e = await info();
  await page.screenshot({ path: path.join(OUT, '05-eixo-monumental.png') });
  console.log('cena Eixo:', JSON.stringify({ calls: e.calls, tris: e.tris, road: e.road, kmh: e.kmh.toFixed(0) }));
  await page.evaluate(() => { const c = window.__davi; const p = c.player.phys; p.x = 470; p.z = 40; p.heading = Math.PI / 2; p.vx = 0; p.vz = 0; c.cameraRig.snap(470, 40); });
  await page.waitForTimeout(500);
  const f = await info();
  await page.screenshot({ path: path.join(OUT, '06-esplanada.png') });
  console.log('cena Esplanada:', JSON.stringify({ calls: f.calls, tris: f.tris }));
  // pior caso: zoom máximo no centro
  await page.evaluate(() => { const c = window.__davi; c.cameraRig.zoomMul = 1.7; });
  await page.waitForTimeout(400);
  const g = await info();
  console.log('zoom 1.7x:', JSON.stringify({ calls: g.calls, tris: g.tris }));
  await page.screenshot({ path: path.join(OUT, '07-zoom-aberto.png') });
  await page.evaluate(() => { window.__davi.cameraRig.zoomMul = 1; window.__davi.game.toMenu(); });
  await page.waitForTimeout(400);

  console.log('\nresultados:', results.map((r) => `${r.mode}:${r.ok ? 'OK' : 'FALHOU'}`).join('  '));
  const relevant = errors.filter((e) => !/GPU stall|WebGL-|swiftshader|Automatic fallback/i.test(e));
  console.log(relevant.length ? 'ERROS/AVISOS NO CONSOLE:\n' + relevant.join('\n') : 'console limpo (sem erros/avisos)');
  if (errors.length !== relevant.length) console.log(`(${errors.length - relevant.length} avisos do driver WebGL por software ignorados)`);
  console.log('screenshots em', OUT);
  await browser.close();
  process.exit(results.every((r) => r.ok) && relevant.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
