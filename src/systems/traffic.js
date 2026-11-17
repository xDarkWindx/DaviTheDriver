// STUB — Trânsito: veículos de IA e pedestres. (Dono: agente de trânsito.)
//
// Contrato (o que o núcleo oferece e espera):
//  - ctx.net (RoadNetwork): lanes/next, createWalker(laneId, s, rng), spawnPoints, edgeNodes,
//    signals (dados), crosswalks, isGradeSeparated(segA, segB), nearestLane(...), planRoute(...).
//  - ctx.signals (SignalController): stateForLane(lane), getState(id, group), isPedWalk(id, group), timeToChange(id).
//  - ctx.player: obb {x,z,hx,hz,angle}, radius, phys {vx,vz,speed,heading}, vehicle (VEHICLES[*], massKg...).
//  - ctx.collision: obbVsObb, circleVsObb, collide, makeOBB... (helpers 2D).
//  - ctx.quality.maxTrafficVehicles / maxPedestrians: tetos de quantidade.
//  - Colisão veículo×jogador é responsabilidade DESTE módulo: emitir EV.COLLISION
//    { a:'player', b:'vehicle'|'pedestrian', kind, impactKmh, x, z, nx, nz, otherId } e, se quiser,
//    empurrar o jogador alterando ctx.player.phys.vx/vz.
//  - Eventos a emitir: EV.OVERTAKEN, EV.CUT_OFF, EV.HONKED_AT, EV.NEAR_MISS, EV.PEDESTRIAN_CROSSING.
//  - Desenhe com InstancedMesh (ex.: player/vehicleModels.buildBodyGeometry(VEHICLES.kwid) como base).
export default {
  name: 'traffic',
  /** Chamado 1x após o mundo estar pronto. */
  init(ctx) { void ctx; },
  /** Início de cada viagem (trip = state.trip). Limpe e repovoe aqui. */
  reset(ctx, trip) { void ctx; void trip; },
  /** Passo fixo (1/60 s), só em PLAYING. */
  update(dt, ctx) { void dt; void ctx; },
  /** Por frame de render, todo estado (interpolação visual). */
  frame(dt, alpha, ctx) { void dt; void alpha; void ctx; },
};
