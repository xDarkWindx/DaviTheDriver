// MODO DE DEMONSTRAÇÃO DA UI — só roda com ?uidemo=... na URL. Injeta humor, pontos, ações, multas, falas e toasts falsos
// para testar o HUD enquanto mood/rules/traffic ainda são stubs. Nunca roda no jogo normal.
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';

export function demoRequested() {
  try { return new URLSearchParams(location.search).has('uidemo'); } catch (e) { return false; }
}

const LINES = {
  davi: [
    ['davi', 'driver', 'anx', 'Acho que a gente vai chegar atrasado.'],
    ['davi', 'driver', 'stress', 'Esse cara dirige com os pés?!'],
    ['davi', 'driver', 'stress', 'SETA! Existe SETA!'],
    ['davi', 'driver', 'panic', 'O pardal! O pardal! Eu vi o pardal!'],
  ],
  carona: [
    ['davi', 'passenger', 'anx', 'Cuidado! Cuidado! CUIDADO!'],
    ['davi', 'passenger', 'stress', 'Passa por ele! Vai, vai, vai!'],
    ['dono', 'driver', 'calm', 'Está tudo bem. Respira, Davi.'],
    ['davi', 'passenger', 'panic', 'Tá VERMELHO! Tá vermelho, cara!'],
  ],
  perigo: [
    ['davi', 'driver', 'stress', 'Relaxa que eu tô no controle!'],
    ['dono', 'passenger', 'panic', 'Ai, meu carrinho… Ai, meu carrinho!'],
    ['dono', 'passenger', 'panic', 'A minha vida passou diante dos meus olhos. Era chata.'],
    ['davi', 'driver', 'anx', 'Esse turbo faz o quê? Aperta e vê!'],
  ],
};

export class Demo {
  constructor(ui, ctx) {
    this.ui = ui; this.ctx = ctx;
    this.t = 0; this.fixed = null; this.nextEvt = 1.2; this.k = 0;
    const self = this;
    const mode = (new URLSearchParams(location.search).get('uidemo') || '1');
    this.hot = mode === 'hot';
    window.__uiDemo = {
      freeze(t) { self.fixed = t; },
      unfreeze() { self.fixed = null; },
      hot(v) { self.hot = v !== false; },
      say(p) { ctx.events.emit(EV.SAY, p); },
      fine() { self.fine(); },
      /** reason: 'chegou'|'bateu'|'desistiu'|'tomouOCarro'. opts.noResult = não preencher state.result (testa reserva). */
      finish(reason = 'chegou', opts = {}) { self.finish(reason, opts); },
    };
    ctx.events.on(EV.TRIP_START, () => { this.t = 0; this.k = 0; this.nextEvt = 1.2; });
  }

  frame(dt, st) {
    if (st.mode !== MODE.PLAYING) return;
    this.t += dt;
    const t = this.fixed != null ? this.fixed : this.t;
    const w = (a, b, c) => a + b * Math.sin(t * c);
    const hot = this.hot;
    const d = st.mood.driver, p = st.mood.passenger;
    d.anxiety = hot ? 91 : w(52, 38, 0.45); d.stress = hot ? 78 : w(44, 40, 0.33 + 0.2); d.floor = 12;
    if (d.who === 'dono') { d.anxiety = 8 + 4 * Math.sin(t); d.stress = 6 + 3 * Math.sin(t * 1.3); d.floor = 4; }
    if (p.active) { p.anxiety = hot ? 88 : w(48, 42, 0.5); p.stress = hot ? 95 : w(40, 40, 0.38); p.floor = 8; }
    const sc = st.score;
    sc.zoneLo = 35; sc.zoneHi = 62;
    sc.inZone = d.anxiety > sc.zoneLo && d.anxiety < sc.zoneHi && d.stress > sc.zoneLo && d.stress < sc.zoneHi;
    sc.multiplier = sc.inZone ? 2.5 : 1;
    sc.points = Math.floor(t * 37 + 1200);
    st.actions = {
      horn: { cooldown: Math.max(0, 2 - (t % 5)), max: 2 },
      breathe: { cooldown: Math.max(0, 6 - (t % 9)), max: 6 },
      curse: { cooldown: 0, max: 4 },
    };
    if (this.fixed != null) return;
    this.nextEvt -= dt;
    if (this.nextEvt <= 0) { this.nextEvt = 2.6; this.fire(); }
  }

  fire() {
    const ev = this.ctx.events, st = this.ctx.state, k = this.k++;
    const lines = LINES[st.trip.mode] || LINES.davi;
    const [who, role, tone, text] = lines[k % lines.length];
    ev.emit(EV.SAY, { who, role, tone, text, ttl: 3.2 });
    const m = k % 6;
    if (m === 1) ev.emit(EV.OVERTAKEN, { otherId: 1 });
    else if (m === 2) ev.emit(EV.CUT_OFF, { otherId: 2 });
    else if (m === 3) this.fine();
    else if (m === 4) ev.emit(EV.MOOD_PEAK, { who: st.mood.driver.who, bar: 'anxiety', value: 96 });
    else if (m === 5) ev.emit(EV.HONKED_AT, { otherId: 3 });
  }

  fine() {
    const st = this.ctx.state;
    const f = { code: 'speed', label: 'Excesso de velocidade (até 20%)', amount: 130.16, points: 4, by: 'radar', x: 0, z: 0, time: st.trip.elapsed };
    st.fines.push(f); st.fineTotal += f.amount;
    this.ctx.events.emit(EV.FINE, f);
  }

  finish(reason, opts) {
    const st = this.ctx.state, ev = this.ctx.events;
    if (st.mode === MODE.MENU) return;
    if (!st.fines.length) {
      st.fines.push({ code: 'speed', label: 'Excesso de velocidade (até 20%)', amount: 130.16, points: 4 }, { code: 'redLight', label: 'Avanço de sinal vermelho', amount: 293.47, points: 7 });
      st.fineTotal = 130.16 + 293.47;
    }
    const perigo = st.trip.mode === 'perigo';
    if (!opts.noResult) {
      st.result = {
        reason, time: st.trip.elapsed || 187.4, points: 14250, grade: 'C', title: 'Cidadão Médio do DF',
        fines: st.fines.map((x) => ({ ...x })),
        crash: reason === 'bateu' ? { withWhat: 'um poste de concreto armado', excuse: 'O poste apareceu.', repairCost: perigo ? 18740 : null } : null,
        yearsLost: perigo ? 3.4 : undefined,
      };
    }
    ev.emit(EV.REQ_FINISH, { reason, details: reason === 'bateu' ? { b: 'static', kind: 'pole', impactKmh: 54, x: 120, z: 40 } : null });
  }
}
