// Adaptador defensivo para ctx.modules.traffic (usado por rules.js e mood.js).
// Toda chamada ao trânsito passa por aqui: se o método/campo não existir (stub) ou lançar erro,
// devolve um valor NEUTRO e o jogo segue. Sem alocação por chamada no caminho quente.

const EMPTY = Object.freeze([]);

export class TrafficAdapter {
  /** getCtx: ctx do jogo (precisa de ctx.modules e, para o fallback de radares, ctx.net). */
  constructor(ctx) {
    this.ctx = ctx;
    this._fallbackRadars = null;
    this.errors = 0;
  }

  get t() { const m = this.ctx && this.ctx.modules; return m ? m.traffic || null : null; }

  _call(name, a, b) {
    const t = this.t;
    if (!t || typeof t[name] !== 'function') return undefined;
    try { return t[name](a, b); } catch (e) { if (this.errors++ < 3) console.warn('[traffic-adapter]', name, e); return undefined; }
  }
  _arr(name) { const t = this.t; const v = t && t[name]; return Array.isArray(v) ? v : null; }

  vehicles() { return this._arr('vehicles') || EMPTY; }
  pedestrians() { return this._arr('pedestrians') || EMPTY; }
  hazards() { return this._arr('hazards') || EMPTY; }
  agents() { return this._arr('agents') || EMPTY; }

  /** Radares do trânsito; sem eles, os pontos de fiscalização declarados no mapa (ctx.net.enforcementSpots com s != null). */
  radars() {
    const r = this._arr('radars');
    if (r) return r;
    if (!this._fallbackRadars) {
      const net = this.ctx && this.ctx.net;
      const spots = net && Array.isArray(net.enforcementSpots) ? net.enforcementSpots : [];
      this._fallbackRadars = spots.filter((e) => e.s != null).map((e) => ({
        id: 'map' + e.id, type: e.type, x: e.x, z: e.z, heading: e.heading, range: e.type === 'busLane' ? 45 : 30,
        limitKmh: e.limitKmh, signalId: e.signalId, fallback: true,
      }));
    }
    return this._fallbackRadars;
  }

  /** { id, kind, persona, gap, speed (m/s), closing } | null */
  leadInfo() { const v = this._call('leadInfo'); return v && typeof v === 'object' && Number.isFinite(v.gap) ? v : null; }
  /** Congestionamento em que o jogador está (objeto) ou null. */
  inJam() { const v = this._call('inJam'); return v && typeof v === 'object' ? v : null; }
  /** m de pista livre à frente (sem trânsito = 150, a pista ESTÁ livre). */
  freeAhead() { const v = this._call('freeAhead'); return Number.isFinite(v) ? v : 150; }
  sideFree() { return this._call('sideFree') === true; }
  hazardAhead() { const v = this._call('hazardAhead'); return v && typeof v === 'object' ? v : null; }
  rearInfo() { const v = this._call('rearInfo'); return v && typeof v === 'object' ? v : null; }
  neighbors(radius) { const v = this._call('neighbors', radius); return Array.isArray(v) ? v : EMPTY; }
  /** { crosswalkId, dist, occupied, pedCount } | null */
  /** true/false; null se o trânsito não souber responder (usa a ocupação da faixa inteira). */
  crosswalkBlockedAt(cid, x, z) { const t = this.t; if (!t || typeof t.crosswalkBlockedAt !== 'function') return null; try { return !!t.crosswalkBlockedAt(cid, x, z); } catch (e) { return null; } }
  crosswalkAhead() { const v = this._call('crosswalkAhead'); return v && typeof v === 'object' ? v : null; }
  provoke(amount, radius) { this._call('provoke', amount, radius); }
  flashLead() { this._call('flashLead'); }
  revealAgent(id) { this._call('revealAgent', id); }
}
