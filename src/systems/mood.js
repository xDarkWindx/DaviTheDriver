// STUB — Humor (ansiedade/estresse). (Dono: agente de mecânicas de humor.)
//
// Contrato:
//  - Barras em ctx.state.mood.driver e ctx.state.mood.passenger: { who, anxiety, stress, floor, active } (0..100,
//    nunca abaixo de `floor`). O núcleo define who/active no início da viagem a partir de MODES[mode]:
//      davi:   driver.who='davi', passenger inativo
//      carona: driver.who='dono', passenger.who='davi'
//      perigo: driver.who='davi', passenger.who='dono'
//    Os VALORES são deste módulo (reset/update).
//  - Efeitos no volante: escreva em ctx.player.mods (ver player/physics.defaultMods):
//      { steerNoise, steerGain, steerDelay, throttleBias, accelMul, brakeMul, maxSpeedMul, gripMul }
//    (derivados do humor do MOTORISTA). Câmera: ctx.cameraRig.zoomMul / shake(amount, dur).
//  - Ações do jogador: EV.BREATHE (R), EV.CURSE (X), EV.HORN (H) — escute pelo ctx.events.
//  - Emitir: EV.MOOD_CHANGE, EV.MOOD_PEAK, EV.PASSENGER_SAY.
export default {
  name: 'mood',
  init(ctx) { void ctx; },
  reset(ctx, trip) { void trip; for (const k of ['driver', 'passenger']) { const m = ctx.state.mood[k]; m.anxiety = 25; m.stress = 25; } },
  update(dt, ctx) { void dt; void ctx; },
  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
