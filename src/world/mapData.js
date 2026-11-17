// Mapa estilizado de Brasília como DADOS puros (sem three.js).
// Coordenadas em metros. +X = leste, +Z = sul (norte = -Z), Y = altura.
// Não é fiel em escala: é "reconhecível e divertido".
//
//   Sudoeste (casa) ──EPIG── Balão do Eixo Oeste ══ Eixo Monumental (Estádio, Torre, Rodoviária,
//   Catedral, Esplanada) ══ Balão da Praça dos Três Poderes (Congresso) ── Via S2 ── SAFS (STJ)
//   Rota lenta: Estrada Parque → W3 Sul (semáforos) → Entrequadra (passa sob o Eixão, tesourinha)
//   → L2 Sul (semáforos) → SAFS.  Variante: tesourinha → Eixão → alça da Rodoviária → Eixo.

const D2R = Math.PI / 180;

export const MAP = {
  bounds: { minX: -1800, maxX: 1200, minZ: -760, maxZ: 1200 },

  // Nós simples. type: 'junction' (padrão) | 'edge' (borda do mapa: fonte/sumidouro de tráfego) | 'deadend'
  nodes: {
    casa: { x: -1565, z: 350, type: 'deadend' },
    J_W3N: { x: -600, z: 40 },
    J_W3a: { x: -600, z: 350 },
    J_W3m: { x: -600, z: 520 },
    J_W3b: { x: -600, z: 700 },
    W3_S: { x: -600, z: 1190, type: 'edge' },
    M_RODO: { x: 150, z: 40 },
    EX_N: { x: 0, z: -750, type: 'edge' },
    X_RAMP: { x: 0, z: 230 },
    T_M: { x: 0, z: 735 },
    EX_S: { x: 0, z: 1190, type: 'edge' },
    T_D: { x: 48, z: 700 },
    J_L2a: { x: 500, z: 700 },
    J_L2m: { x: 500, z: 480 },
    J_L2b: { x: 500, z: 260 },
    L2_S: { x: 500, z: 1190, type: 'edge' },
    J_SAFS: { x: 800, z: 260 },
    E_SAFS: { x: 1190, z: 260, type: 'edge' },
    E_L2m: { x: 1190, z: 480, type: 'edge' },
    E_ENT: { x: 1190, z: 700, type: 'edge' },
    RW_N_E: { x: -1000, z: -750, type: 'edge' },
    RW_W_E: { x: -1790, z: 0, type: 'edge' },
    RE_N_E: { x: 800, z: -750, type: 'edge' },
    RSW_S_E: { x: -1250, z: 1190, type: 'edge' },
  },

  // Rotatórias ("balões"). Circulação anti-horária vista de cima (mão direita).
  // entries: idDoNó -> ângulo (graus, anti-horário a partir do leste, visto com o norte para cima).
  roundabouts: [
    {
      id: 'R_SW', name: 'Balão do Sudoeste', x: -1250, z: 350, radius: 24, lanes: 2, laneW: 3.6, limitKmh: 40,
      entries: { rsw_e: 0, rsw_n: 90, rsw_w: 180, rsw_s: 270 },
    },
    {
      id: 'R_W', name: 'Balão do Eixo Monumental (Buriti)', x: -1000, z: 0, radius: 58, lanes: 2, laneW: 4, limitKmh: 50,
      entries: { rw_es: -43.6, rw_en: 43.6, rw_n: 90, rw_w: 180, rw_sw: 225 },
    },
    {
      id: 'R_E', name: 'Balão da Praça dos Três Poderes', x: 800, z: 0, radius: 58, lanes: 2, laneW: 4, limitKmh: 50,
      entries: { re_n: 90, re_en: 136.4, re_es: 223.6, re_s: 270 },
    },
  ],

  // Vias. from/to = nós; via = pontos intermediários [x,z] (cantos são arredondados com `corner` m).
  // lanesF = faixas no sentido from→to; lanesB = no sentido to→from (0 = mão única).
  // median = largura do canteiro central (m). layer: 0 chão, 1 viaduto, 2 viaduto sobre viaduto (só visual).
  roads: [
    { id: 'sud_local', name: 'Sudoeste (via local)', from: 'casa', to: 'rsw_w', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'rsw_south', name: 'EPIG Sul', from: 'rsw_s', to: 'RSW_S_E', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'arterial' },
    { id: 'epig', name: 'EPIG', from: 'rsw_n', to: 'rw_sw', via: [[-1250, 250], [-1185, 150], [-1085, 88]], corner: 60,
      lanesF: 2, lanesB: 2, median: 4, limitKmh: 60, kind: 'arterial' },
    { id: 'est_parque', name: 'Estrada Parque (Parque da Cidade)', from: 'rsw_e', to: 'J_W3a', lanesF: 2, lanesB: 2, median: 2, limitKmh: 60, kind: 'arterial' },

    { id: 'eixo_sul_a', name: 'Eixo Monumental', from: 'rw_es', to: 'J_W3N', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2 },
    { id: 'eixo_sul_b', name: 'Eixo Monumental', from: 'J_W3N', to: 'M_RODO', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2 },
    { id: 'eixo_sul_c', name: 'Eixo Monumental (Esplanada)', from: 'M_RODO', to: 're_es', lanesF: 3, lanesB: 0, limitKmh: 60, kind: 'eixo', layer: 2 },
    { id: 'eixo_norte', name: 'Eixo Monumental', from: 're_en', to: 'rw_en', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2 },
    { id: 'rw_north', name: 'EPIA (acesso norte)', from: 'rw_n', to: 'RW_N_E', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'arterial' },
    { id: 'rw_west', name: 'Eixo Monumental (Memorial JK)', from: 'rw_w', to: 'RW_W_E', lanesF: 2, lanesB: 2, median: 6, limitKmh: 60, kind: 'arterial' },
    { id: 're_north', name: 'Via N2', from: 're_n', to: 'RE_N_E', lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },

    { id: 'safs_n', name: 'Via S2', from: 're_s', to: 'J_SAFS', lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },
    { id: 'via_safs', name: 'SAFS (Setor de Adm. Federal Sul)', from: 'J_SAFS', to: 'J_L2b', lanesF: 2, lanesB: 2, limitKmh: 40, kind: 'urban' },
    { id: 'safs_east', name: 'Via L4 Sul', from: 'J_SAFS', to: 'E_SAFS', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },

    { id: 'w3_n', name: 'W3 Sul', from: 'J_W3N', to: 'J_W3a', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'w3_m1', name: 'W3 Sul', from: 'J_W3a', to: 'J_W3m', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'w3_m2', name: 'W3 Sul', from: 'J_W3m', to: 'J_W3b', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'w3_s', name: 'W3 Sul', from: 'J_W3b', to: 'W3_S', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },

    { id: 'ent_w', name: 'Entrequadra Sul', from: 'J_W3b', to: 'T_D', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban', layer: 0 },
    { id: 'ent_e', name: 'Entrequadra Sul', from: 'T_D', to: 'J_L2a', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 'ent_far', name: 'Entrequadra Sul', from: 'J_L2a', to: 'E_ENT', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 'tes', name: 'Tesourinha', from: 'T_D', to: 'T_M', via: [[78, 708], [95, 735], [92, 768], [68, 790], [38, 788], [20, 768]], corner: 18,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 30, kind: 'ramp', layer: 0 },

    { id: 'eixao_n', name: 'Eixão Sul', from: 'EX_N', to: 'X_RAMP', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'eixao_m', name: 'Eixão Sul', from: 'X_RAMP', to: 'T_M', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'eixao_s', name: 'Eixão Sul', from: 'T_M', to: 'EX_S', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'rodo_ramp', name: 'Alça da Rodoviária', from: 'X_RAMP', to: 'M_RODO', via: [[14, 175], [30, 118], [62, 76], [105, 54]], corner: 30,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 50, kind: 'ramp', layer: 1 },

    { id: 'l2_n', name: 'L2 Sul', from: 'J_L2b', to: 'J_L2m', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2_m', name: 'L2 Sul', from: 'J_L2m', to: 'J_L2a', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2_s', name: 'L2 Sul', from: 'J_L2a', to: 'L2_S', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2m_east', name: 'Via L3 Sul', from: 'J_L2m', to: 'E_L2m', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
  ],

  // Cruzamentos em desnível: 'over' passa por cima de 'under' (sem nó; tráfego não interage).
  gradeSeparations: [
    { over: 'eixo_sul_b', under: 'eixao_n' },
    { over: 'eixo_norte', under: 'eixao_n' },
    { over: 'eixao_m', under: 'ent_w' },
  ],

  // Semáforos (nós). Fases agrupadas por eixo de aproximação automaticamente.
  signals: ['J_W3N', 'J_W3a', 'J_W3m', 'J_W3b', 'J_L2a', 'J_L2m', 'J_L2b', 'J_SAFS'],

  // Faixas de pedestre no meio de quadra (as dos semáforos são automáticas).
  crosswalks: [
    { seg: 'sud_local', at: [-1420, 350] },
    { seg: 'sud_local', at: [-1505, 350] },
    { seg: 'est_parque', at: [-905, 350] },
    { seg: 'eixo_sul_b', at: [-110, 40] },
    { seg: 'eixo_norte', at: [-110, -40] },
    { seg: 'eixo_sul_c', at: [470, 40] },
    { seg: 'eixo_norte', at: [470, -40] },
    { seg: 'via_safs', at: [600, 260] },
    { seg: 'l2_n', at: [500, 370] },
    { seg: 'ent_e', at: [260, 700] },
    { seg: 'safs_n', at: [800, 165] },
    { seg: 'w3_m2', at: [-600, 615] },
  ],

  // Posições CANDIDATAS a pardal/radar (quem decide quais ativar é rules.js). dir: 1, -1 ou 0 (ambos).
  radars: [
    { seg: 'eixo_sul_a', at: [-780, 40], dir: 1 },
    { seg: 'eixo_sul_b', at: [-300, 40], dir: 1 },
    { seg: 'eixo_sul_c', at: [400, 40], dir: 1 },
    { seg: 'eixo_norte', at: [-300, -40], dir: 1 },
    { seg: 'eixo_norte', at: [400, -40], dir: 1 },
    { seg: 'epig', at: [-1200, 175], dir: 0 },
    { seg: 'eixao_m', at: [0, 470], dir: 0 },
    { seg: 'w3_m2', at: [-600, 650], dir: 0 },
    { seg: 'l2_m', at: [500, 590], dir: 0 },
    { seg: 'est_parque', at: [-780, 350], dir: 0 },
  ],

  // Zonas de chegada (círculos no chão) e poses de largada (snap para a faixa da direita).
  zones: {
    casa: { x: -1540, z: 350, r: 20, label: 'Casa (Sudoeste)' },
    stj: { x: 650, z: 262, r: 22, label: 'STJ' },
  },
  starts: {
    casa: { x: -1528, z: 352, heading: 90 * D2R },  // rumo leste
    stj: { x: 690, z: 262, heading: 90 * D2R },     // rumo leste (vira à esquerda no SAFS p/ o Eixo)
  },
};
