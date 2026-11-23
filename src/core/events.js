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
  NEAR_MISS: 'traffic:nearMiss',     // traffic.js { id, otherId, kind, b:'vehicle'|'pedestrian'|'cyclist', dist (m de folga), relKmh, x, z }
  OVERTAKEN: 'traffic:overtaken',    // traffic.js { id, otherId, kind, persona, side:'left'|'right', relKmh }  (Davi foi ultrapassado; side = lado por onde passou)
  CUT_OFF: 'traffic:cutOff',         // traffic.js { id, otherId, kind, persona, gap, ring }  (Davi foi "fechado"; ring = entrada/dentro de rotatória)
  HONKED_AT: 'traffic:honkedAt',     // traffic.js { id, otherId, kind, persona, x, z }  (alguém buzinou p/ Davi)
  PEDESTRIAN_CROSSING: 'traffic:pedCrossing', // traffic.js { crosswalkId, x, z, dist, on: true, pedCount, signalized } (1x por travessia, faixa à frente do jogador)
  MOOD_CHANGE: 'mood:change',        // mood.js { who:'davi'|'driver', anxiety, stress }
  MOOD_PEAK: 'mood:peak',            // mood.js { who, bar:'anxiety'|'stress', value }
  PASSENGER_SAY: 'mood:passengerSay',// mood.js/carona { text, intensity }  (Davi palpitando)
  CAMERA_SHAKE: 'fx:shake',          // qualquer um { amount, duration } -> cameraRig escuta

  // --- acrescentados pela fase de UI ---
  QUALITY_FALLBACK: 'render:qualityFallback', // núcleo { from:'hd', to:'leve', fps }  o HD não aguentou: a UI grava 'leve' e avisa (troca no menu)
  SETTINGS_CHANGE: 'ui:settings',    // ui { volume, muted, retro, quality }  (cópia de state.settings; a UI é a ÚNICA que escreve)
  SAY: 'say',                        // mood/traffic/rules { who:'davi'|'dono', role:'driver'|'passenger', text, tone:'anx'|'stress'|'calm'|'panic', ttl (s), gesture?: 'bracoPraFora'|'buzinaImaginaria'|'maosNaCabeca'|'apontando'|'joinha'|'banana'|null }  -> balão de fala (text vazio + gesture = balão só com o ícone)

  // --- acrescentados pelo trânsito (traffic.js). Todos os payloads de traffic trazem `id` (= `otherId`) e `kind` (modelo) quando há outro veículo/pessoa.
  HAZARD_HIT: 'traffic:hazardHit',   // traffic.js { id, kind:'manga'|'jaca', x, z, speedKmh, wheel }  (jogador passou por cima; o escorregão é de humor/regras)
  PLAYER_OVERTOOK: 'traffic:playerOvertook', // traffic.js { id, otherId, kind, persona, relKmh, side:'left'|'right' }  ('right' = jogador passou pela DIREITA)
  TAILGATED: 'traffic:tailgated',    // traffic.js { id, otherId, kind, persona, gap }  (alguém colado na traseira do jogador por ~2,5 s)
  FLASHED: 'traffic:flashed',        // traffic.js { id, otherId, kind, persona }  (piscaram farol para o jogador)

  // --- acrescentados pela fase de regras/humor (rules.js / mood.js) ---
  FLASH: 'player:flash',             // núcleo (input, tecla F) { source: 'player' }  piscar o farol
  SIGNAL_RUN: 'rules:signalRun',     // rules { signalId, group, state:'red'|'yellow', x, z, seen }  jogador passou do semáforo no amarelo/vermelho
  TAKEOVER: 'mood:takeover',         // mood { who:'dono' }  o dono (perigo) tomou o carro -> rules encerra com 'tomouOCarro'
};
// Eventos do contrato de traffic.js: se o agente de trânsito ainda não os declarou, declara aqui (mesmos nomes).
if (!EV.FLASHED) EV.FLASHED = 'traffic:flashed';               // { id, kind }  alguém piscou o farol para o jogador
if (!EV.TAILGATED) EV.TAILGATED = 'traffic:tailgated';         // { id, kind, gap }  alguém colou na traseira
if (!EV.HAZARD_HIT) EV.HAZARD_HIT = 'traffic:hazardHit';       // { kind:'manga'|'jaca', x, z, speedKmh }
if (!EV.PLAYER_OVERTOOK) EV.PLAYER_OVERTOOK = 'traffic:playerOvertook'; // { id, kind, relKmh, side }

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
