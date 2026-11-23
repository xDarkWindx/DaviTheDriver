// Pares de screenshots LEVE × HD (mesma cena, mesmo instante de simulação), para conferir o perfil HD.
//   npm run build && node tools/shots-hd.cjs [pastaDeSaida] [filtro]
// Para cada perfil abre index.html?q=<perfil>&aq=0 (ajuste automático travado no degrau 0), para o laço, monta cada cena
// com trânsito de semente fixa e captura o canvas. No fim grava <cena>-leve.png, <cena>-hd.png e <cena>-par.png (lado a lado).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.shots', 'hd'));
const FILTER = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');

// [nome, rota, modo, x, z, heading|null (null = pose de largada), segundos de simulação, vista (m) | null = câmera de jogo]
const SCENES = [
  ['01-largada-qrsw2-manha', 'casa-stj', 'davi', null, null, null, 0.5, null],
  ['02-av-jaqueiras', 'casa-stj', 'davi', 'seg:jaq_m', 0, 0, 4, null],
  ['02b-parque-da-cidade', 'casa-stj', 'davi', 'seg:parque', 0, 0, 4, null],
  ['02c-sudoeste', 'casa-stj', 'davi', 'seg:rua_q34', 0, 0, 4, null],
  ['03-eixo-transito', 'casa-stj', 'davi', -600, 43, Math.PI / 2, 8, null],
  ['04-scs-manha', 'casa-stj', 'davi', -150, 238, 1.65, 6, null],
  ['05-rotatoria-stj-manha', 'casa-stj', 'davi', 'R_STJ1', 0, 0, 6, null],
  ['06-scs-tarde', 'stj-casa', 'carona', -300, 216, -1.45, 6, null],
  ['07-rotatoria-stj-tarde', 'stj-casa', 'carona', 'R_STJ1', 0, 0, 6, null],
  ['08-close-kwid', 'casa-stj', 'davi', null, null, null, 0.3, 7.5],
  ['09-close-cactus', 'casa-stj', 'perigo', null, null, null, 0.3, 8.5],
  ['10-close-cactus-tarde', 'stj-casa', 'carona', null, null, null, 0.3, 8.5],
];

async function shoot(browser, q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(`${BASE}?q=${q}&aq=0`);
  await page.waitForFunction(() => window.__davi && window.__davi.state.mode === 'MENU', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const out = {};
  if (!FILTER || 'menu'.includes(FILTER)) out['00-menu'] = await page.screenshot({ type: 'png', timeout: 180000 });
  await page.evaluate(() => { const c = window.__davi; c.loop.stop(); });
  for (const [name, route, mode, x, z, h, secs, view] of SCENES) {
    if (FILTER && !name.includes(FILTER)) continue;
    const shot = await page.evaluate(([route, mode, x, z, h, secs, view]) => {
      const c = window.__davi, st = c.state;
      st.traffic.seed = 4242;
      c.game.startTrip(route, mode, { parking: 'norte' });
      if (x !== null) {
        const p = c.player.phys;
        if (typeof x === 'string' && x.startsWith('seg:')) { // meio do segmento, faixa da direita
          const seg = c.net.getSegment(x.slice(4)), ln = c.net.lanes[seg.laneIdsF[0]], T = c.net.sampleLane(ln, ln.length / 2, {});
          p.x = T.x; p.z = T.z; p.heading = T.heading;
        } else if (typeof x === 'string') { // rotatória: entra no anel pelo lado sul
          const r = c.net.roundabouts.find((rr) => rr.id === x);
          const ln = c.net.nearestLane(r.x, r.z + r.radius, {}, Math.PI / 2);
          p.x = ln.x; p.z = ln.z; p.heading = ln.heading;
        } else { p.x = x; p.z = z; p.heading = h; }
        p.vx = 0; p.vz = 0;
      }
      c.cameraRig.mode = 'follow';
      c.game.advance(secs);
      c.cameraRig.snap(st.player.x, st.player.z);
      if (view) c.cameraRig.lookAt(st.player.x, st.player.z, view);
      for (let i = 0; i < 3; i++) c.game.frame(0.016, 1);
      const r = c.view.renderer.info.render;
      return { url: c.view.renderer.domElement.toDataURL('image/png'), calls: r.calls, tris: r.triangles };
    }, [route, mode, x, z, h, secs, view]);
    out[name] = Buffer.from(shot.url.split(',')[1], 'base64');
    console.log(q.padEnd(5), name.padEnd(26), JSON.stringify({ calls: shot.calls, tris: shot.tris }));
  }
  if (q === 'hd' && (!FILTER || 'arvores'.includes(FILTER))) { // close de cada espécie (HD), câmera de jogo (isométrica)
    const trees = await page.evaluate(() => {
      const c = window.__davi; c.game.startTrip('casa-stj', 'davi');
      const list = c.world.debugTrees(-700, -200, 14), out = [];
      for (const t of list) { c.cameraRig.lookAt(t.x, t.z + 1, 16); for (let i = 0; i < 2; i++) c.game.frame(0.016, 1); out.push([t.type, c.view.renderer.domElement.toDataURL('image/png')]); }
      c.cameraRig.lookAt(-700 + 3.5 * 14, -200, 60); for (let i = 0; i < 2; i++) c.game.frame(0.016, 1); out.push(['todas', c.view.renderer.domElement.toDataURL('image/png')]);
      return out;
    });
    trees.forEach(([n, u], i) => fs.writeFileSync(path.join(OUT, `arvore-${i}-${n}.png`), Buffer.from(u.split(',')[1], 'base64')));
  }
  const relevant = errors.filter((e) => !/GPU stall|WebGL-|swiftshader|Automatic fallback/i.test(e));
  if (relevant.length) console.log(`[${q}] console:\n` + relevant.join('\n'));
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const only = process.env.PROFILES ? process.env.PROFILES.split(',') : ['leve', 'hd'];
  const leve = only.includes('leve') ? await shoot(browser, 'leve') : {};
  const hd = only.includes('hd') ? await shoot(browser, 'hd') : {};
  if (!only.includes('leve') || !only.includes('hd')) { // só um perfil: grava sem compor pares
    for (const [q, set] of [['leve', leve], ['hd', hd]]) for (const n of Object.keys(set)) fs.writeFileSync(path.join(OUT, `${n}-${q}.png`), set[n]);
    await browser.close(); return;
  }
  // lado a lado (compõe no próprio Chromium)
  const page = await browser.newPage();
  for (const name of Object.keys(hd)) {
    fs.writeFileSync(path.join(OUT, `${name}-leve.png`), leve[name]); fs.writeFileSync(path.join(OUT, `${name}-hd.png`), hd[name]);
    const pair = await page.evaluate(async ([a, b]) => {
      const load = (s) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = s; });
      const A = await load(a), B = await load(b);
      const cv = document.createElement('canvas'); cv.width = A.width + B.width + 8; cv.height = Math.max(A.height, B.height);
      const g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(A, 0, 0); g.drawImage(B, A.width + 8, 0);
      g.font = 'bold 22px sans-serif'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(8, 8, 86, 32); g.fillRect(A.width + 16, 8, 56, 32);
      g.fillStyle = '#fff'; g.fillText('LEVE', 16, 32); g.fillText('HD', A.width + 24, 32);
      return cv.toDataURL('image/png');
    }, ['data:image/png;base64,' + leve[name].toString('base64'), 'data:image/png;base64,' + hd[name].toString('base64')]);
    fs.writeFileSync(path.join(OUT, `${name}-par.png`), Buffer.from(pair.split(',')[1], 'base64'));
  }
  console.log('pares em', OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
