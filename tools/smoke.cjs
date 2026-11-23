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
  // Limiares abaixo do que só a parte simulada garante (Kwid 3,5 s ≈ 25 m; Cactus 2,5 s ≈ 14 m, ~42 km/h): o laço em tempo
  // real que roda entre as chamadas só pode SOMAR distância, então o resultado não depende do FPS do headless.
  // Simulação DETERMINÍSTICA: as teclas ficam pressionadas (caminho real do teclado) enquanto o jogo avança
  // um número fixo de passos de 1/60 s (game.advance), independentemente do FPS do headless.
  const driveSim = async (keys, seconds) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.evaluate((s) => window.__davi.game.advance(s), seconds);
    for (const k of keys) await page.keyboard.up(k);
  };
  // 1) Modo davi via UI (clique nos botões), Casa -> STJ
  await page.click('button[data-mode="davi"]');
  await page.click('button[data-route="casa-stj"]');
  await page.click('#ui-start');
  await page.waitForFunction(() => window.__davi.state.mode === 'PLAYING', null, { timeout: 10000 });
  const a = await info();
  await driveSim(['KeyW'], 3.5);
  const b = await info();
  await page.screenshot({ path: path.join(OUT, '02-davi-kwid.png') });
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  results.push({ mode: 'davi', moved, kmh: b.kmh, vehicle: b.vehicle, road: b.road, ok: moved > 12 && b.kmh > 20 && b.vehicle === 'kwid' });
  console.log('davi:', JSON.stringify({ moved: moved.toFixed(1), kmh: b.kmh.toFixed(0), road: b.road, mode: b.mode, calls: b.calls, tris: b.tris }));
  // eventos de ação (H/R/X) chegam ao barramento (viagem nova: só valem em PLAYING)
  await page.evaluate(() => {
    window.__davi.game.startTrip('casa-stj', 'davi');
    const c = window.__davi, got = [];
    for (const n of ['HORN', 'BREATHE', 'CURSE']) c.events.on(c.EV[n], () => got.push(n));
    window.__gotActs = got;
  });
  for (const k of ['KeyH', 'KeyR', 'KeyX']) await driveSim([k], 0.1);
  const acts2 = await page.evaluate(() => window.__gotActs);
  console.log('ações recebidas:', acts2.join(','));
  results.push({ mode: 'acoes-HRX', ok: ['HORN', 'BREATHE', 'CURSE'].every((n) => acts2.includes(n)) });

  // 2) Modo carona (Cactus) STJ -> Casa (tarde), via evento (API pública)
  await page.evaluate(() => window.__davi.events.emit(window.__davi.EV.REQ_START, { routeId: 'stj-casa', mode: 'carona' }));
  await page.waitForFunction(() => window.__davi.state.mode === 'PLAYING' && window.__davi.state.trip.vehicleId === 'cactus', null, { timeout: 10000 });
  const c1 = await info();
  await driveSim(['KeyW'], 2.5);
  const c2 = await info();
  await page.screenshot({ path: path.join(OUT, '03-carona-cactus-tarde.png') });
  const movedC = Math.hypot(c2.x - c1.x, c2.z - c1.z);
  results.push({ mode: 'carona', moved: movedC, kmh: c2.kmh, vehicle: c2.vehicle, ok: movedC > 9 && c2.kmh > 25 && c2.vehicle === 'cactus' && c2.driver === 'dono' && c2.passenger === 'davi' });
  console.log('carona:', JSON.stringify({ moved: movedC.toFixed(1), kmh: c2.kmh.toFixed(0), driver: c2.driver, passenger: c2.passenger }));

  // 3) Modo perigo (Davi no Cactus) Casa -> STJ
  await page.evaluate(() => window.__davi.game.startTrip('casa-stj', 'perigo'));
  const p1 = await info();
  await driveSim(['ArrowUp'], 2.5);
  const p2 = await info();
  await page.screenshot({ path: path.join(OUT, '04-perigo-cactus.png') });
  const movedP = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  results.push({ mode: 'perigo', moved: movedP, kmh: p2.kmh, vehicle: p2.vehicle, ok: movedP > 9 && p2.kmh > 25 && p2.vehicle === 'cactus' && p2.driver === 'davi' && p2.passenger === 'dono' });
  console.log('perigo:', JSON.stringify({ moved: movedP.toFixed(1), kmh: p2.kmh.toFixed(0), driver: p2.driver, passenger: p2.passenger }));

  // 3a) Seta do GPS na largada aponta para a frente (nas 2 viagens)
  const arrow = await page.evaluate(() => {
    const c = window.__davi, out = {};
    for (const r of ['casa-stj', 'stj-casa']) {
      c.game.startTrip(r, 'davi'); c.game.advance(0.1);
      const t = c.state.trip, p = c.state.player;
      let d = Math.abs(t.guideBearing - p.heading) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
      out[r] = +(d * 180 / Math.PI).toFixed(1);
    }
    return out;
  });
  console.log('seta GPS na largada (graus entre seta e rumo):', JSON.stringify(arrow));
  // casa-stj larga ESTACIONADO de frente para a rua (a rota vira à direita logo na saída da vaga): a seta aponta para a rua,
  // em diagonal; o que não pode é apontar para trás
  results.push({ mode: 'seta-largada', ok: arrow['casa-stj'] < 100 && arrow['stj-casa'] < 60 });

  // 3b) Teste determinístico (independe do FPS do headless): 4 s de simulação com acelerador virtual
  const det = await page.evaluate(() => {
    const c = window.__davi, out = {};
    for (const mode of ['davi', 'carona', 'perigo']) {
      c.game.startTrip('casa-stj', mode);
      const x0 = c.state.player.x, z0 = c.state.player.z;
      c.input.setVirtual('up', true); c.game.advance(4); c.input.setVirtual('up', false);
      out[mode] = { dist: Math.hypot(c.state.player.x - x0, c.state.player.z - z0), kmh: c.state.player.speedKmh, state: c.state.mode };
    }
    return out;
  });
  console.log('determinístico 4 s:', JSON.stringify(det));
  results.push({ mode: 'det-davi', ok: det.davi.dist > 25 && det.davi.state === 'PLAYING' });
  results.push({ mode: 'det-cactus>kwid', ok: det.carona.dist > det.davi.dist && det.perigo.dist > det.davi.dist });
  // FPS aproximado no headless (renderização por software)
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  console.log(`FPS headless (SwiftShader, só referência): ${fps.toFixed(1)}`);

  // 4) Percurso automático (teleporte ao longo da rota) com TRÂNSITO DETERMINÍSTICO (state.traffic.seed fixo):
  //    2 rotas (Eixo = GPS livre; Parque = corredor) × 2 sentidos, valida GPS + chegada em cada uma.
  const auto = await page.evaluate(() => {
    const c = window.__davi, net = c.net, st = c.state, out = {};
    st.traffic.seed = 4242;
    for (const routeId of ['casa-stj', 'stj-casa']) for (const corr of ['eixo', 'parque']) {
      c.game.startTrip(routeId, 'davi');
      // o "carro" teleporta a 15 m/s com velocidade física zero: o trânsito não consegue reagir a isso (batia na IA com o
      // trânsito mais denso). Aqui só interessam GPS e chegada: pista vazia (o robô testa o trânsito de verdade abaixo).
      c.modules.traffic.debug.setAutoSpawn(false); c.modules.traffic.debug.clear();
      const near = net.nearestLane(st.player.x, st.player.z, {}, st.player.heading);
      const dest = c.trip._dest.targets;
      const route = corr === 'eixo' ? net.planRoute(near.laneId, near.s, dest, [])
        : net.planRouteVia(near.laneId, near.s, net.routeCorridors.parque[routeId], dest, []);
      const w = net.createWalker(route[0], near.s); w.route = route; w.routeIdx = 0;
      let guard = 0;
      while (st.mode === 'PLAYING' && guard++ < 30000) {
        w.advance(0.25);
        const p = c.player.phys; p.x = w.x; p.z = w.z; p.heading = w.heading; p.vx = 0; p.vz = 0;
        c.game.step(1 / 60);
      }
      out[routeId + '/' + corr] = { mode: st.mode, reason: st.finishReason, simTime: +st.trip.elapsed.toFixed(1), parking: st.trip.parking };
      if (st.mode === 'PLAYING') c.game.finish('desistiu');
    }
    st.traffic.seed = null; c.modules.traffic.debug.setAutoSpawn(true);
    return out;
  });
  console.log('rotas automáticas (teleporte, trânsito com semente fixa):', JSON.stringify(auto));
  results.push({ mode: 'auto-chegada-4-rotas', ok: Object.values(auto).every((r) => r.reason === 'chegou') });

  // 4a) Piloto-robô de verdade (teclas virtuais, física real, trânsito real com semente fixa): Davi, Casa → STJ pelo Eixo
  const bot = await page.evaluate(() => {
    const c = window.__davi, st = c.state;
    st.traffic.seed = 11;
    c.game.startTrip('casa-stj', 'davi'); c.autopilot.start({ profile: 'normal', corridor: 'eixo' });
    for (let i = 0; i < 1200 && st.mode === 'PLAYING'; i++) c.game.advance(0.5);
    c.autopilot.stop();
    const r = { reason: st.finishReason || st.mode, time: +st.trip.elapsed.toFixed(1), fines: st.fines.length, grade: st.result && st.result.grade };
    if (st.mode === 'PLAYING') c.game.finish('desistiu');
    st.traffic.seed = null;
    return r;
  });
  console.log('piloto-robô (normal, Eixo, semente 11):', JSON.stringify(bot));
  results.push({ mode: 'piloto-robo-chega', ok: bot.reason === 'chegou' });

  // 4b) ajuste automático de qualidade: no SwiftShader (~10 FPS) ele DEVE ter descido degraus sozinho.
  const aq = await page.evaluate(() => { const a = window.__davi.view.autoQuality; return { step: a.step, label: a.label, fps: +a.fps.toFixed(1), history: a.history, mirror: window.__davi.state.qualityAuto || null }; });
  console.log('ajuste automático:', JSON.stringify(aq));
  results.push({ mode: 'auto-qualidade-desceu', ok: aq.step >= 1 && aq.history.length >= 1 });
  // para medir o custo do perfil completo: trava no degrau 0 (sombra ligada)
  await page.evaluate(() => { const a = window.__davi.view.autoQuality; a.enabled = false; a.set(0); });

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
  await page.evaluate(() => { const c = window.__davi; c.cameraRig.zoomMul = 44 / 23; });
  await page.waitForTimeout(400);
  const g = await info();
  console.log('zoom máximo (vista de 44 m, como em alta velocidade):', JSON.stringify({ calls: g.calls, tris: g.tris }));
  await page.screenshot({ path: path.join(OUT, '07-zoom-aberto.png') });
  await page.evaluate(() => { window.__davi.cameraRig.zoomMul = 1; window.__davi.game.toMenu(); });
  await page.waitForTimeout(400);

  // 6) PERFIL HD (contexto isolado: localStorage próprio). Viagem em ?q=hd com o ajuste automático travado no degrau 0
  //    (?aq=0): console limpo, draw calls / triângulos / render targets do HD.
  const isIgnorable = (e) => /GPU stall|WebGL-|swiftshader|Automatic fallback/i.test(e);
  await page.close(); // libera a CPU do headless (o laço do leve continuaria rodando no menu)
  {
    const hctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hp = await hctx.newPage();
    const herr = [];
    hp.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') herr.push(`[hd ${m.type()}] ${m.text()}`); });
    hp.on('pageerror', (e) => herr.push('[hd pageerror] ' + e.message));
    await hp.goto(URL + '?q=hd&aq=0', { timeout: 120000 });
    await hp.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 120000 });
    const hd = await hp.evaluate(() => {
      const c = window.__davi, out = { quality: c.state.quality, support: c.state.hdSupport };
      c.loop.stop();
      c.state.traffic.seed = 4242;
      c.game.startTrip('casa-stj', 'davi');
      c.input.setVirtual('up', true); c.game.advance(3); c.input.setVirtual('up', false);
      const scene = (x, z, h) => {
        if (x != null) { const p = c.player.phys; p.x = x; p.z = z; p.heading = h; p.vx = 0; p.vz = 0; c.game.advance(2); }
        c.cameraRig.snap(c.state.player.x, c.state.player.z);
        for (let i = 0; i < 2; i++) c.game.frame(0.016, 1);
        const r = c.view.renderer.info;
        return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, ...c.view.hd.stats() };
      };
      out.largada = scene(null);
      out.eixo = scene(-300, 40, Math.PI / 2);
      c.cameraRig.zoomMul = 44 / 23; out.eixoZoom = scene(null); c.cameraRig.zoomMul = 1;
      c.game.startTrip('stj-casa', 'carona'); out.scsTarde = scene(-300, 216, -1.45);
      out.moved = c.state.player.speedKmh >= 0;
      out.stepLocked = c.view.autoQuality.step;
      return out;
    });
    await hp.screenshot({ path: path.join(OUT, '08-hd-scs-tarde.png') });
    console.log('HD:', JSON.stringify(hd));
    const hdOk = hd.quality === 'hd' && hd.eixo.renderTargets > 0 && hd.eixo.shadowMapSize === 4096 && hd.stepLocked === 0;
    results.push({ mode: 'hd-viagem', ok: hdOk });
    const hrel = herr.filter((e) => !isIgnorable(e));
    if (hrel.length) errors.push(...hrel);
    results.push({ mode: 'hd-console-limpo', ok: hrel.length === 0 });

    // 7) troca leve → hd → leve → hd → leve pela UI (Opções), com recarregamento; antes de cada recarga confere que
    //    view.dispose() zerou geometrias/texturas, e que a memória de cada perfil volta ao mesmo valor.
    const mem = () => hp.evaluate(() => { const m = window.__davi.view.renderer.info.memory; return { q: window.__davi.state.quality, geos: m.geometries, tex: m.textures }; });
    await hp.goto(URL, { timeout: 120000 }); // sem ?q: vale a opção salva (contexto novo = 'leve')
    await hp.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 120000 });
    await hp.waitForTimeout(800);
    const seq = [await mem()], after = [];
    const gfxSel = async () => hp.evaluate(() => ['low', 'hd'].filter((k) => document.querySelector(`[data-testid="gfx-${k}"]`).classList.contains('sel')).join());
    let k = 0;
    for (const target of ['hd', 'leve', 'hd', 'leve']) {
      await hp.evaluate(() => { window.__davi.noReload = true; });
      if (k++ % 2 === 0) await hp.click(`[data-testid="gfx-${target === 'leve' ? 'low' : 'hd'}"]`, { timeout: 60000 }); // seletor do menu
      else { await hp.click('[data-testid="btn-options"]'); await hp.click(`[data-testid="opt-q-${target}"]`, { timeout: 60000 }); } // Opções
      after.push(await hp.evaluate(() => { const m = window.__davi.view.renderer.info.memory; return { switching: !!window.__davi.switching, geos: m.geometries, tex: m.textures }; }));
      await hp.goto(URL, { timeout: 120000 });
      await hp.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 120000 });
      await hp.waitForTimeout(800);
      seq.push({ ...(await mem()), gfx: await gfxSel() });
    }
    console.log('troca de perfil (memória no menu):', JSON.stringify(seq), ' depois do dispose:', JSON.stringify(after));
    const same = (a, b) => a.q === b.q && a.geos === b.geos && a.tex === b.tex;
    results.push({ mode: 'troca-perfil-memoria', ok: seq.map((s) => s.q).join() === 'leve,hd,leve,hd,leve' && same(seq[0], seq[2]) && same(seq[2], seq[4])
      && same(seq[1], seq[3]) && after.every((a) => a.switching && a.geos === 0 && a.tex === 0)
      && seq.slice(1).every((x) => x.gfx === (x.q === 'hd' ? 'hd' : 'low')) });
    const trel = herr.filter((e) => !isIgnorable(e)).slice(hrel.length);
    if (trel.length) errors.push(...trel);
    await hctx.close();
  }

  console.log('\nresultados:', results.map((r) => `${r.mode}:${r.ok ? 'OK' : 'FALHOU'}`).join('  '));
  const relevant = errors.filter((e) => !isIgnorable(e));
  console.log(relevant.length ? 'ERROS/AVISOS NO CONSOLE:\n' + relevant.join('\n') : 'console limpo (sem erros/avisos)');
  if (errors.length !== relevant.length) console.log(`(${errors.length - relevant.length} avisos do driver WebGL por software ignorados)`);
  console.log('screenshots em', OUT);
  await browser.close();
  process.exit(results.every((r) => r.ok) && relevant.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
