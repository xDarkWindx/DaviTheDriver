// BALANCEAMENTO DAS REGRAS — multas, colisões, pontuação e resultado (fase de ajuste).
// Valores de multa/pontos inspirados no CTB (não precisam ser exatos).

export const RULES_BALANCE = {
  fines: {
    speed20: { code: 'speed', band: '20', label: 'Excesso de velocidade (até 20%)', amount: 130.16, points: 4 },
    speed50: { code: 'speed', band: '50', label: 'Excesso de velocidade (20% a 50%)', amount: 195.23, points: 5 },
    speedMax: { code: 'speed', band: 'max', label: 'Excesso de velocidade (mais de 50%)', amount: 880.41, points: 7 },
    redLight: { code: 'redLight', label: 'Avanço de sinal vermelho', amount: 293.47, points: 7 },
    crosswalk: { code: 'crosswalk', label: 'Não deu preferência ao pedestre na faixa', amount: 293.47, points: 7 },
    busLane: { code: 'busLane', label: 'Trânsito na faixa exclusiva de ônibus', amount: 293.47, points: 7 },
  },
  speed: {
    tolKmh: 7, tolPctAbove100: 0.07,  // tolerância do medidor (até 100 km/h: 7 km/h; acima: 7%)
    radarLateral: 15,                 // m: largura coberta pelo pardal
    agentMinOverPct: 0.2,             // agente só multa velocidade acima de 20% (radar móvel)
    minKmh: 5,
  },
  redLight: { minKmh: 5, headingCos: 0.5, radarDist: 40, sideMargin: 1.5 },
  crosswalk: { minKmh: 8, occupiedMemory: 1.5, pedRadiusExtra: 2 },
  busLane: { minTime: 3.0, offGrace: 1.0, radarRange: 45, turnZone: 90 }, // turnZone: m antes de uma conversão à direita em que a faixa pode ser usada
  agent: { fovHalf: 1.45, rangeMul: 1.1 },
  dedupe: { seconds: 15, meters: 150 },
  heading: { alignCos: 0.5 },

  collision: {
    crashKmh: 18,          // estático/veículo: a partir disso encerra com 'bateu' (padrão = CONFIG.crashImpactKmh)
    scrapeMinKmh: 3,
    scrapePoints: 150, scrapePerKmh: 10,
    pedestrianAlwaysEnds: true,
  },

  score: {
    zone: {                // zona de equilíbrio (mesma escala 0..100 das barras)
      davi: { lo: 20, hi: 55 },
      perigo: { lo: 20, hi: 55 },
      carona: { lo: 0, hi: 12, daviCeil: 60 }, // carona: zona = dono tranquilo (desenhada nas barras do dono) e Davi abaixo de daviCeil
    },
    rate: 10,              // pontos/s dentro da zona (x multiplicador)
    outRate: 1,            // pontos/s fora da zona (sem multiplicador)
    multBase: { davi: 1, carona: 1, perigo: 1.5 },
    multMax: { davi: 4, carona: 3, perigo: 6 },
    multGain: 0.12,        // por s dentro da zona
    multDropOnBreak: 0.5,  // estourar o teto: multiplicador x0,5 na hora…
    multDecay: 0.3,        // …e escorrega 0,3/s enquanto estiver acima
    donoZeroRate: 3,       // carona: pontos/s extra com as barras do dono < 3
    perigoPanicCut: 0.5,   // perigo: pontos/s x (1 - pânico médio do dono * 0,5)
  },
  final: {
    parSpeed: 12.5,        // m/s (45 km/h) — tempo "par" = distância da rota na largada / parSpeed
    parMin: 60,
    timeBonusMax: 3000,    // bônus = max * clamp((1,5*par - t)/par, 0, 1,2)
    finePointsMul: 100, fineMoneyMul: 1,  // desconto por multa = pontosCNH*100 + R$
    keep: { chegou: 1, bateu: 0.35, desistiu: 0.2, tomouOCarro: 0.25 },
    caronaAvoided: 150, caronaOutburst: -100, caronaDonoZeroPerSec: 0,
    perigoPanicPerSec: 5,
  },
  grade: { A: 85, B: 70, C: 55, D: 40, E: 25,
    perFinePoint: 3, finesCapGrade: 'B', perScrape: 6, timeOver: 40, zoneBonus: 10, perigoPanic: 0.25, caronaOutburst: 6 },
  repair: {
    base: 2500, perKmh: 520,
    kindMul: { pole: 1.0, building: 1.3, wall: 1.2, tree: 1.1, guardrail: 0.9, landmark: 1.5, busStop: 1.0, water: 3.0, vehicle: 1.2, pedestrian: 0.6, car: 1.0, busSTJ: 1.6 },
    vehicleKindMul: { bus: 1.6, truck: 1.5, moto: 0.7 },
  },
  years: { base: 0.3, perPanicSec: 0.04, perScrape: 0.5, crash: 2, takeover: 1.5 },
  hazardExcuseWindow: 8,   // s: batida até 8 s depois de escorregar = causa "fruta"
};
