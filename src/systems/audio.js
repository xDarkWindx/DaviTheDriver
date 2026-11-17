// STUB — Áudio (Web Audio sintetizado; nada de arquivos baixados). (Dono: agente de áudio/efeitos.)
//
// Contrato:
//  - Leia ctx.state.player (speed, speedKmh, throttle, brake, turbo (spool 0..1), offroad, braking) e
//    VEHICLES[ctx.state.trip.vehicleId] (motor, torqueCurve) para o som do motor.
//  - Escute: EV.HORN/EV.HORN_END, EV.COLLISION, EV.FINE, EV.SIGNAL_CHANGE, EV.STATE_CHANGE, EV.TRIP_START/FINISH,
//    EV.CURSE, EV.BREATHE, EV.PASSENGER_SAY...
//  - O AudioContext só pode iniciar após gesto do usuário (ex.: no EV.TRIP_START).
export default {
  name: 'audio',
  init(ctx) { void ctx; },
  reset(ctx, trip) { void ctx; void trip; },
  update(dt, ctx) { void dt; void ctx; },
  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
