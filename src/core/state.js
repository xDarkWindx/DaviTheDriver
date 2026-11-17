// Estado de jogo COMPARTILHADO. Um único objeto, mutado no lugar (sem realocar por frame).
// Dono de cada campo indicado no comentário; os demais só LEEM.

export const MODE = Object.freeze({
  MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', FINISHED: 'FINISHED',
});

/** Barras de humor de UM ocupante. 0..100; nunca zeram (piso `floor`). Dono: systems/mood.js */
export function moodBars(who = null) {
  return { who, anxiety: 25, stress: 25, floor: 10, active: false };
}

export function createState() {
  return {
    mode: MODE.MENU,            // core/game.js
    quality: 'leve',            // chave de QUALITY em uso (main.js define; UI pode oferecer troca)
    finishReason: null,         // 'chegou' | 'bateu' | 'desistiu' | null   (core/game.js)
    finishDetails: null,        // payload livre de quem pediu o fim

    trip: {                     // core/game.js + game/trip.js
      id: null,                 // ex.: 'casa-stj:davi'
      routeId: null,            // 'casa-stj' | 'stj-casa'
      mode: 'davi',             // 'davi' | 'carona' | 'perigo'  (chave de MODES)
      vehicleId: 'kwid',        // chave de VEHICLES (resolvido de MODES[mode].vehicle)
      driver: 'davi',           // 'davi' | 'dono'      (MODES[mode].driver)
      passenger: null,          // 'davi' | 'dono' | null (MODES[mode].passenger)
      label: '',
      from: null, to: null,     // 'casa' | 'stj'
      timeOfDay: 'manha',       // 'manha' | 'tarde'
      elapsed: 0,               // s de simulação desde o início (não conta pausa)
      distToDest: 0,            // m em linha reta até o centro da zona
      routeDistLeft: 0,         // m pelo caminho sugerido (GPS)
      guideX: 0, guideZ: 0,     // ponto do caminho sugerido ~45 m à frente (para seta/HUD)
      guideBearing: 0,          // heading (convenção do jogo) do carro até guide
      destX: 0, destZ: 0, destRadius: 0,
      arrived: false,
    },

    player: {                   // player/player.js
      x: 0, z: 0, heading: 0,   // heading: forward = (sin h, cos h)
      vx: 0, vz: 0,
      speed: 0,                 // m/s ao longo do eixo do carro (negativo = ré)
      speedKmh: 0,              // |speed| em km/h (para HUD)
      steer: 0,                 // -1..1 (positivo = esquerda)
      throttle: 0, brake: 0, handbrake: false,
      offroad: false,
      roadName: '',             // nome da via mais próxima
      speedLimitKmh: 0,         // limite da via/faixa mais próxima
      laneId: -1,               // faixa mais próxima no sentido do carro (-1 = nenhuma)
      laneKind: null,           // 'normal' | 'bus' | null
      onBusLane: false,         // true = centro do carro sobre faixa exclusiva de ônibus
      inJunction: false,        // dentro de cruzamento/rotatória
      braking: false, reversing: false, turbo: 0, vehicleId: 'kwid',
      collisions: 0,            // contador de colisões estáticas (núcleo)
    },

    // Humor por OCUPANTE (papel), não por pessoa. core/game.js preenche `who` e `active`
    // no início da viagem a partir de MODES[mode]; systems/mood.js é dono dos valores.
    //   mood.driver.who    = trip.driver     (sempre active)
    //   mood.passenger.who = trip.passenger  (active = passenger !== null)
    mood: {
      driver: moodBars('davi'),
      passenger: moodBars(null),
    },

    fines: [],                  // systems/rules.js  [{ code, label, amount, points, time }]
    fineTotal: 0,               // systems/rules.js  R$

    // Pontuação (dono: systems/rules.js ou mood.js; a UI só lê). zoneLo/zoneHi na MESMA escala das barras (0..100);
    // zoneHi <= zoneLo = "sem zona" (a UI não desenha).
    score: { points: 0, multiplier: 1, inZone: false, zoneLo: 0, zoneHi: 0 },

    // Opções do jogador. DONO: ui (escreve e persiste em localStorage, emite EV.SETTINGS_CHANGE). Áudio/fx só LEEM.
    settings: { volume: 0.7, muted: false, retro: true, quality: 'leve', profanity: true },

    // Resultado da viagem. DONO: rules.js — preencher ANTES de emitir REQ_FINISH/TRIP_FINISH (a UI lê no TRIP_FINISH).
    // { reason:'chegou'|'bateu'|'desistiu'|'tomouOCarro', time, points, grade:'A'..'F', title, fines:[{code,label,amount,points}],
    //   crash:{ withWhat, excuse (causa impessoal), repairCost, sinistroNo? (opcional; senão a UI sorteia 2..99 por viagem) }|null, yearsLost (modo perigo) }. A UI zera ao voltar ao menu.
    result: null,

    time: { sim: 0, real: 0, frame: 0 }, // core/loop
  };
}
