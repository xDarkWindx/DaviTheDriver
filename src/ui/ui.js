// UI PROVISÓRIA E DESCARTÁVEL — só para jogar ponta a ponta agora.
// Será substituída inteira pelo agente de UI. Regras: NENHUMA lógica de jogo aqui;
// a UI só LÊ ctx.state / escuta eventos e EMITE pedidos (EV.REQ_*).
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { MODES, ROUTES } from '../config.js';

const CSS = `
#ui-root{font-family:"Segoe UI",Arial,sans-serif;color:#fff}
.ui-panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;background:rgba(10,20,30,.35)}
.ui-card{background:rgba(20,28,36,.92);border-radius:12px;padding:22px 28px;max-width:560px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.ui-card h1{margin:0 0 4px;font-size:30px;letter-spacing:.5px}.ui-card p{margin:4px 0 12px;opacity:.85;font-size:14px}
.ui-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.ui-btn{cursor:pointer;border:2px solid #ffd21f;background:transparent;color:#fff;padding:8px 12px;border-radius:8px;font-size:14px}
.ui-btn.sel,.ui-btn:hover{background:#ffd21f;color:#111}
.ui-go{background:#ffd21f;color:#111;font-weight:bold;font-size:17px;padding:10px 18px}
.ui-small{font-size:12px;opacity:.75}
.ui-hud{position:absolute;pointer-events:none;text-shadow:0 1px 3px #000;font-weight:600}
`;

export default {
  name: 'ui',
  init(ctx) {
    const root = document.getElementById('ui-root');
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    this.ctx = ctx; this.root = root;
    this.sel = { mode: 'davi', route: 'casa-stj' };

    // ---- menu
    const menu = el('div', 'ui-panel', root);
    const card = el('div', 'ui-card', menu);
    el('h1', '', card).textContent = 'Davi, the Driver';
    el('p', '', card).textContent = 'Kwid branco, 4 batidas no ano — e a culpa é sempre dos outros. Chegue sem bater, sem multa, no menor tempo.';
    el('div', 'ui-small', card).textContent = 'MODO';
    const modeRow = el('div', 'ui-row', card);
    const modeDesc = el('p', 'ui-small', card);
    const modeBtns = {};
    for (const m of Object.values(MODES)) {
      const b = el('button', 'ui-btn', modeRow); b.textContent = m.label; b.dataset.mode = m.id;
      b.onclick = () => { this.sel.mode = m.id; refresh(); };
      modeBtns[m.id] = b;
    }
    el('div', 'ui-small', card).textContent = 'ROTA';
    const routeRow = el('div', 'ui-row', card);
    const routeBtns = {};
    for (const r of Object.values(ROUTES)) {
      const b = el('button', 'ui-btn', routeRow); b.textContent = `${r.label} (${r.timeOfDay === 'manha' ? 'manhã' : 'fim de tarde'})`; b.dataset.route = r.id;
      b.onclick = () => { this.sel.route = r.id; refresh(); };
      routeBtns[r.id] = b;
    }
    const go = el('button', 'ui-btn ui-go', el('div', 'ui-row', card)); go.textContent = 'Iniciar viagem'; go.id = 'ui-start';
    go.onclick = () => ctx.events.emit(EV.REQ_START, { routeId: this.sel.route, mode: this.sel.mode });
    el('p', 'ui-small', card).textContent = 'WASD/setas: dirigir · Espaço: freio de mão · H: buzina · R: respirar · X: xingar · P/Esc: pausa';
    const refresh = () => {
      for (const k in modeBtns) modeBtns[k].classList.toggle('sel', k === this.sel.mode);
      for (const k in routeBtns) routeBtns[k].classList.toggle('sel', k === this.sel.route);
      modeDesc.textContent = MODES[this.sel.mode].description;
    };
    refresh();
    this.menu = menu;

    // ---- HUD (cantos livres: tempo embaixo-esq., velocidade embaixo-dir.)
    this.hudTL = el('div', 'ui-hud', root); Object.assign(this.hudTL.style, { left: '14px', top: '12px', fontSize: '15px' });
    this.hudBL = el('div', 'ui-hud', root); Object.assign(this.hudBL.style, { left: '16px', bottom: '14px', fontSize: '26px' });
    this.hudBR = el('div', 'ui-hud', root); Object.assign(this.hudBR.style, { right: '18px', bottom: '14px', fontSize: '30px', textAlign: 'right' });

    // ---- pausa / fim
    this.pause = el('div', 'ui-panel', root);
    const pc = el('div', 'ui-card', this.pause);
    el('h1', '', pc).textContent = 'Pausado';
    const pr = el('div', 'ui-row', pc);
    const b1 = el('button', 'ui-btn', pr); b1.textContent = 'Continuar'; b1.onclick = () => ctx.events.emit(EV.REQ_RESUME, {});
    const b2 = el('button', 'ui-btn', pr); b2.textContent = 'Desistir (menu)'; b2.onclick = () => ctx.events.emit(EV.REQ_MENU, {});
    this.fin = el('div', 'ui-panel', root);
    const fc = el('div', 'ui-card', this.fin);
    this.finTitle = el('h1', '', fc); this.finText = el('p', '', fc);
    const fr = el('div', 'ui-row', fc);
    const b3 = el('button', 'ui-btn ui-go', fr); b3.textContent = 'De novo'; b3.id = 'ui-again';
    b3.onclick = () => ctx.events.emit(EV.REQ_START, { routeId: ctx.state.trip.routeId, mode: ctx.state.trip.mode });
    const b4 = el('button', 'ui-btn', fr); b4.textContent = 'Menu'; b4.onclick = () => ctx.events.emit(EV.REQ_MENU, {});

    ctx.events.on(EV.STATE_CHANGE, () => this.show());
    ctx.events.on(EV.TRIP_FINISH, (f) => {
      const t = fmt(f.time);
      this.finTitle.textContent = f.reason === 'chegou' ? 'Chegou!' : f.reason === 'bateu' ? 'Bateu! (a culpa foi do outro, claro)' : 'Desistiu';
      this.finText.textContent = `${ctx.state.trip.label} — tempo ${t}. Multas: R$ ${ctx.state.fineTotal.toFixed(2)}.`;
    });
    this.show();
  },
  show() {
    const m = this.ctx.state.mode;
    this.menu.style.display = m === MODE.MENU ? 'flex' : 'none';
    this.pause.style.display = m === MODE.PAUSED ? 'flex' : 'none';
    this.fin.style.display = m === MODE.FINISHED ? 'flex' : 'none';
    const hud = m === MODE.PLAYING || m === MODE.PAUSED;
    this.hudTL.style.display = this.hudBL.style.display = this.hudBR.style.display = hud ? 'block' : 'none';
  },
  frame(dt, alpha, ctx) {
    const st = ctx.state;
    if (st.mode !== MODE.PLAYING) return;
    this._acc = (this._acc || 0) + dt;
    if (this._acc < 0.1) return; // atualiza texto a 10 Hz
    this._acc = 0;
    const p = st.player, tr = st.trip;
    this.hudTL.textContent = `${tr.label} · ${p.roadName || 'fora da via'} · destino a ${(tr.routeDistLeft || tr.distToDest).toFixed(0)} m`;
    this.hudBL.textContent = fmt(tr.elapsed);
    this.hudBR.innerHTML = `${p.speedKmh.toFixed(0)} km/h<br><span style="font-size:15px">limite ${p.speedLimitKmh || '—'} km/h</span>`;
  },
};

function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; }
