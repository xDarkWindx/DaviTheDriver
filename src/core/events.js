// Barramento de eventos síncrono + catálogo ÚNICO de nomes de eventos.
// Todo módulo deve usar EV.* (nunca strings soltas) para emitir/escutar.

export const EV = {
  // --- ciclo de jogo (emitidos pelo núcleo: core/game.js) ---
  STATE_CHANGE: 'game:state',        // { from, to, reason|null }
  TRIP_START: 'trip:start',          // { tripId, routeId, mode, label, timeOfDay, from, to, vehicleId }
  TRIP_FINISH: 'trip:finish',        // { tripId, mode, reason: 'chegou'|'bateu'|'desistiu', time, details }
  ARRIVED: 'trip:arrived',           // { tripId, time }  (antes de TRIP_FINISH)

  // --- pedidos (qualquer módulo/UI pede; o núcleo decide) ---
  REQ_START: 'req:start',            // { routeId: 'casa-stj'|'stj-casa', mode: 'davi'|'carona' }
  REQ_PAUSE: 'req:pause',            // {}
  REQ_RESUME: 'req:resume',          // {}
  REQ_MENU: 'req:menu',              // {}
  REQ_FINISH: 'req:finish',          // { reason, details }  (ex.: regras pedem 'bateu')

  // --- jogador / input (emitidos pelo núcleo) ---
  HORN: 'player:horn',               // { source: 'player' }  tecla H (down)
  HORN_END: 'player:hornEnd',        // { source: 'player' }  tecla H (up)
  BREATHE: 'player:breathe',         // { source: 'player' }  tecla R
  CURSE: 'player:curse',             // { source: 'player' }  tecla X
  OFFROAD: 'player:offroad',         // { on: bool, x, z }
  COLLISION: 'collision',            // { a:'player', b:'static'|'vehicle'|'pedestrian', kind, impactKmh, x, z, nx, nz, otherId }

  // --- mundo (emitidos pelo núcleo) ---
  SIGNAL_CHANGE: 'signal:change',    // { signalId, group, state: 'green'|'yellow'|'red' }

  // --- previstos, emitidos por OUTROS módulos (contrato) ---
  FINE: 'rules:fine',                // rules.js  { code, label, amount, points, x, z }
  NEAR_MISS: 'traffic:nearMiss',     // traffic.js { otherId, dist, kmh }
  OVERTAKEN: 'traffic:overtaken',    // traffic.js { otherId }  (Davi foi ultrapassado)
  CUT_OFF: 'traffic:cutOff',         // traffic.js { otherId }  (Davi foi "fechado")
  HONKED_AT: 'traffic:honkedAt',     // traffic.js { otherId }  (alguém buzinou p/ Davi)
  PEDESTRIAN_CROSSING: 'traffic:pedCrossing', // traffic.js { crosswalkId, on: bool }
  MOOD_CHANGE: 'mood:change',        // mood.js { who:'davi'|'driver', anxiety, stress }
  MOOD_PEAK: 'mood:peak',            // mood.js { who, bar:'anxiety'|'stress', value }
  PASSENGER_SAY: 'mood:passengerSay',// mood.js/carona { text, intensity }  (Davi palpitando)
  CAMERA_SHAKE: 'fx:shake',          // qualquer um { amount, duration } -> cameraRig escuta
};

export class EventBus {
  constructor() { this._h = new Map(); }
  on(name, fn) {
    let list = this._h.get(name);
    if (!list) { list = []; this._h.set(name, list); }
    list.push(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (p) => { off(); fn(p); });
    return off;
  }
  off(name, fn) {
    const list = this._h.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(name, payload) {
    const list = this._h.get(name);
    if (!list || list.length === 0) return;
    // cópia rasa só se houver mais de 1 ouvinte (on/off durante emit)
    if (list.length === 1) { list[0](payload); return; }
    const copy = list.slice();
    for (let i = 0; i < copy.length; i++) copy[i](payload);
  }
}
