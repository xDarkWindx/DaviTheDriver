// Screenshots de inspeção visual (mapa, bairros, carros, modelos de tráfego).
//   npm run build && node tools/shots.cjs [pastaDeSaida] [filtro]
// Usa câmera livre (cameraRig.lookAt) e esconde a UI. Também imprime draw calls/triângulos de cada vista.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.shots'));
const FILTER = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

// [nome, x, z, altura visível (m), extra]
const VIEWS = [
  ['mapa-inteiro', -300, 220, 2100],
  ['sudoeste', -1300, 380, 560],
  ['jaqueiras', -1500, 300, 120],
  ['jaqueiras-close', -1500, 330, 45],
  ['eixo-x-eixao', 20, 80, 330],
  ['rodoviaria-close', 60, 60, 120],
  ['parque-da-cidade', -720, 440, 520],
  ['parque-close', -600, 390, 70],
  ['scs-s3', -250, 230, 110],
  ['stj', 650, 280, 160],
  ['eixo-close', -600, 40, 60],
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 30000 });
  await page.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; } canvas { display: block !important; }' });
  await page.evaluate(() => { const c = window.__davi; c.game.startTrip('casa-stj', 'davi'); c.game.pause(); });
  const info = () => page.evaluate(() => { const r = window.__davi.view.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  for (const [name, x, z, view] of VIEWS) {
    if (FILTER && !name.includes(FILTER)) continue;
    await page.evaluate(([x, z, v]) => { const c = window.__davi; c.cameraRig.lookAt(x, z, v); c.cameraRig.update(0.016, x, z, 0, 0); }, [x, z, view]);
    await page.waitForTimeout(700);
    const i = await info();
    await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });
    console.log(name.padEnd(20), JSON.stringify(i));
  }
  // carros do jogador e modelos de tráfego (vitrine num estacionamento improvisado)
  if (!FILTER || 'carros'.includes(FILTER) || FILTER === 'carros') {
    const ok = await page.evaluate(() => {
      const c = window.__davi, THREE = c.THREE;
      const vm = c.vehicleModels || (c.modules && c.modules.__vehicleModels);
      return !!vm;
    });
    // vitrine é montada por world.debugShowcase (se existir)
    const has = await page.evaluate(() => !!(window.__davi.world && window.__davi.world.debugShowcase));
    if (has) {
      await page.evaluate(() => window.__davi.world.debugShowcase(-1395, 260));
      for (const [name, x, z, v] of [['carros-jogador', -1405, 262, 9], ['trafego', -1385, 266, 26], ['trafego-close', -1388, 268, 14]]) {
        await page.evaluate(([x, z, v]) => { const c = window.__davi; c.cameraRig.lookAt(x, z, v); c.cameraRig.update(0.016, x, z, 0, 0); }, [x, z, v]);
        await page.waitForTimeout(700);
        const i = await info();
        await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });
        console.log(name.padEnd(20), JSON.stringify(i), ok);
      }
    }
  }
  // câmera de jogo (follow) em pontos típicos
  for (const [name, x, z, h, route] of [['jogo-sudoeste', -1360, 198, -Math.PI / 2, 'casa-stj'], ['jogo-eixo', -600, 43, Math.PI / 2, 'casa-stj'],
    ['jogo-jaqueiras', -1494, 330, Math.PI, 'casa-stj'], ['jogo-scs', -300, 216, -1.45, 'stj-casa'], ['jogo-stj', 720, 258, -Math.PI / 2, 'stj-casa']]) {
    if (FILTER && !name.includes(FILTER)) continue;
    await page.evaluate(([x, z, h, r]) => {
      const c = window.__davi; c.game.startTrip(r, r === 'casa-stj' ? 'davi' : 'carona'); const p = c.player.phys;
      p.x = x; p.z = z; p.heading = h; p.vx = 0; p.vz = 0; c.cameraRig.mode = 'follow'; c.cameraRig.snap(x, z); c.game.advance(0.05); c.game.pause();
    }, [x, z, h, route]);
    await page.waitForTimeout(900);
    const i = await info();
    await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });
    console.log(name.padEnd(20), JSON.stringify(i));
  }
  if (errors.length) console.log('ERROS:', errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
