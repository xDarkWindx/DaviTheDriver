// Elenco do trânsito (personalidades) e mistura por tipo de via. Puro JS (sem three.js) — testável em Node.
//
// Velocidades: `speedMul` multiplica o limite da faixa; `speedKmh` fixa uma faixa absoluta (tio de chapéu);
// `maxKmh` é teto. IDM: T (s, tempo de seguimento), s0 (m, folga parado), a (m/s², aceleração), b (m/s², frenagem
// confortável). Troca de faixa (MOBIL simplificado): lcGain (ganho mínimo de aceleração), lcBackTime/minBack
// (folga exigida de quem vem atrás), keepRight (vontade de voltar à direita). gapRing: brecha (s) aceita para
// entrar na rotatória. flash: reação ponderada a farol/buzina do jogador. temper: quanto `provoke` pega nele.

export const PERSONAS = {
  normal: {
    label: 'motorista normal', models: { sedan: 3, hatch: 4, suv: 2, picape: 1 },
    speedMul: [0.86, 1.06], T: [1.2, 1.6], s0: 2.2, a: [1.7, 2.4], b: 3.0,
    lcGain: 0.45, lcBackTime: 0.9, minBack: 5, keepRight: 0.25, gapRing: 3.0,
    flash: { yield: 0.6, brake: 0.12, ignore: 0.28 }, temper: 0.8, honkPatience: 3.5, aggr: 0.2, react: [0.4, 1.0],
  },
  tio: {
    label: 'tio de chapéu', models: { sedan: 3, hatch: 1 },
    speedKmh: [30, 40], T: [1.8, 2.3], s0: 3, a: [1.0, 1.4], b: 2.5,
    noLaneChange: true, preferLeft: true, gapRing: 3.8,
    flash: { yield: 0.05, brake: 0.25, ignore: 0.7 }, temper: 0.5, honkPatience: 99, aggr: 0.05, react: [1.0, 1.8],
  },
  autoescola: {
    label: 'autoescola', models: { autoescola: 1 },
    speedMul: [0.55, 0.7], maxKmh: 40, T: [2.0, 2.4], s0: 3, a: [0.9, 1.3], b: 2.5,
    lcGain: 1.5, lcBackTime: 1.4, minBack: 9, keepRight: 0.8, gapRing: 4.5,
    randomBrake: [7, 18], stallDelay: [2.2, 4.5],
    flash: { yield: 0.45, brake: 0.35, ignore: 0.2 }, temper: 0.3, honkPatience: 99, aggr: 0, react: [1.2, 2.0],
  },
  mudanca: {
    label: 'caminhão de mudança', models: { mudanca: 1 },
    speedMul: [0.72, 0.85], maxKmh: 55, T: [1.8, 2.2], s0: 3.5, a: [0.7, 0.9], b: 2.2,
    lcGain: 1.2, lcBackTime: 1.2, minBack: 8, keepRight: 1.0, gapRing: 4.0,
    flash: { yield: 0.3, brake: 0.1, ignore: 0.6 }, temper: 0.6, honkPatience: 5, aggr: 0.15, react: [0.8, 1.4],
  },
  onibus: {
    label: 'ônibus', models: { onibus: 1 },
    speedMul: [0.8, 0.95], maxKmh: 60, T: [1.6, 2.0], s0: 3, a: [0.8, 1.05], b: 2.2,
    bus: true, lcGain: 1.0, lcBackTime: 1.2, minBack: 8, keepRight: 1.5, gapRing: 3.5, dwell: [6, 10],
    flash: { yield: 0.1, brake: 0.1, ignore: 0.8 }, temper: 0.7, honkPatience: 3, aggr: 0.3, react: [0.6, 1.2],
  },
  moto: {
    label: 'motoboy', models: { moto: 1 },
    speedMul: [1.12, 1.3], T: [0.8, 1.0], s0: 1.2, a: [3.0, 3.8], b: 4.5,
    filter: true, honky: true, lcGain: 0.1, lcBackTime: 0.4, minBack: 2.5, keepRight: 0, gapRing: 1.8,
    flash: { yield: 0.7, brake: 0.05, ignore: 0.25 }, temper: 1.0, honkPatience: 1.5, aggr: 0.5, react: [0.2, 0.5],
  },
  apressado: {
    label: 'apressado', models: { sedan: 2, suv: 2, picape: 2, hatch: 1 },
    speedMul: [1.18, 1.35], T: [0.6, 0.8], s0: 1.3, a: [2.8, 3.4], b: 4.5,
    tailgater: true, flasher: true, cutter: true, lcGain: 0.12, lcBackTime: 0.35, minBack: 2.5, keepRight: 0, gapRing: 1.5,
    flash: { yield: 0.1, brake: 0.6, ignore: 0.3 }, temper: 1.3, honkPatience: 1.2, aggr: 0.7, react: [0.2, 0.4],
  },
};

/** Persona padrão de cada modelo (para debug.spawn('onibus') etc.). */
export const MODEL_PERSONA = { sedan: 'normal', hatch: 'normal', suv: 'normal', picape: 'normal', autoescola: 'autoescola', mudanca: 'mudanca', onibus: 'onibus', moto: 'moto' };

/** Som de passagem (audio.vehiclePass) por modelo. */
export const AUDIO_KIND = { onibus: 'bus', mudanca: 'truck', moto: 'moto' };

/** Dimensões de reserva (as reais vêm de TRAFFIC_MODELS em player/vehicleModels.js). */
export const MODEL_DIMS = {
  sedan: { length: 4.45, width: 1.75, massKg: 1150 }, hatch: { length: 3.95, width: 1.7, massKg: 1000 },
  suv: { length: 4.45, width: 1.82, massKg: 1450 }, picape: { length: 5.3, width: 1.86, massKg: 1900 },
  autoescola: { length: 3.95, width: 1.7, massKg: 1000 }, onibus: { length: 12.2, width: 2.5, massKg: 13000 },
  mudanca: { length: 7.4, width: 2.3, massKg: 6500 }, moto: { length: 2.05, width: 0.8, massKg: 230 },
};

/**
 * Densidade e elenco por `segment.kind` (dado da malha). density multiplica a chance de spawn num ponto da via.
 * Urbano (S3/SCS/W3) mais cheio e variado; Eixo/Eixão fluxo rápido; local (Sudoeste, Parque) vazio e lento.
 */
export const ROAD_TRAFFIC = {
  eixo: { density: 0.95, mix: { normal: 0.55, apressado: 0.2, moto: 0.1, onibus: 0.06, mudanca: 0.03, autoescola: 0.02, tio: 0.04 } },
  eixao: { density: 0.9, mix: { normal: 0.55, apressado: 0.22, moto: 0.1, onibus: 0.04, mudanca: 0.04, autoescola: 0.01, tio: 0.04 } },
  urban: { density: 1.35, mix: { normal: 0.48, apressado: 0.1, moto: 0.15, onibus: 0.09, autoescola: 0.07, mudanca: 0.04, tio: 0.07 } },
  arterial: { density: 0.85, mix: { normal: 0.55, apressado: 0.15, moto: 0.1, onibus: 0.04, mudanca: 0.06, autoescola: 0.04, tio: 0.06 } },
  ring: { density: 0.8, mix: { normal: 0.55, apressado: 0.15, moto: 0.1, onibus: 0.04, mudanca: 0.04, autoescola: 0.05, tio: 0.07 } },
  ramp: { density: 0.35, mix: { normal: 0.6, apressado: 0.2, moto: 0.1, mudanca: 0.05, tio: 0.05 } },
  local: { density: 0.4, mix: { normal: 0.55, autoescola: 0.15, tio: 0.15, moto: 0.07, mudanca: 0.08 } },
};
export const ROAD_DEFAULT = ROAD_TRAFFIC.urban;

/** Sorteio ponderado em objeto { chave: peso }. Sem alocação. */
export function pickWeighted(obj, r) {
  let tot = 0;
  for (const k in obj) tot += obj[k];
  let x = r * tot;
  let last = null;
  for (const k in obj) { last = k; x -= obj[k]; if (x <= 0) return k; }
  return last;
}
