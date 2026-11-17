// STUB — Regras: multas (radar, sinal vermelho, faixa de pedestre, contramão...) e consequências de colisões.
// (Dono: agente de regras.)
//
// Contrato:
//  - Dados: ctx.net.radarSpots (candidatos a pardal), ctx.net.crosswalks, lane.signal + ctx.signals.stateForLane,
//    ctx.state.player.speedLimitKmh / laneId / speedKmh, lanes têm .limitKmh.
//  - Multas: empurre em ctx.state.fines ({ code, label, amount, points, time }), some em ctx.state.fineTotal
//    e emita EV.FINE.
//  - Fim por batida: emita EV.REQ_FINISH { reason: 'bateu', details }.
//
// COMPORTAMENTO PADRÃO PROVISÓRIO (pode ser substituído inteiro pelo agente de regras):
//   colisão do jogador com impacto >= CONFIG.crashImpactKmh encerra a viagem com 'bateu'.
import { EV } from '../core/events.js';
import { MODE } from '../core/state.js';
import { CONFIG } from '../config.js';

export default {
  name: 'rules',
  init(ctx) {
    ctx.events.on(EV.COLLISION, (c) => {
      if (ctx.state.mode !== MODE.PLAYING || c.a !== 'player') return;
      if (c.impactKmh >= CONFIG.crashImpactKmh) ctx.events.emit(EV.REQ_FINISH, { reason: 'bateu', details: c });
    });
  },
  reset(ctx, trip) { void ctx; void trip; },
  update(dt, ctx) { void dt; void ctx; },
  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
