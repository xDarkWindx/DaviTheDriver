// Helpers de DOM e formatação (pt-BR). Nada aqui roda por frame sem checar mudança antes.

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Escreve texto só se mudou (evita layout à toa). */
export function setText(node, str) {
  if (node._t !== str) { node._t = str; node.textContent = str; }
}

/** Liga/desliga classe só se mudou. */
export function setClass(node, cls, on) {
  on = !!on;
  if (node['_c_' + cls] !== on) { node['_c_' + cls] = on; node.classList.toggle(cls, on); }
}

export function setStyle(node, prop, val) {
  const k = '_s_' + prop;
  if (node[k] !== val) { node[k] = val; node.style[prop] = val; }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function fmtTime(t) {
  if (!(t >= 0)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export function fmtInt(n) {
  n = Math.round(n || 0);
  return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') .replace(/^/, n < 0 ? '-' : '');
}

export function fmtMoney(v) {
  v = Number(v) || 0;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return `R$ ${v < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}

export function fmtMult(m) {
  m = Number(m) || 1;
  return 'x' + (Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1).replace('.', ','));
}

export function fmtDist(m) {
  m = Math.max(0, m || 0);
  return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m';
}

/** Escolha determinística (mesma batida = mesmo texto) a partir de uma semente numérica. */
export function pick(list, seed) {
  const i = Math.abs(Math.floor(seed || 0)) % list.length;
  return list[i];
}
export const rnd = (list) => list[Math.floor(Math.random() * list.length)];
