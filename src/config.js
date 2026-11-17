// Configuração central. Unidades: metros, segundos, radianos (km/h só onde o nome diz "Kmh").

export const CONFIG = {
  simHz: 60,              // passo fixo da simulação
  maxSubSteps: 5,         // máx. de passos por frame (evita espiral da morte)
  defaultQuality: 'leve', // chave de QUALITY (state.quality guarda a escolha atual)
  debug: false,

  camera: {
    elevationDeg: 52,     // câmera isométrica ALTA e fechada (gênero arcade retrô)
    azimuthDeg: -40,      // de onde olha: negativo = do sudoeste (tela "para cima" ≈ nordeste)
    distance: 300,        // distância (ortográfica: só afeta clipping)
    baseView: 23,         // altura visível (m) parado => carro ~10% da largura da tela
    viewPerMps: 0.45,     // quanto abre por m/s
    maxView: 44,
    lookAheadSec: 0.55,   // antecipação na direção do movimento
    lookAheadMax: 14,
    followRate: 6.0,      // 1/s (suavização exponencial)
    zoomRate: 1.4,
  },

  // a partir desta velocidade de impacto (km/h) o provisório de rules.js encerra com 'bateu'
  crashImpactKmh: 18,
};

// ---------------------------------------------------------------------------
// PERFIS DE QUALIDADE. Toda decisão de custo gráfico sai daqui (ninguém usa constante solta).
// 'leve' = padrão (Intel UHD 770). 'hd' = ESQUELETO para GPU dedicada (TODO, ainda não suportado:
// materialKind 'standard', shadows 'shadowmap' e postprocess ainda não têm implementação).
// Coluna "recria": R = exige recriar o renderer; M = exige reconstruir o mundo (cenário/texturas);
//                  - = pode mudar em tempo real.
// ---------------------------------------------------------------------------
export const QUALITY = {
  leve: {
    id: 'leve', label: 'Leve (gráficos integrados)', implemented: true,
    // Orçamento-alvo (Intel UHD 770, 1080p, câmera de jogo): até ~350 mil triângulos e ~120 draw calls
    // (incluindo a passada de sombra). Sem pós-processamento. Materiais Lambert/Phong.
    pixelRatioMax: 1.5,          // -  teto do devicePixelRatio
    antialias: true,             // R  MSAA do contexto WebGL
    materialKind: 'lambert',     // M  'lambert' | 'basic' | 'standard'(hd/TODO)
    shadows: 'shadowmap',        // M  'none' | 'blob' | 'shadowmap' (blob = alternativa; o ajuste automático cai p/ blob)
    shadowMapSize: 1024,         // M  lado do shadow map direcional (PCF simples)
    shadowRange: 48,             // -  meia-largura (m) do frustum da sombra, que acompanha a câmera
    textureSize: 512,            // M  lado (px) das texturas geradas em canvas (chão, asfalto, calçada, fachadas)
    anisotropy: 4,               // M
    signTextureWidth: 2048,      // M  largura do atlas de placas
    chunkSize: 200,              // M  m — tamanho do chunk de culling de cenário/chão
    cameraFar: 900,              // -  plano distante da câmera (m)
    viewMul: 1.0,                // -  multiplica a abertura de zoom da câmera
    density: {                   // M  multiplicadores de cenário instanciado (1 = padrão)
      trees: 1.0, scrub: 1.0, lamps: 1.0, buildings: 1.0, guardrails: 1.0, furniture: 1.0,
    },
    vehicleLOD: 'high',          // M  'low' | 'high' — carros com carroceria modelada (~2-3 mil tri)
    landmarkLOD: 'high',         // M  'low' | 'high'
    maxTrafficVehicles: 56,      // -  teto p/ systems/traffic.js (o degrau 3 do ajuste automático usa 60% disso)
    maxPedestrians: 24,          // -  teto p/ systems/traffic.js
    maxParticles: 300,           // -  teto p/ systems/fx.js
    fxSkidMax: 160,              // -  pool de marcas de pneu (quads instanciados) — systems/fx.js
    fxGrain: true,               // -  granulação do filtro retrô (div com ruído; sem custo de shader) — systems/fx.js
    postprocess: null,           // R  gancho: null | (ctx) => { render(dt) } — vazio no leve
    // Ajuste automático (render/renderer.js): mede o FPS e, abaixo de minFps, desce um degrau:
    //   1 sem sombra projetada (volta a sombra blob) → 2 resolução reduzida → 3 cenário reduzido/visão mais curta.
    autoQuality: { enabled: true, minFps: 50, warmupSec: 2.5, windowSec: 3, upFps: 75, upHoldSec: 10 },
  },
  hd: {
    id: 'hd', label: 'HD (placa dedicada) — TODO', implemented: false,
    pixelRatioMax: 2, antialias: true, materialKind: 'standard', shadows: 'shadowmap',
    textureSize: 1024, anisotropy: 8, signTextureWidth: 2048, chunkSize: 600, cameraFar: 1500, viewMul: 1.0,
    density: { trees: 2.0, scrub: 2.5, lamps: 1.0, buildings: 1.0, guardrails: 1.0 },
    vehicleLOD: 'high', landmarkLOD: 'high',
    maxTrafficVehicles: 90, maxPedestrians: 60, maxParticles: 2000, fxSkidMax: 400, fxGrain: true,
    postprocess: null, // TODO: bloom/vinheta etc. (fx.js registra aqui)
  },
};

/** Perfil efetivo (perfis não implementados caem para 'leve' com aviso). */
export function resolveQuality(id) {
  const q = QUALITY[id] || QUALITY.leve;
  if (!q.implemented) { console.warn(`[qualidade] perfil '${id}' ainda não implementado; usando 'leve'.`); return QUALITY.leve; }
  return q;
}

// ---------------------------------------------------------------------------
// Tabela de VEÍCULOS do jogador. Nada de "if (vehicle === ...)" espalhado:
// player.js / vehicleModels.js leem só desta tabela. Parâmetros nomeados p/ balanceamento.
//
// Aceleração do motor em m/s² (player/physics.js):
//   a(v) = engineAccel * torqueAt(km/h, torqueCurve) * (1 + turboBoost*spool)
//   torqueCurve = [[km/h, multiplicador], ...] (interpolação linear) — é a "curva de torque".
//   spool (turbo) sobe 0→1 depois de turboLag s com acelerador > 0.6 (taxa turboSpoolRate/s).
//   maxSpeed é teto duro. Medir com:  node tools/tune-cars.js
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
    engineAccel: 4.35,         // m/s² no pico da curva de torque
    torqueCurve: [[0, 0.75], [30, 1.0], [55, 0.92], [70, 0.62], [100, 0.36], [130, 0.24], [156, 0.14], [175, 0]],
    turboBoost: 0, turboLag: 0, turboSpoolRate: 0,
    brakeDecel: 10.5,
    handbrakeDecel: 4.5,
    rolling: 0.12,            // m/s² resistência de rolagem
    drag: 0.0002,             // * v²
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
    engineAccel: 3.1, 
    torqueCurve: [[0, 0.95], [15, 1.0], [100, 0.92], [150, 0.62], [190, 0.38], [212, 0.22], [235, 0]],
    turboBoost: 0.75,         // +75% de força com turbo cheio ("coice")
    turboLag: 0.35,           // s até começar a encher
    turboSpoolRate: 2.6,      // 1/s
    brakeDecel: 14.5,
    handbrakeDecel: 5,
    rolling: 0.12,
    drag: 0.0002,
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
  davi: { id: 'davi', name: 'Davi' },
  dono: { id: 'dono', name: 'Dono do Cactus' },
};

export const MODES = {
  davi: {
    id: 'davi', label: 'Davi ao volante', vehicle: 'kwid', driver: 'davi', passenger: null, parking: ['norte', 'leste'],
    description: 'Você é o Davi, no Kwid branco, de casa (Sudoeste) ao STJ ou de volta.',
  },
  carona: {
    id: 'carona', label: 'Davi de carona', vehicle: 'cactus', driver: 'dono', passenger: 'davi', parking: ['norte', 'leste'],
    description: 'Você dirige o seu C4 Cactus THP e o Davi vai do lado, palpitando e surtando.',
  },
  perigo: {
    id: 'perigo', label: 'Perigo: Davi no Cactus', vehicle: 'cactus', driver: 'davi', passenger: 'dono', parking: ['norte', 'leste'],
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
