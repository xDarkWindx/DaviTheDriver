// BALANCEAMENTO DO HUMOR — todas as constantes de mood.js num lugar só (fase de ajuste).
// Barras 0..100. Taxas em pontos/s; impulsos em pontos. "D" = Davi; "dono" = dono do Cactus.

export const MOOD_BALANCE = {
  // ---- valores iniciais e pisos (o piso NUNCA é furado)
  start: {
    daviDriver: { anxiety: 30, stress: 25, floor: 15 },
    daviPassenger: { anxiety: 28, stress: 22, floor: 12 },
    donoDriver: { anxiety: 0, stress: 0, floor: 0 },      // carona: o dono fica em zero ("tranquilo")
    donoPassenger: { anxiety: 12, stress: 8, floor: 6 },  // perigo: susto/pânico
  },

  // ---- o que o Davi quer: andar acima do limite
  desire: { overLimit: 1.15, minLimitKmh: 40, noLimitKmh: 60 },

  // ---- ANSIEDADE do Davi ("preciso chegar logo"), pontos/s
  anx: {
    freeRoadMax: 2.0,        // pista livre (150 m) e ele bem abaixo do que quer, sem pisar
    freeRoadMinGap: 30,      // m: abaixo disso não conta como "pista livre"
    freeRoadFullGap: 150,
    freeRoadThrottleCut: 0.6,// pisar fundo reduz esse ganho em até 60%
    cruiseRelief: 5.0,       // correndo (>= 95% do limite) com pista livre: alivia (até o repouso)
    rest: 26,                // repouso: alívio natural para aqui (só respirar desce até o piso)
    cruiseMinFree: 40,
    // ATRÁS DE CARRO LENTO: gatilho mais forte do jogo
    slowGap: 30,             // m: lead a menos disso
    slowLeadRatio: 0.8,      // lead mais lento que 80% do desejado (~92% do limite)
    slowBase: 1.6,           // pontos/s ao começar
    slowGrowth: 0.16,        // +pontos/s por segundo atrás dele
    slowGrowthCap: 20,       // s  (40 -> 100 em ~20-25 s colado num lento sem poder passar)
    slowProximity: 0.6,      // +60% quando colado (gap -> 0)
    slowDecay: 2.0,          // o "tempo atrás do lento" esvazia 2x mais rápido do que enche
    redLight: 1.0,           // parado no vermelho
    crosswalk: 1.2,          // parado na faixa com pedestre
    belowLimit: 1.0,         // andando abaixo de 80% do limite (sem estar travado)
    clockBase: 0.15,         // o cronômetro passando...
    clockPer300s: 0.25,      // ...e pesando mais com o tempo
    clockMax: 0.6,
    busLaneBeside: 1.5,      // faixa de ônibus vazia do lado e ele parado
    overtook: 8,             // ultrapassou alguém: -8 (mais o tempo que estava atrás do lento * 0.4)
    overtookPerSlowSec: 0.4,
    overtaken: 3,            // ser ultrapassado também dá a sensação de estar devagar
    stressCoupleFrom: 75,    // estresse alto puxa a ansiedade
    stressCouple: 0.5,
  },

  // ---- CONGESTIONAMENTO (traffic.inJam): sobe ANSIEDADE e ESTRESSE juntos, crescendo com o tempo parado na fila
  // (substitui o "atrás de lento" enquanto durar). Perigo: para o dono é quase um alívio.
  jam: { minKmh: 15, anx: 1.0, anxGrow: 0.1, str: 0.8, strGrow: 0.09, cap: 25, decay: 2, lineEvery: 4.5, palpiteMul: 0.6,
    donoRelief: 3.0 },

  // ---- ESTRESSE do Davi ("olha esse animal")
  str: {
    calmDecay: 1.8,          // pista calma e nada acontecendo há calmAfter s (até o repouso)
    rest: 22,                // repouso do estresse
    calmAfter: 4,
    busyDecay: 0.5,
    overtaken: 3.5, overtakenPerKmh: 0.06, overtakenMoto: 3,   // motoboy no corredor: extra
    cutOff: 13, cutOffRingMul: 1.7,                            // fechado; em rotatória/cruzamento x1.7
    honked: 6, flashed: 5, tailgated: 5,
    fine: 16, nearMiss: 10,
    hazard: { manga: 10, jaca: 20 },
    scrape: 14,              // raspão (colisão leve)
    pedSlow: 2.0,            // pontos/s parado esperando pedestre
    busLead: 1.5,            // pontos/s com ônibus na frente
    anxCoupleFrom: 75,       // ansiedade alta puxa o estresse
    anxCouple: 1.2,
    signalRun: 0,            // (Davi não se estressa com o próprio sinal furado)
  },

  // ---- AÇÕES (cooldown em s)
  actions: {
    horn: { max: 3, stress: -6, provoke: 0.35, radius: 35 },
    breathe: { max: 12, anxiety: -22, stress: -6, spread: 2.5, footOff: 2.5, accelMul: 0.35, throttleBias: -0.4, maxSpeedMul: 0.9 },
    curse: { max: 8, stress: -20, provoke: 0.7, radius: 45, reboundDelay: 4, reboundDur: 6, rebound: 26 },
    flash: { max: 4, stress: -3, anxietyIfBlocked: -4 },
    // carona: o jogador é o dono; as ações agem no Davi passageiro
    carona: {
      horn: { daviStress: -5 },
      breathe: { daviAnxiety: -18, daviStress: -5, footOff: 1.2, accelMul: 0.6 },
      curse: { daviStress: -15, rebound: 18, donoStress: 6 },
    },
    perigoCurseDonoStress: 4,
  },

  // ---- EFEITOS NO VOLANTE (Davi motorista). a/s = smoothstep(effectFrom, 100, barra)
  fx: {
    effectFrom: 55,
    throttleBias: 0.22,      // pé "gruda" (só andando > 5 km/h e sem pedal de freio)
    throttleBiasMinKmh: 5,
    steerNoiseAnx: 0.10, steerNoiseStress: 0.05,
    steerGain: 0.30,         // direção nervosa: 1 + s*0.30
    steerDelay: 0.05,        // s
    brakeMul: 0.18,          // freio "atrasado": 1 - s*0.18
    pullFrom: 0.25,          // puxa para a esquerda quando colado num lento e a > 0.25
    pullBase: 0.03, pullAnx: 0.06, // offset de volante (-1..1)
    smoothRate: 2.0,         // 1/s: os efeitos crescem suaves
    autoHornFrom: 0.6, autoHornChance: 0.25, autoHornCd: 5,  // por s, com lead perto
    autoCurseFrom: 0.8, autoCurseCd: 10, autoCurseRelief: -8, autoCurseRebound: 12,
  },

  // ---- ESCORREGAR EM FRUTA (HAZARD_HIT)
  slip: {
    kind: { manga: 1.0, jaca: 2.0 },
    vehicle: { kwid: 1.3, cactus: 1.0 },
    speedRef: 60,            // km/h: severidade 1 a 60 km/h
    minSpeedSev: 0.2, maxSev: 3,
    gripLoss: 0.45,          // gripMul = 1 - gripLoss*sev (mín. gripMin)
    gripMin: 0.15,
    durBase: 0.6, durPerSev: 0.4,
    steerNoise: 0.3,
    yawKick: 0.04,           // rad * sev (empurrão de rumo)
  },

  // ---- DAVI DE PASSAGEIRO (carona)
  carona: {
    freeSlow: 7.0,           // pista livre e o dono devagar
    accelRelief: 5.0,        // acelerar quando está livre alivia
    slowMul: 0.8,            // atrás de lento (menos que dirigindo)
    outburstAt: 90, outburstCd: 6, outburstVent: -35,
    outburstDonoStress: 14, outburstDonoAnx: 8, outburstProvoke: 0.8, outburstRadius: 45,
    dangerAt: 75, safeBelow: 55, // "surto evitado": passou de 75 e voltou abaixo de 55 sem surtar
    palpiteEvery: [2.5, 5.0],// s entre palpites (tagarela)
    palpiteDonoAnx: 1.2,     // cada palpite cutuca o dono
    donoDecay: 2.5,          // dono volta a zero sozinho
    gestureChance: 0.18,     // fração dos palpites que é só gesto
    gestureProvoke: 0.25,
  },

  // ---- DONO DE PASSAGEIRO (perigo): susto (anxiety) e pânico (stress)
  perigo: {
    overLimit: 20,           // pontos/s por 100% acima do limite
    overLimitFrom: 0.05,
    tailgateHeadway: 1.0,    // s
    tailgate: 10,
    hardBrake: 7,            // m/s² de desaceleração a partir do qual assusta
    hardBrakeRate: 25,
    corner: 4,               // m/s² lateral
    cornerRate: 4,
    fastKmh: 100, fast: 3,
    turbo: 4,                // turbo enchendo (spool > 0.85 com pé no fundo)
    nearMiss: 14, scrape: 25, redRun: 18, yellowRun: 6, hazard: 14, fine: 8,
    panicFromSusto: 80, panicRate: 3,
    calmAfter: 2, anxDecay: 4, stressDecay: 2.5,
    complainFrom: 60, complainEvery: [2.5, 5.0],
    complainDaviStress: 4, complainDaviStressPerLevel: 4,
    takeoverAt: 97, takeoverHold: 3,
  },

  // ---- picos / avisos
  peak: { at: 90, rearm: 75 },
  changeEvery: 0.25,         // s entre MOOD_CHANGE

  // ---- falas
  speech: {
    minGap: 1.4,             // s entre falas do MESMO personagem
    minGapHigh: 0.6,         // prioridade alta (eventos)
    slowLineEvery: 3.0,      // atrás de lento
    idleLineEvery: [4, 8],   // resmungos/instruções do Davi motorista
    gestureChance: 0.15,
    gestureProvoke: 0.25,
  },
};
