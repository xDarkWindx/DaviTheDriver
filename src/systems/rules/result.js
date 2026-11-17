// RESULTADO DA VIAGEM (puro): pontos finais, nota, título, boletim (crash), anos de vida do dono.
// Tom: o jogo mostra, não rotula — títulos falam da VIAGEM; a "excuse" do boletim é uma CAUSA impessoal e absurda.
import { RULES_BALANCE } from './balance.js';

export const TITLES = {
  chegou: {
    A: ['Zen por 40 segundos', 'Chegou inteiro e no horário', 'Monge do Eixo Monumental'],
    B: ['Quase zen', 'Chegou inteiro', 'Viagem tranquila (quase)'],
    C: ['Viagem com emoção', 'Cidadão médio do DF', 'Chegou, com buzina'],
    D: ['Viagem com muita emoção', 'O pardal mandou lembranças', 'Chegou, mas a CNH sentiu'],
    E: ['Patrocínio oficial do Detran-DF', 'Chegou. A que preço?'],
    F: ['Chegou por milagre', 'Rali Brasília'],
  },
  chegouMode: {
    carona: { A: ['Motorista cinco estrelas', 'Paz a bordo do Cactus'] },
    perigo: { A: ['Devolveu o Cactus inteiro', 'Milagre no Eixo'] },
  },
  bateu: {
    davi: ['Parada não programada', 'Viagem interrompida', 'O asfalto venceu'],
    carona: ['Primeiro arranhão do Cactus', 'Parada não programada'],
    perigo: ['O Cactus voltou de guincho', 'Fim do empréstimo'],
  },
  tomouOCarro: ['Rebaixado a passageiro', 'Fim da linha: banco do carona'],
  desistiu: ['Foi de aplicativo', 'Melhor nem ter ido'],
};

export const CRASH_WITH = {
  building: 'um prédio, surpreendentemente parado', tree: 'um ipê (em flor)', pole: 'um poste',
  guardrail: 'o guard-rail', landmark: 'um monumento tombado pelo patrimônio', busStop: 'um ponto de ônibus',
  wall: 'um muro', water: 'o Lago Paranoá', static: 'um obstáculo fixo',
  car: 'um carro estacionado', bus: 'um ônibus', moto: 'uma moto', truck: 'um caminhão', vehicle: 'outro carro',
  pedestrian: 'um pedestre (que levou um susto e está bem)', busSTJ: 'um ônibus do STJ',
};
/** Modelo do trânsito -> chave de CRASH_WITH/CRASH_CAUSE. */
const VEHICLE_KIND = { onibus: 'bus', moto: 'moto', mudanca: 'truck', sedan: 'vehicle', hatch: 'vehicle', suv: 'vehicle', picape: 'vehicle', autoescola: 'vehicle' };

// Causas impessoais e absurdas (ninguém culpa ninguém).
export const CRASH_CAUSE = {
  manga: ['Uma manga.', 'O asfalto estava liso de manga.', 'Física + manga madura.', 'Outubro em Brasília: chove manga.'],
  jaca: ['Uma jaca. Inteira.', 'A jaca.', 'Uma jaca madura e a lei da inércia.'],
  pole: ['O poste apareceu.', 'Um poste, exatamente onde sempre houve um poste.', 'A física.'],
  building: ['Um prédio, firme em sua posição.', 'Concreto armado.'],
  tree: ['Um ipê em plena floração.', 'Raízes profundas.'],
  guardrail: ['O guard-rail cumpriu a função dele.', 'Engenharia de tráfego funcionando.'],
  landmark: ['Arquitetura modernista.', 'Uma curva de Niemeyer.'],
  busStop: ['O ponto de ônibus estava no ponto.'],
  wall: ['Um muro, firme em suas convicções.'],
  water: ['O Lago Paranoá estava onde sempre esteve.', 'A hidrografia do Planalto Central.'],
  vehicle: ['Dois carros, um espaço.', 'A física: dois corpos não ocupam o mesmo lugar.', 'Geometria.'],
  bus: ['Um ônibus. Grande. Muito grande.', 'Massa vezes aceleração.'],
  busSTJ: ['Um ônibus do STJ, na rotatória.'],
  moto: ['Uma moto que estava ali e, de repente, estava aqui.'],
  truck: ['Um caminhão e a terceira lei de Newton.'],
  car: ['Carro estacionado, exatamente onde estava estacionado.'],
  pedestrian: ['Pedestre na faixa. A faixa é dele.', 'A faixa de pedestre funcionou: tinha um pedestre.'],
  _: ['A física.', 'Inércia. Pura inércia.', 'O asfalto, que estava ali.'],
};

export const REPAIR_SHARES = [
  ['Para-choque dianteiro', 0.24], ['Farol esquerdo', 0.14], ['Capô e vincos', 0.2],
  ['Mão de obra', 0.16], ['Pintura cinza Cactus original', 0.12], ['Guincho e diária do pátio', 0.14],
];

const pick = (arr, seed) => arr[((Math.abs(Math.floor(seed)) % arr.length) + arr.length) % arr.length];
const round1 = (v) => Math.round(v * 10) / 10;

export function gradeFromIndex(B, g) {
  const G = B.grade;
  return g >= G.A ? 'A' : g >= G.B ? 'B' : g >= G.C ? 'C' : g >= G.D ? 'D' : g >= G.E ? 'E' : 'F';
}

export function finePenalty(B, fines) {
  let p = 0;
  for (const f of fines) p += (f.points || 0) * B.final.finePointsMul + (f.amount || 0) * B.final.fineMoneyMul;
  return p;
}

/** Bônus de tempo na chegada. */
export function timeBonus(B, time, par) {
  const F = B.final;
  if (!(par > 0) || !(time > 0)) return 0;
  return Math.round(F.timeBonusMax * Math.max(0, Math.min(1.2, (1.5 * par - time) / par)));
}

/**
 * i = { reason, mode, vehicleId, time, par, score (createScore), fines [...], stats (mood stats|null),
 *       crash: { b, kind, impactKmh, vehicleKind?, x, z } | null, lastHazard: { kind, t } | null, now (s),
 *       scrapes, sinistroNo, seed }
 */
export function buildResult(i, B = RULES_BALANCE) {
  const F = B.final, G = B.grade, reason = i.reason, mode = i.mode || 'davi';
  const fines = (i.fines || []).map((f) => ({ code: f.code, label: f.label, amount: f.amount, points: f.points, by: f.by }));
  const stats = i.stats || {};
  const time = i.time || 0;
  const par = Math.max(F.parMin, i.par || 0);
  const seed = i.seed != null ? i.seed : Math.round(time * 10);
  const sc = i.score || { points: 0, zoneTime: 0, time: 0, panicAcc: 0 };
  const scrapes = i.scrapes || 0;

  // ---- pontos
  let pts = sc.points;
  const keep = F.keep[reason] != null ? F.keep[reason] : 1;
  pts *= keep;
  if (reason === 'chegou') pts += timeBonus(B, time, par);
  if (mode === 'carona') pts += F.caronaAvoided * (stats.avoided || 0) + F.caronaOutburst * (stats.outbursts || 0);
  if (mode === 'perigo') pts -= F.perigoPanicPerSec * (stats.panicSecs || 0);
  pts -= finePenalty(B, fines);
  const points = Math.max(0, Math.round(pts));

  // ---- nota
  let grade;
  if (reason === 'chegou') {
    const zoneFrac = sc.time > 0 ? sc.zoneTime / sc.time : 0;
    let finePts = 0; for (const f of fines) finePts += f.points || 4;
    let g = 100 - G.perFinePoint * finePts - G.perScrape * scrapes - G.timeOver * Math.max(0, time / par - 1) + G.zoneBonus * zoneFrac;
    if (mode === 'perigo') g -= G.perigoPanic * (time > 0 ? (sc.panicAcc || 0) / time : 0);
    if (mode === 'carona') g -= G.caronaOutburst * (stats.outbursts || 0);
    grade = gradeFromIndex(B, g);
    if (fines.length && grade < G.finesCapGrade) grade = G.finesCapGrade; // com multa, nunca 'A'
  } else if (reason === 'desistiu') grade = fines.length ? 'F' : 'E';
  else grade = 'F';

  // ---- título
  let title;
  if (reason === 'chegou') {
    const byMode = TITLES.chegouMode[mode] && TITLES.chegouMode[mode][grade];
    title = pick(byMode || TITLES.chegou[grade], seed);
  } else if (reason === 'bateu') title = pick(TITLES.bateu[mode] || TITLES.bateu.davi, seed);
  else title = pick(TITLES[reason] || TITLES.desistiu, seed);

  // ---- boletim
  let crash = null;
  if (reason === 'bateu') {
    const c = i.crash || {};
    const b = c.b || 'static';
    const vkind = b === 'vehicle' ? (c.persona === 'onibusSTJ' ? 'busSTJ' : VEHICLE_KIND[c.vehicleKind || c.kind] || 'vehicle') : null;
    const kind = b === 'pedestrian' ? 'pedestrian' : b === 'vehicle' ? vkind : c.kind || 'static';
    const hz = i.lastHazard && i.now != null && i.now - i.lastHazard.t <= B.hazardExcuseWindow ? i.lastHazard.kind : null;
    const withWhat = CRASH_WITH[kind] || (b === 'vehicle' ? CRASH_WITH.vehicle : CRASH_WITH.static);
    const causes = hz ? CRASH_CAUSE[hz] : CRASH_CAUSE[kind] || (b === 'vehicle' ? CRASH_CAUSE.vehicle : CRASH_CAUSE._);
    const excuse = pick(causes, seed + 3);
    const impact = c.impactKmh || 30;
    let repairCost = null, repairItems = null;
    if (i.vehicleId === 'cactus') {
      const R = B.repair;
      const km = (b === 'vehicle' ? R.vehicleKindMul[vkind] || R.kindMul.vehicle : R.kindMul[kind]) || 1;
      repairCost = Math.round((R.base + impact * R.perKmh) * km / 10) * 10;
      let used = 0;
      repairItems = REPAIR_SHARES.map(([name, share], k) => {
        const v = k === REPAIR_SHARES.length - 1 ? repairCost - used : Math.round(repairCost * share / 10) * 10;
        used += v; return [name, v];
      });
      if (hz) repairItems.push([hz === 'jaca' ? 'Remoção de jaca do para-lama' : 'Lavagem (polpa de manga)', 0]);
    }
    crash = { withWhat, excuse, repairCost, repairItems, impactKmh: Math.round(impact), kind, cause: hz || kind,
      sinistroNo: i.sinistroNo != null ? i.sinistroNo : 2 + (Math.abs(seed * 7919) % 98) };
  }

  // ---- anos de vida do dono (perigo)
  let yearsLost = null;
  if (mode === 'perigo') {
    const Y = B.years;
    yearsLost = round1(Y.base + Y.perPanicSec * (stats.panicSecs || 0) + Y.perScrape * scrapes
      + (reason === 'bateu' ? Y.crash : 0) + (reason === 'tomouOCarro' ? Y.takeover : 0));
  }

  return { reason, time, points, grade, title, fines, crash, yearsLost };
}
