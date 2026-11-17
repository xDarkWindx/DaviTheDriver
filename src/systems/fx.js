// STUB — Efeitos visuais (partículas, marcas de pneu, fumaça, tremidas, filtros). (Dono: agente de efeitos.)
//
// Contrato:
//  - Cena: ctx.view.scene; câmera: ctx.cameraRig (shake(amount, dur), zoomMul, offsetX/offsetZ).
//  - Luz/período: ctx.view.lights { hemi, sun }, ctx.view.setTimeOfDay('manha'|'tarde').
//  - Orçamento: ctx.quality.maxParticles; sem pós-processamento no perfil 'leve'
//    (gancho ctx.quality.postprocess é null; no 'hd' futuro, este módulo registra ali).
//  - Escute EV.COLLISION, EV.OFFROAD, EV.FINE, EV.MOOD_PEAK etc.
export default {
  name: 'fx',
  init(ctx) { void ctx; },
  reset(ctx, trip) { void ctx; void trip; },
  update(dt, ctx) { void dt; void ctx; },
  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
