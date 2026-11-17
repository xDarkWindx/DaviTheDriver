// Minimapa em canvas pequeno. Base (vias) pré-renderizada uma vez; a cada ~10 Hz só desenha um recorte girado
// para casar com a orientação da câmera isométrica (o "para cima" do mapa é o "para cima" da tela).
import { el } from './dom.js';

const SIZE = 256;          // px internos
const VIEW_M = 640;        // metros visíveis na largura do recorte
const BASE_K = 0.4;        // px por metro da base pré-renderizada
const STEP = 0.1;          // s entre redesenhos

const ROAD_STYLE = {
  eixao: ['#6b4a1a', '#ffd35a', 7], eixo: ['#6b4a1a', '#ffd35a', 6],
  arterial: ['#4a3f35', '#fff6dc', 5], urban: ['#4a3f35', '#fff6dc', 3.5],
  ramp: ['#4a3f35', '#e9dcb5', 3], local: ['#6d5f50', '#e9dcb5', 2.2],
};

export class Minimap {
  constructor(parent, ctx) {
    this.ctx = ctx;
    this.cv = el('canvas', 'minimap', parent);
    this.cv.width = this.cv.height = SIZE;
    this.cv.dataset.testid = 'minimap';
    this.g = this.cv.getContext('2d');
    this.acc = 99;
    this.base = null; this.data = null;
    this.routeSig = ''; this.routePath = null;
    // camera: vetor "para cima da tela" no chão
    const d = ctx.cameraRig.dir, l = Math.hypot(d.x, d.z) || 1;
    const fx = -d.x / l, fz = -d.z / l;
    this.m = { a: -fz, b: -fx, c: fx, d: -fz }; // mundo(x,z) -> canvas (antes da escala/translação)
  }

  reset() { this.acc = 99; this.routeSig = ''; this.routePath = null; }

  _build() {
    let data = null;
    try { data = this.ctx.world.getMinimapData(); } catch (e) { data = null; }
    this.data = data;
    if (!data) return;
    const B = data.bounds, w = Math.ceil((B.maxX - B.minX) * BASE_K), h = Math.ceil((B.maxZ - B.minZ) * BASE_K);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#d9c692'; g.fillRect(0, 0, w, h);                  // cerrado
    g.fillStyle = 'rgba(120,160,90,.25)';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const draw = (pass) => {
      for (const r of data.roads) {
        const st = ROAD_STYLE[r.kind] || ROAD_STYLE.urban, p = r.pts;
        if (!p || p.length < 4) continue;
        g.beginPath();
        g.moveTo((p[0] - B.minX) * BASE_K, (p[1] - B.minZ) * BASE_K);
        for (let i = 2; i < p.length; i += 2) g.lineTo((p[i] - B.minX) * BASE_K, (p[i + 1] - B.minZ) * BASE_K);
        g.strokeStyle = pass === 0 ? st[0] : st[1];
        g.lineWidth = pass === 0 ? st[2] + 2.4 : st[2];
        g.stroke();
      }
    };
    draw(0); draw(1);
    g.strokeStyle = '#4a3f35'; g.fillStyle = '#e9dcb5'; g.lineWidth = 1.5;
    for (const rb of data.roundabouts || []) { g.beginPath(); g.arc((rb.x - B.minX) * BASE_K, (rb.z - B.minZ) * BASE_K, Math.max(3, rb.r * BASE_K), 0, 7); g.fill(); g.stroke(); }
    for (const l of data.landmarks || []) { // marcos: losangos roxos
      const x = (l.x - B.minX) * BASE_K, y = (l.z - B.minZ) * BASE_K;
      g.fillStyle = '#6a4fb0'; g.beginPath(); g.moveTo(x, y - 3.5); g.lineTo(x + 3.5, y); g.lineTo(x, y + 3.5); g.lineTo(x - 3.5, y); g.closePath(); g.fill();
    }
    this.base = cv;
  }

  _routePath() {
    const route = this.ctx.trip && this.ctx.trip.route;
    if (!route || !route.length) { this.routePath = null; this.routeSig = ''; return; }
    const sig = route.length + ':' + route[0] + ':' + route[route.length >> 1] + ':' + route[route.length - 1];
    if (sig === this.routeSig) return;
    this.routeSig = sig;
    const net = this.ctx.net, path = new Path2D();
    let first = true;
    for (const id of route) {
      const lane = net.getLane ? net.getLane(id) : net.lanes[id];
      if (!lane || !lane.pts) continue;
      const p = lane.pts;
      for (let i = 0; i < p.length; i += 2) {
        if (first) { path.moveTo(p[i], p[i + 1]); first = false; } else path.lineTo(p[i], p[i + 1]);
      }
    }
    this.routePath = path;
  }

  frame(dt, st) {
    this.acc += dt;
    if (this.acc < STEP) return;
    this.acc = 0;
    if (!this.data && !this._tried) { this._tried = true; this._build(); }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#d9c692'; g.fillRect(0, 0, SIZE, SIZE);
    if (!this.base) { g.fillStyle = '#3b2f2f'; g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('sem mapa', SIZE / 2, SIZE / 2); return; }

    const p = st.player, tr = st.trip, B = this.data.bounds, k = SIZE / VIEW_M, m = this.m;
    const cx = SIZE / 2, cy = SIZE * 0.56; // jogador um pouco abaixo do centro: mais mapa à frente
    const e = cx - k * (m.a * p.x + m.c * p.z), f = cy - k * (m.b * p.x + m.d * p.z);
    // base
    g.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, e, f);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);
    // rota sugerida
    this._routePath();
    if (this.routePath) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = '#102a5c'; g.lineWidth = 7 / k; g.stroke(this.routePath);
      g.strokeStyle = '#38b6ff'; g.lineWidth = 4 / k; g.stroke(this.routePath);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // zonas casa / STJ
    const zones = this.data.zones || {};
    for (const key in zones) {
      const z = zones[key];
      const sx = k * (m.a * z.x + m.c * z.z) + e, sy = k * (m.b * z.x + m.d * z.z) + f;
      const isDest = Math.hypot(tr.destX - z.x, tr.destZ - z.z) < 25;
      // STJ: só o estacionamento da viagem (stj_norte/oeste/leste); 'stj' é apelido
      if (key !== 'casa' && key !== 'stj_' + (tr.parking || 'leste')) continue;
      if (sx < -10 || sy < -10 || sx > SIZE + 10 || sy > SIZE + 10) continue;
      this._pin(g, sx, sy, key === 'casa' ? 'CASA' : 'STJ', isDest ? '#ffc928' : '#8a8f99', isDest);
    }
    // destino fora do recorte: seta na borda
    const dx = k * (m.a * tr.destX + m.c * tr.destZ) + e, dy = k * (m.b * tr.destX + m.d * tr.destZ) + f;
    const mg = 18;
    if (dx < mg || dy < mg || dx > SIZE - mg || dy > SIZE - mg) {
      const ax = Math.min(SIZE - mg, Math.max(mg, dx)), ay = Math.min(SIZE - mg, Math.max(mg, dy));
      const ang = Math.atan2(dy - ay, dx - ax);
      g.save(); g.translate(ax, ay); g.rotate(ang);
      g.fillStyle = '#ffc928'; g.strokeStyle = '#1b1230'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -8); g.lineTo(-3, 0); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill();
      g.restore();
    }
    // jogador: seta vermelha com contorno
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    const vx = m.a * hx + m.c * hz, vy = m.b * hx + m.d * hz;
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(vy, vx));
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(13, 0); g.lineTo(-9, -8); g.lineTo(-4, 0); g.lineTo(-9, 8); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // norte
    const nx = m.c * -1, ny = m.d * -1; // mundo (0,-1) = norte
    g.save(); g.translate(SIZE - 22, 22); g.rotate(Math.atan2(ny, nx) + Math.PI / 2);
    g.fillStyle = 'rgba(27,18,48,.8)'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
    g.fillStyle = '#ff6a55'; g.beginPath(); g.moveTo(0, -11); g.lineTo(5, 3); g.lineTo(-5, 3); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('N', SIZE - 22, 33 + 4);
  }

  _pin(g, x, y, label, col, big) {
    const r = big ? 8 : 6;
    g.fillStyle = col; g.strokeStyle = '#1b1230'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
    g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.lineWidth = 3.5; g.strokeStyle = '#1b1230'; g.fillStyle = '#fff';
    g.strokeText(label, x, y - r - 4); g.fillText(label, x, y - r - 4);
  }
}
