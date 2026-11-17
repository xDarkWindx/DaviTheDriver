// Máquina de estados do jogo + orquestração de módulos.
// Estados: MENU -> PLAYING <-> PAUSED -> FINISHED (motivo: 'chegou' | 'bateu' | 'desistiu') -> MENU
import { EV } from './events.js';
import { MODE } from './state.js';
import { MODES, ROUTES, VEHICLES } from '../config.js';

const MENU_ORBIT = { x: 420, z: 30 }; // passeio da câmera no menu (Esplanada)

/** Estacionamento do STJ da viagem (MODES[mode].parking: lista de opções). seed != null => determinístico. */
export function chooseParking(modeId, seed) {
  const opts = (MODES[modeId] && MODES[modeId].parking) || ['leste'];
  if (opts.length === 1) return opts[0];
  const r = seed != null ? (((seed >>> 0) * 2654435761) >>> 0) / 4294967296 : Math.random();
  return opts[Math.floor(r * opts.length) % opts.length];
}

/**
 * Caminho de chegada ao STJ / saída dele (waypoints = segIds para o GPS; null = GPS livre).
 * Norte (davi/perigo): (a) desce a avenida e entra pela ponta oeste = GPS livre; (b) segue a SAFS Q. 2 e desce pela lateral.
 * Leste (carona): pela Via L4 Sul e a Rotatória 2, na ida e na volta (caminho inverso).
 */
export function chooseArrivalVia(modeId, routeId, parking, seed) {
  const toStj = routeId === 'casa-stj';
  if (parking === 'leste') return toStj ? ['l2m_east', 'l4_sul'] : ['l4_sul', 'l2m_east'];
  if (parking === 'norte' && toStj) {
    const r = seed != null ? ((((seed >>> 0) ^ 0x9e3779b9) * 2246822519) >>> 0) / 4294967296 : Math.random();
    return r < 0.5 ? null : ['s2_b', 'stj_lateral'];
  }
  return null;
}

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.game = this;
    /** Módulos plugáveis (traffic, rules, mood, fx, audio, ui). Ordem = ordem de update. */
    this.modules = [];
    this.stepDt = 1 / 60;
    this.preStep = null;
    const ev = ctx.events;
    ev.on(EV.REQ_START, (p) => this.startTrip(p.routeId, p.mode, p));
    ev.on(EV.REQ_PAUSE, () => this.pause());
    ev.on(EV.REQ_RESUME, () => this.resume());
    ev.on(EV.REQ_MENU, () => this.toMenu());
    ev.on(EV.REQ_FINISH, (p) => this.finish(p.reason, p.details));
    ev.on('input:pause', () => { if (this.mode === MODE.PLAYING) this.pause(); else if (this.mode === MODE.PAUSED) this.resume(); });
    ev.on(EV.CAMERA_SHAKE, (p) => ctx.cameraRig.shake(p.amount, p.duration));
    ctx.input.isPlaying = () => this.mode === MODE.PLAYING;
  }

  get mode() { return this.ctx.state.mode; }

  /** Registra um módulo { name, init?(ctx), reset?(ctx, trip), update?(dt, ctx), frame?(dt, alpha, ctx) }. */
  register(mod) {
    if (!mod || !mod.name) throw new Error('módulo sem name');
    this.modules.push(mod);
    this.ctx.modules[mod.name] = mod;
    return mod;
  }

  init() {
    for (const m of this.modules) if (m.init) m.init(this.ctx);
    this._setMode(MODE.MENU, null);
    this._menuScene();
  }

  _setMode(to, reason) {
    const st = this.ctx.state, from = st.mode;
    st.mode = to;
    if (to !== MODE.FINISHED) { st.finishReason = null; st.finishDetails = null; }
    this.ctx.events.emit(EV.STATE_CHANGE, { from, to, reason: reason || null });
  }

  _menuScene() {
    const { cameraRig, player, trip, view, net } = this.ctx;
    trip.hide();
    // carro parado na porta de casa, câmera passeando pela Esplanada
    player.setVehicle(player.vehicle ? player.vehicle.id : 'kwid');
    player.reset(net.snapStart(net.starts.casa));
    player.frozen = true;
    cameraRig.mode = 'orbit';
    cameraRig.snap(MENU_ORBIT.x, MENU_ORBIT.z);
    view.setTimeOfDay('manha');
  }

  /**
   * Inicia uma viagem. routeId: chave de ROUTES ('casa-stj'|'stj-casa'); mode: chave de MODES ('davi'|'carona'|'perigo').
   */
  startTrip(routeId = 'casa-stj', modeId = 'davi', opts = {}) {
    const ctx = this.ctx, st = ctx.state;
    const route = ROUTES[routeId], mode = MODES[modeId];
    if (!route) throw new Error('rota desconhecida: ' + routeId);
    if (!mode) throw new Error('modo desconhecido: ' + modeId);
    const vehicle = VEHICLES[mode.vehicle];
    const tr = st.trip;
    tr.id = `${routeId}:${modeId}`; tr.routeId = routeId; tr.mode = modeId; tr.vehicleId = vehicle.id;
    tr.driver = mode.driver; tr.passenger = mode.passenger;
    tr.label = `${route.label} — ${mode.label}`; tr.from = route.from; tr.to = route.to; tr.timeOfDay = route.timeOfDay;
    // papéis do humor (valores são de systems/mood.js)
    st.mood.driver.who = mode.driver; st.mood.driver.active = true;
    st.mood.passenger.who = mode.passenger; st.mood.passenger.active = !!mode.passenger;
    st.fines.length = 0; st.fineTotal = 0;

    // estacionamento do STJ: carona = Norte (o caminho do dono); Davi = Entrada Oeste ou Estacionamento Leste (sorteio,
    // reproduzível com state.traffic.seed). opts.parking força ('norte'|'oeste'|'leste').
    tr.parking = opts && opts.parking ? opts.parking : chooseParking(modeId, st.traffic && st.traffic.seed);
    tr.arrivalVia = opts && opts.via ? opts.via : chooseArrivalVia(modeId, routeId, tr.parking, st.traffic && st.traffic.seed);
    const pose = ctx.trip.setup(routeId, tr.parking, tr.arrivalVia);
    ctx.player.setVehicle(vehicle.id);
    ctx.player.reset(pose);
    ctx.view.setTimeOfDay(route.timeOfDay);
    ctx.signals.reset();
    ctx.cameraRig.mode = 'follow';
    ctx.cameraRig.snap(pose.x, pose.z);
    for (const m of this.modules) if (m.reset) m.reset(ctx, tr);
    this._setMode(MODE.PLAYING, null);
    ctx.events.emit(EV.TRIP_START, {
      tripId: tr.id, routeId, mode: modeId, label: tr.label, timeOfDay: tr.timeOfDay, from: tr.from, to: tr.to,
      vehicleId: vehicle.id, driver: mode.driver, passenger: mode.passenger, parking: tr.parking, destLabel: tr.destLabel,
    });
  }

  pause() { if (this.mode === MODE.PLAYING) this._setMode(MODE.PAUSED, null); }
  resume() { if (this.mode === MODE.PAUSED) this._setMode(MODE.PLAYING, null); }

  /** Encerra a viagem. reason: 'chegou' | 'bateu' | 'desistiu'. */
  finish(reason, details = null) {
    if (this.mode !== MODE.PLAYING && this.mode !== MODE.PAUSED) return;
    const st = this.ctx.state;
    st.finishReason = reason; st.finishDetails = details;
    this.ctx.player.frozen = true;
    this._setMode(MODE.FINISHED, reason);
    this.ctx.events.emit(EV.TRIP_FINISH, { tripId: st.trip.id, mode: st.trip.mode, reason, time: st.trip.elapsed, details });
  }

  toMenu() {
    if (this.mode === MODE.PLAYING || this.mode === MODE.PAUSED) this.finish('desistiu');
    this._setMode(MODE.MENU, null);
    this._menuScene();
  }

  /** Um passo fixo de simulação. */
  step(dt) {
    const ctx = this.ctx, st = ctx.state;
    st.time.sim += dt;
    if (st.mode === MODE.PAUSED) return;
    ctx.signals.update(dt);
    if (st.mode !== MODE.PLAYING) { ctx.player.update(dt, ctx.input); return; }
    if (this.preStep) this.preStep(dt); // piloto-robô (src/debug/autopilot.js), só quando ligado
    ctx.input.sample();
    ctx.player.update(dt, ctx.input);
    for (const m of this.modules) if (m.update) m.update(dt, ctx);
    if (st.mode === MODE.PLAYING && ctx.trip.update(dt)) {
      ctx.events.emit(EV.ARRIVED, { tripId: st.trip.id, time: st.trip.elapsed });
      this.finish('chegou');
    }
  }

  /** Por frame de render (qualquer estado). */
  frame(dt, alpha) {
    const ctx = this.ctx, st = ctx.state;
    st.time.real += dt; st.time.frame++;
    const p = ctx.player;
    p.frame(st.mode === MODE.PLAYING ? alpha : 1, st.mode === MODE.PAUSED ? 0 : dt);
    const r = p.model.root.position;
    if (ctx.cameraRig.mode === 'orbit') ctx.cameraRig.update(dt, MENU_ORBIT.x, MENU_ORBIT.z, 0, 0);
    else if (ctx.cameraRig.mode === 'free') ctx.cameraRig.update(dt, ctx.cameraRig.tx, ctx.cameraRig.tz, 0, 0);
    else ctx.cameraRig.update(dt, r.x, r.z, st.player.vx, st.player.vz);
    ctx.trip.frame(dt, r.x, r.z);
    ctx.signals.frame();
    for (const m of this.modules) if (m.frame) m.frame(dt, alpha, ctx);
    ctx.view.renderer.render(ctx.view.scene, ctx.cameraRig.camera);
  }

  /** Avança a simulação N segundos de forma síncrona (testes/automação). Não renderiza. */
  advance(seconds) {
    const n = Math.round(seconds / this.stepDt);
    for (let i = 0; i < n; i++) this.step(this.stepDt);
  }
}
