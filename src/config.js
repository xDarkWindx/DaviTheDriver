// Configuração central. Unidades: metros, segundos, radianos (km/h só onde o nome diz "Kmh").

export const CONFIG = {
  simHz: 60,              // passo fixo da simulação
  maxSubSteps: 5,         // máx. de passos por frame (evita espiral da morte)
  pixelRatioMax: 1.5,
  chunkSize: 400,         // tamanho dos "chunks" de culling (m)
  debug: false,

  camera: {
    elevationDeg: 52,     // câmera isométrica ALTA e fechada (gênero arcade retrô)
    azimuthDeg: -40,      // de onde olha: negativo = do sudoeste (tela "para cima" ≈ nordeste)
    distance: 300,        // distância (ortográfica: só afeta clipping)
    baseView: 30,         // altura visível (m) parado => carro ~10% da largura da tela
    viewPerMps: 0.42,     // quanto abre por m/s
    maxView: 50,
    lookAheadSec: 0.55,   // antecipação na direção do movimento
    lookAheadMax: 14,
    followRate: 6.0,      // 1/s (suavização exponencial)
    zoomRate: 1.4,
  },

  // a partir desta velocidade de impacto (km/h) o provisório de rules.js encerra com 'bateu'
  crashImpactKmh: 18,
};

// ---------------------------------------------------------------------------
// Tabela de VEÍCULOS do jogador. Nada de "if (vehicle === ...)" espalhado:
// player.js / vehicleModels.js leem só desta tabela. Parâmetros nomeados p/ balanceamento.
//
// Aceleração do motor em m/s²:
//   a(v) = engineAccel * max(0, 1 - (v/maxSpeed)^accelCurve) * (1 + turboBoost*spool)
//   accelCurve baixo => perde força cedo (retomada fraca). spool sobe de 0→1 depois de
//   turboLag s com acelerador > 0.6 (taxa turboSpoolRate/s) e cai quando solta.
// Instabilidade (Kwid): acima de unstableFromKmh a aderência cai até (1-highSpeedGripLoss) e
//   frenagem forte/curva rápida adicionam guinada aleatória proporcional a `instability`.
// ---------------------------------------------------------------------------
export const VEHICLES = {
  kwid: {
    id: 'kwid',
    label: 'Renault Kwid 1.0 (branco)',
    model: 'kwid',            // chave em player/vehicleModels.js
    engine: '1.0 aspirado',
    // Ficha real (referência p/ balanceamento): 156 km/h, 0-100 em 13,2 s, 68/71 cv @5500,
    // 9,4-10 kgfm @4250 (torque só em giro alto), 11,52 kg/cv, 3680x1579x1479 mm,
    // entre-eixos 2423 mm, vão livre 185 mm.
    real: { topKmh: 156, zeroTo100: 13.2, cv: 68, torqueKgfm: 10, torqueRpm: 4250, kgPerCv: 11.52, groundClearance: 0.185 },
    game: { zeroTo100: 10.0 },  // alvo no jogo (escala 0,76 do real; razão Cactus/Kwid preservada)
    length: 3.68, width: 1.579, height: 1.479, // caixa de colisão = length x width
    wheelbase: 2.423,
    groundClearance: 0.185,
    massKg: 783,              // p/ colisões entre veículos (agente de trânsito)
    maxSpeed: 43.3,           // m/s (156 km/h)
    maxReverse: 6,
    engineAccel: 4.6,         // m/s² saindo da imobilidade
    accelCurve: 0.85,         // <1: força despenca cedo -> retomada acima de 60 km/h é fraca
    turboBoost: 0, turboLag: 0, turboSpoolRate: 0,
    brakeDecel: 10.5,
    handbrakeDecel: 4.5,
    rolling: 0.35,            // m/s² resistência de rolagem
    drag: 0.0011,             // * v²
    maxSteerLow: 0.64,        // rad (baixa velocidade)
    maxSteerHigh: 0.10,       // rad (alta velocidade)
    steerRate: 7.5,           // resposta do volante (1/s)
    grip: 8,                  // amortecimento lateral (1/s)
    handbrakeGrip: 1.5,
    offroadGrip: 3.5,
    offroadDrag: 2.4,         // m/s² extra fora da pista
    unstableFromKmh: 80,
    highSpeedGripLoss: 0.35,
    instability: 0.9,         // guinada aleatória em frenagem forte/curva rápida (rad/s)
    bodyRoll: 1.2,            // só visual (rolagem da carroceria)
  },
  cactus: {
    id: 'cactus',
    label: 'Citroën C4 Cactus THP (cinza)',
    model: 'cactus',
    engine: '1.6 THP turbo',
    // Ficha real: 212 km/h, 0-100 em 7,7 s, 166/173 cv @6000, 24,5 kgfm @1400 (turbo, torque cedo),
    // 7,02 kg/cv, 4170x1714x1563 mm, entre-eixos 2600 mm, vão livre 225 mm.
    real: { topKmh: 212, zeroTo100: 7.7, cv: 166, torqueKgfm: 24.5, torqueRpm: 1400, kgPerCv: 7.02, groundClearance: 0.225 },
    game: { zeroTo100: 5.8 },   // 58% do Kwid
    length: 4.17, width: 1.714, height: 1.563,
    wheelbase: 2.60,
    groundClearance: 0.225,
    massKg: 1165,
    maxSpeed: 58.9,           // m/s (212 km/h) = +36% sobre o Kwid
    maxReverse: 6.5,
    engineAccel: 6.4,
    accelCurve: 1.9,          // mantém força até alto
    turboBoost: 0.75,         // +75% de força com turbo cheio ("coice")
    turboLag: 0.35,           // s até começar a encher
    turboSpoolRate: 2.6,      // 1/s
    brakeDecel: 14.5,
    handbrakeDecel: 5,
    rolling: 0.3,
    drag: 0.0010,
    maxSteerLow: 0.58,
    maxSteerHigh: 0.085,
    steerRate: 8.5,
    grip: 11.5,               // estável/previsível
    handbrakeGrip: 2.2,
    offroadGrip: 5,
    offroadDrag: 2.0,
    unstableFromKmh: 150,
    highSpeedGripLoss: 0.1,
    instability: 0.1,
    bodyRoll: 0.5,
  },
};

// ---------------------------------------------------------------------------
// MODOS de jogo: tabela que resolve dimensões independentes.
//   vehicle:   chave de VEHICLES
//   driver:    quem está ao volante  ('davi' | 'dono')
//   passenger: quem vai do lado      ('davi' | 'dono' | null)
// Humor: state.mood.driver e state.mood.passenger (barras de cada ocupante).
// Os efeitos no volante (player.mods) vêm do humor do DRIVER.
// ---------------------------------------------------------------------------
export const PEOPLE = {
  davi: { id: 'davi', name: 'Davi', temperament: 'ansioso' },   // ansioso, estressado, agressivo
  dono: { id: 'dono', name: 'Dono do Cactus', temperament: 'calmo' },
};

export const MODES = {
  davi: {
    id: 'davi', label: 'Davi ao volante', vehicle: 'kwid', driver: 'davi', passenger: null,
    description: 'Você É o Davi, no Kwid branco. A culpa é sempre dos outros.',
  },
  carona: {
    id: 'carona', label: 'Davi de carona', vehicle: 'cactus', driver: 'dono', passenger: 'davi',
    description: 'Você dirige o seu C4 Cactus THP e o Davi vai do lado, palpitando e surtando.',
  },
  perigo: {
    id: 'perigo', label: 'Perigo: Davi no Cactus', vehicle: 'cactus', driver: 'davi', passenger: 'dono',
    description: 'O dono emprestou o Cactus THP pro Davi. Turbo + ansiedade. O dono vai do lado, apavorado.',
  },
};

// Rotas (origem/destino) — dados de posição ficam em world/mapData.js (zones/starts).
export const ROUTES = {
  'casa-stj': {
    id: 'casa-stj', label: 'Casa → STJ', from: 'casa', to: 'stj',
    timeOfDay: 'manha', start: 'casa', destZone: 'stj',
  },
  'stj-casa': {
    id: 'stj-casa', label: 'STJ → Casa', from: 'stj', to: 'casa',
    timeOfDay: 'tarde', start: 'stj', destZone: 'casa',
  },
};
