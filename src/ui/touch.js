// Controles de toque: só aparecem em dispositivo de toque (ou com ?touch=1). Usam input.setVirtual.
import { el } from './dom.js';

export function isTouchDevice() {
  try {
    if (/[?&]touch=1\b/.test(location.search)) return true;
    return !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window);
  } catch (e) { return false; }
}

function bind(btn, input, action) {
  const down = (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } btn.classList.add('down'); input.setVirtual(action, true); };
  const up = (e) => { e.preventDefault(); btn.classList.remove('down'); input.setVirtual(action, false); };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

export class TouchControls {
  constructor(layer, ctx, onPause) {
    this.root = el('div', 'touch', layer);
    this.root.dataset.testid = 'touch';
    const input = ctx.input;
    const mk = (parent, cls, label, action, tid) => { const b = el('button', 'tbtn ' + cls, parent, label); b.dataset.testid = tid; b.setAttribute('aria-label', tid); bind(b, input, action); return b; };
    const left = el('div', 't-left', this.root);
    mk(left, 'steer', '◀', 'left', 't-left'); mk(left, 'steer', '▶', 'right', 't-right');
    const right = el('div', 't-right-cluster', this.root);
    mk(right, 'small', 'FREIO DE MÃO', 'handbrake', 't-handbrake');
    mk(right, 'pedal brake', 'FREIO', 'down', 't-brake');
    mk(right, 'pedal gas', 'ACELERAR', 'up', 't-gas');
    const acts = el('div', 't-acts', this.root);
    mk(acts, 'small', 'H', 'horn', 't-horn'); mk(acts, 'small', 'R', 'breathe', 't-breathe'); mk(acts, 'small', 'X', 'curse', 't-curse');
    const p = el('button', 'tbtn small t-pause', this.root, 'II'); p.dataset.testid = 't-pause'; p.setAttribute('aria-label', 'Pausar');
    p.addEventListener('pointerdown', (e) => { e.preventDefault(); onPause(); });
  }
  setVisible(v) { this.root.style.display = v ? '' : 'none'; }
}
