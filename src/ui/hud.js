// HUD de jogo. Regra de ouro: o DOM só é tocado quando o valor (já arredondado) muda.
import { el, setText, setClass, setStyle, clamp, fmtTime, fmtInt, fmtMoney, fmtMult, fmtDist } from './dom.js';
import { drawFace, drawGesture } from './pixel.js';
import { Minimap } from './minimap.js';
import { ACTIONS, FINE_BY } from './texts.js';

const ZERO_TRANQ = 35; // abaixo disso, o dono calmo "está tranquilo"

class Bar {
  constructor(parent) {
    this.root = el('div', 'bar', parent);
    const head = el('div', 'bar-head', this.root);
    this.label = el('span', 'bar-label', head);
    this.val = el('span', 'bar-val', head);
    this.track = el('div', 'bar-track', this.root);
    this.floor = el('i', 'bar-floor', this.track);
    this.zone = el('i', 'bar-zone', this.track);
    this.fill = el('i', 'bar-fill', this.track);
    this.note = el('span', 'bar-note', this.track);
    this._q = -1;
  }
  /** v, floor, zoneLo/zoneHi em 0..100 (zoneHi<=zoneLo = sem zona). */
  set(v, floor, zlo, zhi, tranquilo) {
    v = clamp(+v || 0, 0, 100); floor = clamp(+floor || 0, 0, 100);
    const q = Math.round(v * 2);
    const lv = v >= 85 ? 3 : v >= 65 ? 2 : v >= 40 ? 1 : 0;
    if (q !== this._q) {
      this._q = q;
      setStyle(this.fill, 'transform', `scaleX(${(q / 200).toFixed(3)})`);
      setText(this.val, String(Math.round(v)));
    }
    setClass(this.root, 'lv0', lv === 0); setClass(this.root, 'lv1', lv === 1);
    setClass(this.root, 'lv2', lv === 2); setClass(this.root, 'lv3', lv === 3);
    setClass(this.root, 'hot', v >= 85);
    setStyle(this.floor, 'width', floor.toFixed(1) + '%');
    const hasZone = zhi > zlo;
    setClass(this.zone, 'on', hasZone);
    if (hasZone) { setStyle(this.zone, 'left', zlo.toFixed(1) + '%'); setStyle(this.zone, 'width', (zhi - zlo).toFixed(1) + '%'); }
    setText(this.note, tranquilo && v < ZERO_TRANQ ? 'tranquilo' : '');
  }
}

class MoodPanel {
  constructor(parent, role) {
    this.role = role;
    this.root = el('div', 'mood mood-' + role, parent);
    this.faceBox = el('div', 'face-box', this.root);
    this.face = el('canvas', 'face', this.faceBox);
    this.body = el('div', 'mood-body', this.root);
    const head = el('div', 'mood-head', this.body);
    this.name = el('b', 'mood-name', head);
    this.sub = el('span', 'mood-sub', head);
    this.b1 = new Bar(this.body);
    this.b2 = new Bar(this.body);
    this._key = ''; this._faceKey = '';
  }
  update(m, score, mode) {
    const on = !!(m && m.active);
    setClass(this.root, 'off', !on);
    if (!on) return;
    const who = m.who === 'dono' ? 'dono' : 'davi';
    const panic = who === 'dono' && this.role === 'passenger';
    const key = who + this.role + (panic ? 'p' : '');
    if (key !== this._key) {
      this._key = key;
      setText(this.name, who === 'davi' ? 'DAVI' : 'DONO');
      setText(this.sub, this.role === 'driver' ? 'ao volante' : 'de carona');
      setText(this.b1.label, panic ? 'SUSTO' : 'ANSIEDADE');
      setText(this.b2.label, panic ? 'PÂNICO' : 'ESTRESSE');
    }
    const a = m.anxiety, s = m.stress, lvl = Math.max(a, s);
    const tone = lvl < 30 ? 'calm' : lvl >= 82 ? 'panic' : a >= s ? 'anx' : 'stress';
    const fk = who + tone;
    if (fk !== this._faceKey) { this._faceKey = fk; drawFace(this.face, who, tone); }
    const useZone = this.role === 'driver' && score;
    const zlo = useZone ? score.zoneLo : 0, zhi = useZone ? score.zoneHi : 0;
    const tranq = who === 'dono' && this.role === 'driver';
    this.b1.set(a, m.floor, zlo, zhi, tranq);
    this.b2.set(s, m.floor, zlo, zhi, tranq);
    setClass(this.root, 'inzone', !!(useZone && score.inZone && zhi > zlo));
    setClass(this.root, 'peak', lvl >= 85);
    setClass(this.root, 'calm-mode', tranq && lvl < ZERO_TRANQ);
  }
}

export class Hud {
  constructor(layer, ctx) {
    this.ctx = ctx;
    this.clock = 0;                 // tempo de jogo acumulado só em PLAYING (para ttl de toasts/balões)
    this.root = el('div', 'hud', layer);
    this.root.dataset.testid = 'hud';

    // ---- topo esquerdo: humor
    const moods = el('div', 'mood-stack', this.root);
    this.moodDriver = new MoodPanel(moods, 'driver');
    this.moodPass = new MoodPanel(moods, 'passenger');
    this.moodDriver.root.dataset.testid = 'mood-driver';
    this.moodPass.root.dataset.testid = 'mood-passenger';

    // ---- topo direito: minimapa + via + destino
    const tr = el('div', 'tr-block', this.root);
    this.minimap = new Minimap(el('div', 'map-frame', tr), ctx);
    const plate = el('div', 'road-plate', tr);
    this.road = el('span', 'road-name', plate); this.road.dataset.testid = 'road-name';
    this.dest = el('span', 'dest-info', plate);

    // ---- topo centro: toasts, balões
    this.toasts = el('div', 'toasts', this.root);
    this.bubbles = el('div', 'bubbles', this.root);
    this.bubL = el('div', 'bub-col bub-driver', this.bubbles);
    this.bubR = el('div', 'bub-col bub-passenger', this.bubbles);
    this._toastList = []; this._bubList = []; this._bubQueue = { driver: [], passenger: [] };
    this._lastSay = { text: '', at: -9 }; this._lastToast = Object.create(null);

    // ---- embaixo esquerda: cronômetro, pontos, multas
    const bl = el('div', 'bl-card', this.root);
    this.timer = el('div', 'timer', bl); this.timer.dataset.testid = 'timer';
    const sr = el('div', 'score-row', bl);
    el('span', 'score-cap', sr, 'PONTOS');
    this.score = el('span', 'score-val', sr); this.score.dataset.testid = 'score';
    this.mult = el('span', 'mult', sr); this.mult.dataset.testid = 'mult';
    const fr = el('div', 'fines-row', bl);
    this.finesN = el('span', 'fines-n', fr); this.finesN.dataset.testid = 'fines';
    this.finesV = el('span', 'fines-v', fr);

    // ---- embaixo centro: ações
    const acts = el('div', 'acts', this.root);
    this.acts = {};
    for (const a of ACTIONS) {
      const b = el('div', 'act', acts); b.dataset.act = a.key; b.dataset.testid = 'act-' + a.key;
      el('b', 'act-key', b, a.keycap); el('span', 'act-label', b, a.label);
      const cd = el('i', 'act-cd', b);
      this.acts[a.key] = { node: b, cd, q: -1 };
    }
    this._onAct = (key) => {
      const a = this.acts[key]; if (!a) return;
      a.node.classList.add('flash'); clearTimeout(a.t); a.t = setTimeout(() => a.node.classList.remove('flash'), 160);
    };

    // ---- embaixo direita: velocímetro
    const sp = el('div', 'speedo', this.root);
    this.limit = el('div', 'limit-sign', sp);
    this.limitNum = el('span', '', this.limit);
    const main = el('div', 'speed-main', sp);
    this.speed = el('span', 'speed-num', main); this.speed.dataset.testid = 'speed';
    el('span', 'speed-unit', main, 'km/h');
    this.speedBar = el('div', 'speed-bar', sp);
    this.speedFill = el('i', 'speed-fill', this.speedBar);
    this.speedTick = el('b', 'speed-tick', this.speedBar);
    this.speedWarn = el('div', 'speed-warn', sp, 'ACIMA DO LIMITE!');
    this._q = {};
  }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }

  /** Início de viagem: limpa balões/toasts. */
  reset() {
    this.clock = 0;
    for (const t of this._toastList) t.node.remove();
    for (const b of this._bubList) b.node.remove();
    this._toastList.length = 0; this._bubList.length = 0; this._bubQueue.driver.length = 0; this._bubQueue.passenger.length = 0;
    this._lastToast = Object.create(null);
    this._q = {};
    this.minimap.reset();
  }

  // ---- toasts -----------------------------------------------------------
  /** kind: 'fine'|'info'|'warn'|'peak'. ttl em s. dedupKey evita repetir o mesmo aviso em <1,5 s. */
  toast(kind, title, sub, ttl = 3, dedupKey = null) {
    if (dedupKey) {
      const last = this._lastToast[dedupKey];
      if (last != null && this.clock - last < 1.5) return;
      this._lastToast[dedupKey] = this.clock;
    }
    const node = el('div', 'toast toast-' + kind, this.toasts);
    el('b', 'toast-title', node, title);
    if (sub) el('span', 'toast-sub', node, sub);
    this._toastList.push({ node, until: this.clock + ttl });
    while (this._toastList.length > 4) this._toastList.shift().node.remove();
    return node;
  }

  fine(f) {
    const node = el('div', 'toast toast-fine', this.toasts);
    el('b', 'toast-title', node, 'MULTA!');
    el('span', 'toast-what', node, f.label || 'Infração de trânsito');
    const row = el('span', 'toast-sub', node);
    row.textContent = `${fmtMoney(f.amount)} · ${f.points | 0} ponto${(f.points | 0) === 1 ? '' : 's'} na CNH` + (f.by && FINE_BY[f.by] ? ` · ${FINE_BY[f.by]}` : '');
    this._toastList.push({ node, until: this.clock + 4.2 });
    while (this._toastList.length > 4) this._toastList.shift().node.remove();
  }

  // ---- balões de fala ----------------------------------------------------
  say(p) {
    const text = p && p.text ? String(p.text) : '';
    const gesture = p && p.gesture ? String(p.gesture) : null;
    if (!p || (!text && !gesture)) return;
    if (text === this._lastSay.text && this.clock - this._lastSay.at < 1) return;
    this._lastSay.text = text; this._lastSay.at = this.clock;
    const role = p.role === 'passenger' ? 'passenger' : 'driver';
    const q = this._bubQueue[role];
    let ttl = +p.ttl; if (ttl > 60) ttl /= 1000;
    if (!(ttl > 0)) ttl = clamp(2 + text.length * 0.04, 2.2, 5);
    q.push({ who: p.who === 'dono' ? 'dono' : 'davi', role, text, tone: p.tone || 'anx', ttl, gesture });
    while (q.length > 2) q.shift();
    // fala nova chegando: as mais antigas somem mais rápido (sem parede de texto)
    for (const b of this._bubList) if (b.role === role && !b.leaving && b.until > this.clock + 0.7) b.until = this.clock + 0.7;
    this._pumpBubbles(role);
  }

  _pumpBubbles(role) {
    const q = this._bubQueue[role], col = role === 'driver' ? this.bubL : this.bubR;
    let n = 0; for (const b of this._bubList) if (b.role === role) n++;
    while (n < 2 && q.length) {
      const s = q.shift();
      const letters = s.text.replace(/[^A-Za-zÀ-ú]/g, ''), caps = letters.length >= 4 && letters === letters.toUpperCase();
      const loud = caps || s.tone === 'panic' || /!{2,}/.test(s.text);
      const node = el('div', `bubble tone-${s.tone}${loud ? ' loud' : ''}${s.text ? '' : ' gesture-only'}`, col);
      el('b', 'bub-name', node, s.who === 'davi' ? 'DAVI' : 'DONO');
      const row = el('div', 'bub-row', node);
      if (s.gesture) drawGesture(el('canvas', 'bub-gesture', row), s.gesture);
      if (s.text) el('span', 'bub-text', row, s.text);
      this._bubList.push({ node, role, until: this.clock + s.ttl });
      n++;
    }
  }

  // ---- por frame ----------------------------------------------------------
  update(dt, st, playing) {
    if (playing) this.clock += dt;
    // expira toasts e balões
    const T = this._toastList;
    for (let i = T.length - 1; i >= 0; i--) {
      const t = T[i];
      if (this.clock >= t.until) {
        if (!t.leaving) { t.leaving = true; t.node.classList.add('out'); t.until = this.clock + 0.3; }
        else { t.node.remove(); T.splice(i, 1); }
      }
    }
    const B = this._bubList; let freed = false;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      if (this.clock >= b.until) {
        if (!b.leaving) { b.leaving = true; b.node.classList.add('out'); b.until = this.clock + 0.3; }
        else { b.node.remove(); B.splice(i, 1); freed = true; }
      }
    }
    if (freed || this._bubQueue.driver.length || this._bubQueue.passenger.length) { this._pumpBubbles('driver'); this._pumpBubbles('passenger'); }

    const p = st.player, tr = st.trip, sc = st.score;
    // humor
    this.moodDriver.update(st.mood.driver, sc, tr.mode);
    this.moodPass.update(st.mood.passenger, null, tr.mode);
    // velocímetro
    const kmh = Math.round(p.speedKmh || 0), lim = Math.round(p.speedLimitKmh || 0);
    if (this._q.kmh !== kmh) {
      this._q.kmh = kmh; setText(this.speed, String(kmh));
      setStyle(this.speedFill, 'transform', `scaleX(${clamp(kmh / 200, 0, 1).toFixed(3)})`);
    }
    if (this._q.lim !== lim) {
      this._q.lim = lim; setText(this.limitNum, lim ? String(lim) : '--');
      setStyle(this.speedTick, 'left', (clamp(lim / 200, 0, 1) * 100).toFixed(1) + '%'); setClass(this.speedTick, 'on', lim > 0);
    }
    const over = lim > 0 && (p.speedKmh || 0) > lim + 1;
    setClass(this.root, 'over', over);
    // cronômetro, pontos, multas
    setText(this.timer, fmtTime(tr.elapsed));
    setText(this.score, fmtInt(sc ? sc.points : 0));
    const mu = sc ? sc.multiplier : 1;
    setText(this.mult, fmtMult(mu));
    setClass(this.mult, 'hi', mu >= 2);
    setClass(this.score.parentNode, 'inzone', !!(sc && sc.inZone));
    const nf = st.fines ? st.fines.length : 0;
    setText(this.finesN, nf ? `MULTAS ${nf}` : 'SEM MULTAS');
    setText(this.finesV, nf ? fmtMoney(st.fineTotal) : '');
    setClass(this.finesN.parentNode, 'has', nf > 0);
    // via + destino
    setText(this.road, p.offroad ? 'Fora da via' : p.roadName || '—');
    const dl = tr.routeDistLeft || tr.distToDest || 0;
    const dq = Math.round(dl / 10);
    const dkey = dq + '|' + tr.destLabel;
    if (this._q.dist !== dkey) {
      this._q.dist = dkey;
      const where = tr.to === 'stj' && tr.destLabel ? tr.destLabel.replace(/^STJ\s*—\s*/, 'STJ · ') : 'destino';
      setText(this.dest, where + ' ' + fmtDist(dl));
    }
    // ações com cooldown
    const acts = st.actions;
    for (const a of ACTIONS) {
      const o = this.acts[a.key], c = acts && acts[a.key];
      let frac = 0;
      if (c && c.max > 0) frac = clamp((c.cooldown || 0) / c.max, 0, 1);
      const q = Math.round(frac * 20);
      if (q !== o.q) { o.q = q; o.cd.style.transform = `scaleY(${(q / 20).toFixed(2)})`; o.node.classList.toggle('wait', q > 0); }
    }
  }

  frameMinimap(dt, st) { this.minimap.frame(dt, st); }
  flash(key) { this._onAct(key); }
}
