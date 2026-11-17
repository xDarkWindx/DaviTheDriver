// Contexto FALSO para testar rules.js + mood.js em Node com o Game real (sem three/DOM).
import { EventBus, EV } from '../../../core/events.js';
import { createState } from '../../../core/state.js';
import { Game } from '../../../core/game.js';
import { CONFIG, VEHICLES, MODES, ROUTES } from '../../../config.js';
import { defaultMods } from '../../../player/physics.js';

/** Trânsito falso controlável: todos os campos/métodos do contrato. */
export function fakeTraffic() {
  return {
    name: 'traffic',
    vehicles: [], pedestrians: [], hazards: [], radars: [], agents: [],
    lead: null, free: 150, cw: null, provoked: [], flashed: 0, revealed: [],
    leadInfo() { return this.lead; }, freeAhead() { return this.free; }, rearInfo() { return null; },
    neighbors() { return []; }, crosswalkAhead() { return this.cw; },
    provoke(a, r) { this.provoked.push([a, r]); }, flashLead() { this.flashed++; },
    revealAgent(id) { this.revealed.push(id); const a = this.agents.find((x) => x.id === id); if (a) a.revealed = true; },
  };
}

export function makeCtx(modules, opts = {}) {
  const state = createState();
  const events = new EventBus();
  const phys = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steer: 0, longAccel: 0, latAccel: 0, spool: 0 };
  let arriveAt = opts.arriveAt != null ? opts.arriveAt : Infinity;
  const player = {
    phys, mods: defaultMods(), vehicle: VEHICLES.kwid, frozen: false, model: { root: { position: { x: 0, z: 0 } } },
    setVehicle(id) { this.vehicle = VEHICLES[id]; },
    reset() { Object.assign(this.mods, defaultMods()); this.frozen = false; },
    update() {
      const sp = state.player;
      sp.x = phys.x; sp.z = phys.z; sp.heading = phys.heading; sp.speed = phys.speed; sp.speedKmh = Math.abs(phys.speed) * 3.6;
      sp.vehicleId = this.vehicle.id;
    },
    frame() {},
  };
  const ctx = {
    CONFIG, VEHICLES, MODES, ROUTES, EV, state, events, modules: {}, game: null,
    input: { axes: { throttle: 0, brake: 0, steer: 0 }, handbrake: false, sample() {}, isPlaying: () => true },
    view: { setTimeOfDay() {}, renderer: { render() {} } },
    cameraRig: { mode: 'follow', snap() {}, shake() {}, update() {} },
    signals: { reset() {}, update() {}, frame() {}, getState: () => 'green', stateForLane: () => null },
    net: { signals: [], crosswalks: [], enforcementSpots: [], starts: { casa: {}, stj: {} },
      snapStart: () => ({ x: 0, z: 0, heading: 0 }), getLane: () => null, getSegment: () => ({ laneW: 3.5 }), getNode: () => null,
      siblingLanes: () => [], projectOnLane: () => 0, roadInfoAt: (x, z, o) => Object.assign(o, { nodeId: null }) },
    player,
    trip: {
      setup() { state.trip.elapsed = 0; state.trip.routeDistLeft = opts.routeDist || 2000; return { x: 0, z: 0, heading: 0 }; },
      hide() {}, frame() {},
      update(dt) { state.trip.elapsed += dt; return state.trip.elapsed >= arriveAt; },
    },
  };
  const game = new Game(ctx);
  for (const m of modules) game.register(m);
  game.init();
  ctx.setArrive = (t) => { arriveAt = t; };
  return { ctx, game, state, events, phys, player };
}
