// Camadas DOM/CSS baratas do fx.js (nada de filter/backdrop-filter; só opacity/transform sobre gradientes estáticos).
// O contêiner #fx-layer fica logo acima do canvas e ABAIXO de #ui-layer.

const CSS = `
#fx-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;contain:strict}
#fx-layer>div,#fx-layer canvas{position:absolute;pointer-events:none;will-change:opacity}
#fx-layer .fx-core{inset:0}
#fx-layer .fx-core>*{position:absolute;inset:0;opacity:0}
#fx-layer .fx-tunnel{inset:-20% !important;will-change:transform,opacity;
  background:radial-gradient(closest-side,rgba(0,0,0,0) 56%,rgba(4,4,12,.5) 78%,rgba(0,0,0,.93) 100%)}
#fx-layer .fx-red{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 46%,rgba(170,12,12,.32) 74%,rgba(150,0,0,.78) 100%)}
#fx-layer .fx-cold{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 48%,rgba(95,80,215,.32) 76%,rgba(70,50,185,.72) 100%)}
#fx-layer canvas.fx-speed,#fx-layer canvas.fx-veins{width:100%;height:100%;inset:0;will-change:opacity,transform}
#fx-layer .fx-flash{background:#fff}
#fx-layer .fx-retro{inset:0;opacity:1}
#fx-layer .fx-retro>*{position:absolute;inset:0}
#fx-layer .fx-scan{background:repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,0) 2px,rgba(0,0,0,.17) 2px,rgba(0,0,0,.17) 3px)}
#fx-layer .fx-rvig{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(0,0,0,.30) 100%)}
#fx-layer .fx-grain{inset:-64px;opacity:.07;background-repeat:repeat;image-rendering:pixelated;will-change:transform}
#fx-layer.fx-noretro .fx-retro{display:none}
#fx-layer.fx-menu .fx-core{display:none}
`;

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Linhas de velocidade radiais (desenhadas uma vez). */
function drawSpeedLines(cv) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, r = rng(7);
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, r0 = R * (0.58 + r() * 0.22), r1 = r0 + R * (0.12 + r() * 0.3);
    const x0 = cx + Math.cos(a) * r0 * 1.0, y0 = cy + Math.sin(a) * r0 * 0.9, x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1 * 0.9;
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.35 + r() * 0.4})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 0.8 + r() * 1.8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
}

/** Veias de raiva e raios nos cantos (desenhados uma vez). */
function drawVeins(cv) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, r = rng(13);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    if (depth <= 0 || len < 6) return;
    g.beginPath(); g.moveTo(x, y);
    let px = x, py = y, a = ang; const steps = 5;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.9; px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps; g.lineTo(px, py);
    }
    g.lineWidth = w + 2.5; g.strokeStyle = 'rgba(40,0,0,.55)'; g.stroke();
    g.lineWidth = w; g.strokeStyle = depth > 1 ? 'rgba(205,18,18,.92)' : 'rgba(235,40,30,.85)'; g.stroke();
    branch(px, py, a + 0.5 + r() * 0.4, len * 0.62, w * 0.7, depth - 1);
    branch(px, py, a - 0.5 - r() * 0.4, len * 0.55, w * 0.7, depth - 1);
    if (r() < 0.6) branch(px, py, a + (r() - 0.5) * 0.4, len * 0.7, w * 0.8, depth - 1);
  };
  const corners = [[0, 0, 0.78], [W, 0, 2.36], [0, H, -0.78], [W, H, -2.36]];
  for (const [cx, cy, base] of corners) {
    // raios (triângulos finos e chanfrados) saindo do canto
    for (let i = 0; i < 6; i++) {
      const a = base + (i - 2.5) * 0.28 + (r() - 0.5) * 0.1, len = H * (0.22 + r() * 0.2);
      g.beginPath(); g.moveTo(cx + Math.cos(a - 0.05) * 6, cy + Math.sin(a - 0.05) * 6);
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.lineTo(cx + Math.cos(a + 0.05) * 6, cy + Math.sin(a + 0.05) * 6);
      g.fillStyle = 'rgba(190,10,10,.55)'; g.fill();
    }
    for (let i = 0; i < 3; i++) branch(cx, cy, base + (i - 1) * 0.5 + (r() - 0.5) * 0.3, H * (0.18 + r() * 0.1), 4.5, 4);
  }
}

function noiseURL() {
  const c = mkCanvas(96, 96), g = c.getContext('2d'), im = g.createImageData(96, 96), r = rng(99);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

export class Overlay {
  constructor() {
    this.layer = null; this.v = {}; this._grainT = 0; this._rot = 0; this._rotT = 0;
  }

  mount({ grain = true } = {}) {
    if (!document.getElementById('fx-style')) {
      const st = document.createElement('style'); st.id = 'fx-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    const layer = document.createElement('div'); layer.id = 'fx-layer'; layer.setAttribute('aria-hidden', 'true');
    this.layer = layer;
    const core = document.createElement('div'); core.className = 'fx-core';
    const mk = (cls, parent = core, tag = 'div') => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
    this.cold = mk('fx-cold'); this.red = mk('fx-red'); this.tunnel = mk('fx-tunnel');
    const sp = mkCanvas(480, 270); sp.className = 'fx-speed'; core.appendChild(sp); drawSpeedLines(sp); this.speed = sp;
    const ve = mkCanvas(640, 360); ve.className = 'fx-veins'; core.appendChild(ve); drawVeins(ve); this.veins = ve;
    this.flash = mk('fx-flash');
    layer.appendChild(core);
    const retro = document.createElement('div'); retro.className = 'fx-retro';
    mk('fx-scan', retro); mk('fx-rvig', retro);
    if (grain) { this.grain = mk('fx-grain', retro); this.grain.style.backgroundImage = `url(${noiseURL()})`; }
    layer.appendChild(retro);
    this.place();
    return this;
  }

  /** Garante a posição no DOM: acima do canvas, abaixo de #ui-layer (se existir). */
  place() {
    const layer = this.layer; if (!layer) return;
    const ui = document.getElementById('ui-layer');
    if (ui && ui.parentNode) {
      if (layer.parentNode !== ui.parentNode || layer.nextElementSibling !== ui) ui.parentNode.insertBefore(layer, ui);
      return;
    }
    if (layer.parentNode) return;
    const cv = document.querySelector('#game canvas') || document.querySelector('canvas');
    if (cv && cv.parentNode) cv.parentNode.insertBefore(layer, cv.nextSibling); else document.body.appendChild(layer);
  }

  setMenu(on) { this.layer.classList.toggle('fx-menu', on); }
  setRetro(on) { this.layer.classList.toggle('fx-noretro', !on); }

  _op(key, el, v) {
    v = v < 0.004 ? 0 : v > 1 ? 1 : v;
    if (Math.abs((this.v[key] ?? -1) - v) < 0.006 && !(v === 0 && this.v[key] !== 0)) return;
    this.v[key] = v; el.style.opacity = v;
  }
  _tf(key, el, s) { if (this.v[key] === s) return; this.v[key] = s; el.style.transform = s; }

  /** Aplica os valores já suavizados. */
  apply(o, dt, reduced) {
    this._op('tun', this.tunnel, o.tunnel);
    this._tf('tunT', this.tunnel, `scale(${o.tunnelScale.toFixed(3)})`);
    this._op('red', this.red, o.red);
    this._op('cold', this.cold, o.cold);
    this._op('speed', this.speed, o.speed);
    this._op('veins', this.veins, o.veins);
    this._op('flash', this.flash, o.flash);
    if (o.flashColor !== this.v.fc) { this.v.fc = o.flashColor; this.flash.style.background = o.flashColor; }
    // linhas de velocidade: gira entre poses fixas (efeito de "tremeluzir"), veias: tremida leve
    this._rotT += dt;
    if (this._rotT > 0.07) {
      this._rotT = 0; this._rot = (this._rot + 1) % 5;
      if (o.speed > 0.01 && !reduced) this._tf('spT', this.speed, `rotate(${(this._rot - 2) * 1.6}deg) scale(${1 + this._rot * 0.025})`);
      if (o.veins > 0.05 && !reduced) this._tf('veT', this.veins, `translate(${(this._rot - 2) * 1.5}px,${((this._rot * 3) % 5 - 2) * 1.2}px)`);
    }
    if (this.grain) {
      this._grainT += dt;
      if (this._grainT > 0.09) {
        this._grainT = 0;
        this.grain.style.transform = `translate(${(Math.random() * 64 - 32) | 0}px,${(Math.random() * 64 - 32) | 0}px)`;
      }
    }
  }

  clear() {
    for (const k of Object.keys(this.v)) delete this.v[k];
    for (const e of [this.tunnel, this.red, this.cold, this.speed, this.veins, this.flash]) e.style.opacity = 0;
  }
}
