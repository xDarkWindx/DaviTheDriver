// UI do jogo (menu, HUD, pausa, fim, recordes, toque). Contrato: só LÊ ctx.state, escuta eventos e EMITE EV.REQ_*.
// Único escritor de state.settings (persistido em localStorage; emite EV.SETTINGS_CHANGE).
// O CSS fica em index.html (estrutura e estilo). Os módulos desta pasta:
//   dom.js (helpers) · storage.js (opções/recordes) · texts.js (copy pt-BR) · pixel.js (pixel art em canvas)
//   menu.js · panels.js (Como jogar/Opções) · hud.js + minimap.js · end.js (telas de fim) · touch.js · demo.js (?uidemo=1)
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { el, clamp, rnd } from './dom.js';
import { loadSettings, saveSettings, loadSelection, submitRecord } from './storage.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { buildHowTo, buildOptions } from './panels.js';
import { buildEndModel, renderEnd, rollSinistro } from './end.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Demo, demoRequested } from './demo.js';
import { TOASTS, PEAK_SUB, PAUSE_QUIPS } from './texts.js';

export default {
  name: 'ui',

  init(ctx) {
    const st = ctx.state, ev = ctx.events;
    this.ctx = ctx;
    let layer = document.getElementById('ui-layer') || document.getElementById('ui-root');
    if (!layer) { layer = el('div', '', document.body); layer.id = 'ui-layer'; }
    this.layer = layer;
    layer.classList.add('ui-layer');

    // ---- opções (carrega do storage, aplica em state.settings e avisa os outros módulos)
    loadSettings(st.settings);
    st.settings.quality = 'leve';
    this.applySetting = (key, val) => {
      if (key === 'volume') val = clamp(+val || 0, 0, 1);
      if (key === 'quality' && val !== 'leve') return; // 'hd' ainda não existe
      st.settings[key] = val;
      saveSettings(st.settings);
      ev.emit(EV.SETTINGS_CHANGE, { ...st.settings });
    };
    ev.emit(EV.SETTINGS_CHANGE, { ...st.settings });

    // ---- telas
    this.sel = loadSelection({ mode: 'davi', route: 'casa-stj' });
    if (!['davi', 'carona', 'perigo'].includes(this.sel.mode)) this.sel.mode = 'davi';
    if (!['casa-stj', 'stj-casa'].includes(this.sel.route)) this.sel.route = 'casa-stj';

    this.howto = buildHowTo(layer);
    this.options = buildOptions(layer, st.settings, this.applySetting);
    this.modals = [this.howto, this.options];
    const start = (routeId, mode) => ev.emit(EV.REQ_START, { routeId, mode });
    this.menu = new Menu(layer, ctx, this.sel, { start, howto: () => this.howto.open(), options: () => { this.options.sync(); this.options.open(); } });
    this.hud = new Hud(layer, ctx);
    this._buildPause(layer);
    this.end = el('div', 'screen end', layer); this.end.dataset.testid = 'end';
    this.touch = isTouchDevice() ? new TouchControls(layer, ctx, () => ev.emit(EV.REQ_PAUSE, {})) : null;
    layer.classList.toggle('is-touch', !!this.touch);
    this.demo = demoRequested() ? new Demo(this, ctx) : null;

    // ---- teclado da UI (captura: roda antes do Input do núcleo)
    window.addEventListener('keydown', (e) => {
      const open = this.modals.find((m) => m.isOpen);
      if (open && e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); open.close(); return; }
      if (e.code === 'Enter' && st.mode === MODE.MENU && !open && !(e.target && /^(BUTTON|INPUT|A)$/.test(e.target.tagName))) {
        e.preventDefault(); start(this.sel.route, this.sel.mode);
      }
    }, true);

    // ---- eventos
    this.lastCol = null;
    ev.on(EV.STATE_CHANGE, (p) => {
      if (p.to === MODE.MENU) st.result = null;
      this.show();
    });
    ev.on(EV.TRIP_START, () => {
      this.hud.reset(); this.lastCol = null; rollSinistro(); st.result = null; // resultado antigo nunca vaza para a viagem nova
      this.howto.close(); this.options.close();
    });
    ev.on(EV.COLLISION, (c) => { if (c && c.a === 'player') this.lastCol = c; });
    ev.on(EV.TRIP_FINISH, (f) => this._onFinish(f));
    ev.on(EV.FINE, (f) => this.hud.fine(f));
    ev.on(EV.SAY, (p) => this.hud.say(p));
    ev.on(EV.PASSENGER_SAY, (p) => {
      const i = p && p.intensity != null ? +p.intensity : 0.3;
      this.hud.say({ who: st.trip.passenger || 'davi', role: 'passenger', text: p && p.text, tone: i > 0.66 ? 'panic' : i > 0.33 ? 'stress' : 'anx', ttl: p && p.ttl });
    });
    const pickT = rnd;
    ev.on(EV.OVERTAKEN, () => { const [a, b] = pickT(TOASTS.overtaken); this.hud.toast('info', a, b, 2.6, 'overtaken'); });
    ev.on(EV.CUT_OFF, () => { const [a, b] = pickT(TOASTS.cutOff); this.hud.toast('warn', a, b, 2.8, 'cutoff'); });
    ev.on(EV.HONKED_AT, () => { const [a, b] = pickT(TOASTS.honkedAt); this.hud.toast('info', a, b, 2.4, 'honked'); });
    ev.on(EV.NEAR_MISS, () => { const [a, b] = pickT(TOASTS.nearMiss); this.hud.toast('warn', a, b, 2.2, 'near'); });
    ev.on(EV.MOOD_PEAK, (p) => {
      const who = p && p.who === 'dono' ? 'dono' : 'davi';
      this.hud.toast('peak', p && p.bar === 'stress' ? TOASTS.peakStress : TOASTS.peakAnx, PEAK_SUB[who], 2.6, 'peak' + (p && p.bar));
    });
    ev.on(EV.HORN, () => this.hud.flash('horn'));
    ev.on(EV.BREATHE, () => this.hud.flash('breathe'));
    ev.on(EV.CURSE, () => this.hud.flash('curse'));

    this.show();
  },

  _buildPause(layer) {
    const ev = this.ctx.events;
    const root = this.pause = el('div', 'screen pause', layer); root.dataset.testid = 'pause';
    const card = el('div', 'pause-card', root);
    el('h2', 'pause-title', card, 'PAUSADO');
    this.pauseQuip = el('p', 'pause-quip', card, PAUSE_QUIPS[0]);
    this.pauseLabel = el('div', 'pause-label', card);
    const col = el('div', 'pause-btns', card);
    const mk = (txt, tid, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), col, txt); b.dataset.testid = tid; b.onclick = fn; return b; };
    this.btnResume = mk('CONTINUAR', 'resume', () => ev.emit(EV.REQ_RESUME, {}), 'go');
    mk('REINICIAR VIAGEM', 'restart', () => ev.emit(EV.REQ_START, { routeId: this.ctx.state.trip.routeId, mode: this.ctx.state.trip.mode }));
    mk('OPÇÕES', 'pause-options', () => { this.options.sync(); this.options.open(); });
    mk('COMO JOGAR', 'pause-howto', () => this.howto.open());
    mk('VOLTAR AO MENU', 'pause-menu', () => ev.emit(EV.REQ_MENU, {}));
  },

  _onFinish(f) {
    const ctx = this.ctx, st = ctx.state;
    const m = buildEndModel(ctx, f, this.lastCol, null);
    if (f.reason === 'chegou') m.rec = submitRecord(st.trip.mode, st.trip.routeId, m.points, m.time);
    this.endBtn = renderEnd(this.end, m, {
      again: () => ctx.events.emit(EV.REQ_START, { routeId: st.trip.routeId, mode: st.trip.mode }),
      menu: () => ctx.events.emit(EV.REQ_MENU, {}),
    });
    this.menu.refresh();
  },

  show() {
    const m = this.ctx.state.mode;
    const playing = m === MODE.PLAYING, paused = m === MODE.PAUSED;
    this.layer.dataset.mode = m;
    this.menu.setVisible(m === MODE.MENU);
    this.hud.setVisible(playing || paused);
    this.pause.style.display = paused ? '' : 'none';
    this.end.style.display = m === MODE.FINISHED ? '' : 'none';
    if (this.touch) this.touch.setVisible(playing);
    if (paused) { this.pauseQuip.textContent = rnd(PAUSE_QUIPS); this.pauseLabel.textContent = this.ctx.state.trip.label; this.btnResume.focus({ preventScroll: true }); }
    if (m === MODE.FINISHED && this.endBtn) this.endBtn.focus({ preventScroll: true });
    if (m === MODE.MENU) this.menu.go.focus({ preventScroll: true });
  },

  frame(dt, alpha, ctx) {
    const st = ctx.state, m = st.mode;
    if (m !== MODE.PLAYING && m !== MODE.PAUSED) return;
    if (this.demo) this.demo.frame(Math.min(dt, 0.1), st);
    this.hud.update(Math.min(dt, 0.1), st, m === MODE.PLAYING);
    if (m === MODE.PLAYING) this.hud.frameMinimap(dt, st);
  },
};
