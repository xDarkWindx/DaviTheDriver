// Entrada: teclado (+ API "virtual" para toque/automação).
// Ações: up, down, left, right, handbrake, horn, breathe, curse, flash (F, piscar farol), pause.
import { EV } from './events.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  KeyH: 'horn',
  KeyR: 'breathe',
  KeyX: 'curse',
  KeyF: 'flash',
  KeyP: 'pause', Escape: 'pause',
};

// Ações que viram evento ao serem pressionadas (só durante PLAYING)
const ACTION_EVENTS = { horn: EV.HORN, breathe: EV.BREATHE, curse: EV.CURSE, flash: EV.FLASH };

export class Input {
  constructor(events) {
    this.events = events;
    this.keys = Object.create(null);     // teclado
    this.virtual = Object.create(null);  // toque / scripts
    this.held = { up: false, down: false, left: false, right: false, handbrake: false, horn: false, breathe: false, curse: false, flash: false, pause: false };
    // Eixos já combinados (lidos pelo player)
    this.axes = { throttle: 0, brake: 0, steer: 0 }; // steer: +1 = esquerda
    this.handbrake = false;
    this.enabled = true;          // false = ignora controles de direção (ex.: cutscene)
    this.isPlaying = () => true;  // injetado pelo game
    this._onDown = (e) => this._key(e, true);
    this._onUp = (e) => this._key(e, false);
    this._onBlur = () => { for (const k in this.keys) this.keys[k] = false; };
  }

  attach(target = window) {
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  _key(e, down) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    const was = this.keys[e.code];
    this.keys[e.code] = down;
    if (down && !was) this._press(action);
    if (!down && was) this._release(action);
  }

  _press(action) {
    if (action === 'pause') { this.events.emit('input:pause'); return; }
    const ev = ACTION_EVENTS[action];
    if (ev && this.isPlaying()) this.events.emit(ev, { source: 'player' });
  }
  _release(action) {
    if (action === 'horn' && this.isPlaying()) this.events.emit(EV.HORN_END, { source: 'player' });
  }

  /** Liga/desliga uma ação virtual (botões de toque, testes). Dispara eventos como o teclado. */
  setVirtual(action, down) {
    const was = !!this.virtual[action];
    this.virtual[action] = !!down;
    if (down && !was) this._press(action);
    if (!down && was) this._release(action);
  }

  /** Chamado 1x por passo de simulação. */
  sample() {
    const h = this.held;
    for (const a in h) h[a] = false;
    for (const code in this.keys) if (this.keys[code]) h[KEYMAP[code]] = true;
    for (const a in this.virtual) if (this.virtual[a]) h[a] = true;
    const on = this.enabled;
    this.axes.throttle = on && h.up ? 1 : 0;
    this.axes.brake = on && h.down ? 1 : 0;
    this.axes.steer = on ? (h.left ? 1 : 0) - (h.right ? 1 : 0) : 0;
    this.handbrake = on && h.handbrake;
  }
}
