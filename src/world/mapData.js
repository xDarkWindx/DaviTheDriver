// Mapa estilizado de Brasília como DADOS puros (sem three.js).
// Coordenadas em metros. +X = leste, +Z = sul (norte = -Z), Y = altura.
// Não é fiel em escala (distâncias comprimidas ~1/3.5); topologia e ordem dos marcos seguem as rotas reais.
//
//  OESTE                                                                                  LESTE
//  Praça do Cruzeiro (balão) ══ Eixo Monumental (Via S1 → leste / Via N1 → oeste) ══ Praça dos Três Poderes
//     ║ Av. das Jaqueiras      Memorial JK   Estádio  Torre de TV   W3   Eixão/Rodoviária  Esplanada  Congresso
//     ║  (borda oeste)            EPIG ║                              ║        ║  └Via S2 → SAUS → SAFS (STJ)
//  Sudoeste (QRSW 2 = casa)         ║   Parque da Cidade (anel)  ←── Pátio Brasil ←── Via S3 ←── SCS/SAUS ←─ STJ
//  Terceira/Quarta Av. (balões)     ║
//  Primeira Avenida ════════ Balão da EPIG
//
// ROTA RÁPIDA (Eixo):  QRSW 2 → oeste → Av. das Jaqueiras ↑ → Praça do Cruzeiro → Eixo (Via S1) → Rodoviária
//                      → Via S2 (SAUS) → SAFS → STJ.  Volta: SAFS → Via S2 ↑ → Praça dos Três Poderes → Via N1.
// ROTA LENTA (S3/Parque): STJ → Via S3 (SAUS, SCS, semáforos) → Pátio Brasil → anel do Parque da Cidade
//                      → Balão da EPIG → Primeira Avenida → Av. das Jaqueiras ↑ → QRSW 2. (Ambas nos dois sentidos.)

const D2R = Math.PI / 180;

export const MAP = {
  bounds: { minX: -1800, maxX: 1200, minZ: -760, maxZ: 1200 },

  // Nós simples. type: 'junction' (padrão) | 'edge' (borda do mapa: fonte/sumidouro de tráfego) | 'deadend'
  nodes: {
    // Sudoeste
    // Regra de projeto: o Sudoeste só se liga ao resto da cidade pela Av. das Jaqueiras (e Primeira Avenida),
    // senão o GPS foge das rotas descritas (ver README). Ruas internas são lentas (30 km/h) e tortas.
    J_JAQ2: { x: -1500, z: 200 },    // Jaqueiras × QRSW 2
    J_Q2a: { x: -1325, z: 200 },     // QRSW 2 × ruas internas (QRSW 1 ao norte, QRSW 3/4 ao sul)
    D_Q1: { x: -1342, z: 128, type: 'deadend' },
    J_JAQ3: { x: -1500, z: 430 },    // Jaqueiras × Terceira Avenida
    J_T3b: { x: -1420, z: 430 },
    J_T3a: { x: -1330, z: 430 },
    J_JAQSEG: { x: -1500, z: 515 },  // Jaqueiras × Segunda Avenida
    J_S2a: { x: -1372, z: 515 },
    D_EQ: { x: -1140, z: 200, type: 'deadend' },   // EQRSW: sem saída (estacionamento do Parque Urbano)
    D_CL: { x: -1142, z: 588, type: 'deadend' },   // comércio local sul (CLSW)
    J_PRIM: { x: -1500, z: 600 },    // Jaqueiras × Primeira Avenida
    JAQ_S: { x: -1500, z: 1190, type: 'edge' },
    // EPIG
    J_EPIG: { x: -1000, z: 40 },     // EPIG × Eixo (Via S1)
    J_EPIGm: { x: -1012, z: 200 },
    J_EPIG3: { x: -1030, z: 430 },
    EPIG_S: { x: -1060, z: 1190, type: 'edge' },
    // Eixo / W3 / Eixão
    J_W3N: { x: -430, z: 40 },
    D_EX: { x: -120, z: 40 },        // saída do Eixo (Via S1) → alça para o Eixão Sul
    X_S2: { x: 60, z: 40 },          // descida Eixo → Via S2 (Rodoviária)
    S2_J: { x: 112, z: 112 },        // Via S2 × alça de subida para o Eixo (Via N1)
    X_N1: { x: 150, z: -40 },        // alça da Rodoviária entra no Eixo sentido oeste (Via N1)
    M_EX: { x: 0, z: 175 },          // alça do Eixo entra no Eixão Sul (sentido sul)
    J_PB: { x: -430, z: 190 },       // Pátio Brasil: W3 × Via S3 × anel do Parque
    J_W3b: { x: -430, z: 700 },
    W3_S: { x: -430, z: 1190, type: 'edge' },
    EX_N: { x: 0, z: -750, type: 'edge' },
    X_RAMP: { x: 0, z: 340 },        // saída do Eixão (norte) → Via S3
    T_M: { x: 0, z: 735 },
    EX_S: { x: 0, z: 1190, type: 'edge' },
    T_D: { x: 48, z: 700 },
    // Via S3 / Via S2 / L2 / SAFS
    J_S3b: { x: -200, z: 235 },      // SCS
    J_S3a: { x: 200, z: 260 },       // SAUS
    M_S3: { x: 100, z: 253.75 },     // alça do Eixão entra na Via S3
    J_S2_L2: { x: 500, z: 150 },
    J_L2b: { x: 500, z: 260 },
    J_L2m: { x: 500, z: 480 },
    J_L2a: { x: 500, z: 700 },
    L2_S: { x: 500, z: 1190, type: 'edge' },
    J_S2E: { x: 800, z: 150 },
    J_SAFS: { x: 800, z: 260 },
    E_SAFS: { x: 1190, z: 260, type: 'edge' },
    E_L2m: { x: 1190, z: 480, type: 'edge' },
    E_ENT: { x: 1190, z: 700, type: 'edge' },
    RW_N_E: { x: -1500, z: -750, type: 'edge' },
    RW_W_E: { x: -1790, z: 0, type: 'edge' },
    RE_N_E: { x: 800, z: -750, type: 'edge' },
  },

  // Rotatórias ("balões"). Circulação anti-horária vista de cima (mão direita).
  // entries: idDoNó -> ângulo (graus, anti-horário a partir do leste, visto com o norte para cima).
  roundabouts: [
    {
      id: 'R_W', name: 'Praça do Cruzeiro (balão)', x: -1500, z: 0, radius: 58, lanes: 2, laneW: 4, limitKmh: 50,
      entries: { rw_es: -43.6, rw_en: 43.6, rw_n: 90, rw_w: 180, rw_s: 270 },
    },
    {
      id: 'R_E', name: 'Praça dos Três Poderes (balão)', x: 800, z: 0, radius: 58, lanes: 2, laneW: 4, limitKmh: 50,
      entries: { re_n: 90, re_en: 136.4, re_es: 223.6, re_s: 270 },
    },
    {
      id: 'R_Q', name: 'Balão da Quarta Avenida', x: -1250, z: 200, radius: 18, lanes: 1, laneW: 4.5, limitKmh: 30,
      entries: { rq_e: 0, rq_w: 180, rq_se: 290 },
    },
    {
      id: 'R_T', name: 'Balão da Terceira Avenida', x: -1180, z: 430, radius: 18, lanes: 1, laneW: 4.5, limitKmh: 30,
      entries: { rt_nw: 110, rt_w: 180, rt_se: 290 },
    },
    {
      id: 'R_S', name: 'Balão da Segunda Avenida', x: -1150, z: 525, radius: 16, lanes: 1, laneW: 4.5, limitKmh: 30,
      entries: { rs_n: 95, rs_w: 180, rs_s: 280 },
    },
    {
      id: 'R_EP', name: 'Balão da EPIG', x: -1050, z: 680, radius: 26, lanes: 2, laneW: 3.8, limitKmh: 40,
      entries: { rep_e: 15, rep_n: 90, rep_w: 175, rep_s: 270 },
    },
  ],

  // busLane: faixa da DIREITA exclusiva de ônibus no sentido 1 (from→to), -1 (to→from) ou 0 (ambos).
  // Vias. from/to = nós; via = pontos intermediários [x,z] (cantos arredondados com `corner` m).
  // lanesF = faixas no sentido from→to; lanesB = no sentido to→from (0 = mão única).
  // median = canteiro central (m). layer: 0 chão, 1 viaduto, 2 viaduto sobre viaduto (só visual).
  roads: [
    // --- Sudoeste (QRSW 2 = casa). Ligações externas SÓ pela Av. das Jaqueiras.
    { id: 'qrsw2', name: 'QRSW 2 — Sudoeste', from: 'J_JAQ2', to: 'J_Q2a', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'qrsw2_e', name: 'QRSW 2 — Sudoeste', from: 'J_Q2a', to: 'rq_w', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 30, kind: 'local' },
    { id: 'eqrsw', name: 'EQRSW (sem saída)', from: 'rq_e', to: 'D_EQ', via: [[-1190, 206]], corner: 30, lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 30, kind: 'local' },
    { id: 'quarta_av', name: 'Quarta Avenida', from: 'rq_se', to: 'rt_nw', via: [[-1228, 300], [-1200, 370]], corner: 40,
      lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'quarta_av_s', name: 'Quarta Avenida', from: 'rt_se', to: 'rs_n', via: [[-1160, 480]], corner: 20,
      lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'terceira_w', name: 'Terceira Avenida', from: 'J_JAQ3', to: 'J_T3b', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'terceira_m', name: 'Terceira Avenida', from: 'J_T3b', to: 'J_T3a', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'terceira_e', name: 'Terceira Avenida', from: 'J_T3a', to: 'rt_w', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'segunda_w', name: 'Segunda Avenida', from: 'J_JAQSEG', to: 'J_S2a', lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'segunda_e', name: 'Segunda Avenida', from: 'J_S2a', to: 'rs_w', via: [[-1268, 532]], corner: 40, lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 40, kind: 'local' },
    { id: 'clsw', name: 'Comércio Local Sudoeste', from: 'rs_s', to: 'D_CL', via: [[-1150, 560]], corner: 12, lanesF: 1, lanesB: 1, laneW: 3.4, limitKmh: 30, kind: 'local' },
    // ruas internas curtas e tortas entre os blocos
    { id: 'rua_q1', name: 'Rua interna — QRSW 1', from: 'J_Q2a', to: 'D_Q1', via: [[-1312, 168], [-1322, 146]], corner: 12,
      lanesF: 1, lanesB: 1, laneW: 3.2, limitKmh: 30, kind: 'local' },
    { id: 'rua_q34', name: 'Rua interna — QRSW 3/4', from: 'J_Q2a', to: 'J_T3a', via: [[-1310, 250], [-1348, 292], [-1340, 342], [-1306, 386]], corner: 18,
      lanesF: 1, lanesB: 1, laneW: 3.2, limitKmh: 30, kind: 'local' },
    { id: 'rua_q56', name: 'Rua interna — QRSW 5/6', from: 'J_T3b', to: 'J_S2a', via: [[-1432, 462], [-1398, 478], [-1386, 498]], corner: 12,
      lanesF: 1, lanesB: 1, laneW: 3.2, limitKmh: 30, kind: 'local' },
    // Av. das Jaqueiras: arborizada dos dois lados (mangueiras/jaqueiras SÓLIDAS rente ao meio-fio; ver avenueTrees)
    { id: 'jaq_n', name: 'Av. das Jaqueiras', from: 'rw_s', to: 'J_JAQ2', lanesF: 2, lanesB: 2, median: 3, limitKmh: 50, kind: 'urban' },
    { id: 'jaq_m', name: 'Av. das Jaqueiras', from: 'J_JAQ2', to: 'J_JAQ3', lanesF: 2, lanesB: 2, median: 3, limitKmh: 50, kind: 'urban' },
    { id: 'jaq_s', name: 'Av. das Jaqueiras', from: 'J_JAQ3', to: 'J_JAQSEG', lanesF: 2, lanesB: 2, median: 3, limitKmh: 50, kind: 'urban' },
    { id: 'jaq_s2', name: 'Av. das Jaqueiras', from: 'J_JAQSEG', to: 'J_PRIM', lanesF: 2, lanesB: 2, median: 3, limitKmh: 50, kind: 'urban' },
    { id: 'jaq_far', name: 'Av. das Jaqueiras (Cruzeiro)', from: 'J_PRIM', to: 'JAQ_S', lanesF: 2, lanesB: 2, median: 3, limitKmh: 50, kind: 'urban' },
    { id: 'primeira_av', name: 'Primeira Avenida', from: 'J_PRIM', to: 'rep_w', via: [[-1320, 640]], corner: 80,
      lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },

    // --- EPIG (entre o Sudoeste e o Parque da Cidade)
    { id: 'epig_n', name: 'EPIG', from: 'J_EPIG', to: 'J_EPIGm', lanesF: 2, lanesB: 2, median: 4, limitKmh: 60, kind: 'arterial' },
    { id: 'epig_m', name: 'EPIG', from: 'J_EPIGm', to: 'J_EPIG3', lanesF: 2, lanesB: 2, median: 4, limitKmh: 60, kind: 'arterial' },
    { id: 'epig_s', name: 'EPIG', from: 'J_EPIG3', to: 'rep_n', lanesF: 2, lanesB: 2, median: 4, limitKmh: 60, kind: 'arterial' },
    { id: 'epig_far', name: 'EPIG (sul)', from: 'rep_s', to: 'EPIG_S', lanesF: 2, lanesB: 2, median: 4, limitKmh: 60, kind: 'arterial' },

    // --- Parque da Cidade: anel interno, sinuoso e lento (Pátio Brasil → arco para sudoeste → Balão da EPIG)
    { id: 'parque', name: 'Parque da Cidade (anel interno)', from: 'J_PB', to: 'rep_e',
      via: [[-520, 222], [-575, 300], [-600, 390], [-660, 455], [-700, 545], [-790, 600], [-880, 655], [-960, 668]], corner: 45,
      lanesF: 1, lanesB: 1, laneW: 3.6, limitKmh: 50, kind: 'local' },

    // --- Eixo Monumental: duas pistas de mão única com canteiro central gigante
    { id: 'eixo_s1_a', name: 'Eixo Monumental (Via S1)', from: 'rw_es', to: 'J_EPIG', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2 },
    { id: 'eixo_s1_b', name: 'Eixo Monumental (Via S1)', from: 'J_EPIG', to: 'J_W3N', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2, busLane: 1 },
    { id: 'eixo_s1_c0', name: 'Eixo Monumental (Via S1)', from: 'J_W3N', to: 'D_EX', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2, busLane: 1 },
    { id: 'eixo_s1_c', name: 'Eixo Monumental (Via S1)', from: 'D_EX', to: 'X_S2', lanesF: 3, lanesB: 0, limitKmh: 60, kind: 'eixo', layer: 2, busLane: 1 },
    { id: 'eixo_s1_d', name: 'Eixo Monumental (Esplanada)', from: 'X_S2', to: 're_es', lanesF: 3, lanesB: 0, limitKmh: 60, kind: 'eixo', layer: 2 },
    { id: 'eixo_n1_e', name: 'Eixo Monumental (Via N1)', from: 're_en', to: 'X_N1', lanesF: 3, lanesB: 0, limitKmh: 60, kind: 'eixo', layer: 2 },
    { id: 'eixo_n1', name: 'Eixo Monumental (Via N1)', from: 'X_N1', to: 'rw_en', lanesF: 3, lanesB: 0, limitKmh: 70, kind: 'eixo', layer: 2 },
    // Trevo Eixo × Eixão (Rodoviária): alças dirigíveis
    { id: 'alca_eixao', name: 'Alça Eixo → Eixão Sul', from: 'D_EX', to: 'M_EX', via: [[-74, 52], [-34, 86], [-10, 132]], corner: 26,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 40, kind: 'ramp', layer: 1 },
    { id: 'alca_rodo', name: 'Alça Via S2 → Eixo (Rodoviária)', from: 'S2_J', to: 'X_N1', via: [[150, 80], [172, 30], [174, -14]], corner: 22,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 50, kind: 'ramp', layer: 1 },
    { id: 'rw_north', name: 'EPIA (acesso norte)', from: 'rw_n', to: 'RW_N_E', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'arterial' },
    { id: 'rw_west', name: 'Eixo Monumental (Cruzeiro)', from: 'rw_w', to: 'RW_W_E', lanesF: 2, lanesB: 2, median: 6, limitKmh: 60, kind: 'arterial' },
    { id: 're_north', name: 'Via N2', from: 're_n', to: 'RE_N_E', lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },

    // --- Via S2 (Rodoviária → SAUS → SAFS)
    { id: 's2_alca', name: 'Via S2 (descida da Rodoviária)', from: 'X_S2', to: 'S2_J', via: [[82, 80]], corner: 26, lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban', layer: 1 },
    { id: 's2_a', name: 'Via S2', from: 'S2_J', to: 'J_S2_L2', via: [[170, 150]], corner: 45, lanesF: 2, lanesB: 2, median: 2, limitKmh: 60, kind: 'urban' },
    { id: 's2_b', name: 'Via S2 (SAUS)', from: 'J_S2_L2', to: 'J_S2E', lanesF: 2, lanesB: 2, median: 2, limitKmh: 60, kind: 'urban' },
    { id: 's2_c', name: 'Via S2 (SAFS)', from: 'J_S2E', to: 'J_SAFS', lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },
    { id: 'safs_n', name: 'Via S2 (Praça dos Três Poderes)', from: 're_s', to: 'J_S2E', lanesF: 2, lanesB: 2, median: 2, limitKmh: 50, kind: 'urban' },
    { id: 'safs_east', name: 'Via L4 Sul', from: 'J_SAFS', to: 'E_SAFS', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },

    // --- Via S3 (SAFS → SAUS → SCS → Pátio Brasil), trecho urbano com semáforos
    { id: 's3_safs', name: 'Via S3 (SAFS — STJ)', from: 'J_SAFS', to: 'J_L2b', lanesF: 2, lanesB: 2, limitKmh: 40, kind: 'urban' },
    { id: 's3_saus', name: 'Via S3 (SAUS)', from: 'J_L2b', to: 'J_S3a', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 's3_mid_e', name: 'Via S3', from: 'J_S3a', to: 'M_S3', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 's3_mid', name: 'Via S3', from: 'M_S3', to: 'J_S3b', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban', layer: 0, busLane: 0 },
    { id: 's3_scs', name: 'Via S3 (Setor Comercial Sul)', from: 'J_S3b', to: 'J_PB', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban', busLane: 0 },

    // --- W3 Sul
    { id: 'w3_n', name: 'W3 Sul', from: 'J_W3N', to: 'J_PB', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'w3_m', name: 'W3 Sul', from: 'J_PB', to: 'J_W3b', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'w3_s', name: 'W3 Sul', from: 'J_W3b', to: 'W3_S', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },

    // --- Entrequadra + tesourinha + Eixão
    { id: 'ent_w', name: 'Entrequadra Sul', from: 'J_W3b', to: 'T_D', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban', layer: 0 },
    { id: 'ent_e', name: 'Entrequadra Sul', from: 'T_D', to: 'J_L2a', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 'ent_far', name: 'Entrequadra Sul', from: 'J_L2a', to: 'E_ENT', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
    { id: 'tes', name: 'Tesourinha', from: 'T_D', to: 'T_M', via: [[78, 708], [95, 735], [92, 768], [68, 790], [38, 788], [20, 768]], corner: 18,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 30, kind: 'ramp', layer: 0 },
    { id: 'eixao_n', name: 'Eixão Sul', from: 'EX_N', to: 'M_EX', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'eixao_n2', name: 'Eixão Sul', from: 'M_EX', to: 'X_RAMP', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'eixao_m', name: 'Eixão Sul', from: 'X_RAMP', to: 'T_M', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },
    { id: 'eixao_ramp', name: 'Alça Eixão → Via S3', from: 'X_RAMP', to: 'M_S3', via: [[14, 305], [42, 274], [72, 258]], corner: 25,
      lanesF: 1, lanesB: 0, laneW: 4.5, limitKmh: 40, kind: 'ramp', layer: 1 },
    { id: 'eixao_s', name: 'Eixão Sul', from: 'T_M', to: 'EX_S', lanesF: 3, lanesB: 3, median: 6, limitKmh: 80, kind: 'eixao', layer: 1 },

    // --- L2 Sul
    { id: 'l2_n', name: 'L2 Sul', from: 'J_S2_L2', to: 'J_L2b', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2_b', name: 'L2 Sul', from: 'J_L2b', to: 'J_L2m', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2_m', name: 'L2 Sul', from: 'J_L2m', to: 'J_L2a', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2_s', name: 'L2 Sul', from: 'J_L2a', to: 'L2_S', lanesF: 2, lanesB: 2, median: 3, limitKmh: 60, kind: 'urban' },
    { id: 'l2m_east', name: 'Via L3 Sul', from: 'J_L2m', to: 'E_L2m', lanesF: 2, lanesB: 2, limitKmh: 50, kind: 'urban' },
  ],

  // Cruzamentos em desnível: 'over' passa por cima de 'under' (sem nó; tráfego não interage).
  gradeSeparations: [
    { over: 'eixo_s1_c', under: 'eixao_n' },
    { over: 'eixo_n1', under: 'eixao_n' },
    { over: 'eixao_n2', under: 's3_mid' },
    { over: 'eixo_s1_d', under: 'alca_rodo' },
    { over: 'eixao_m', under: 'ent_w' },
  ],

  // Semáforos (nós). Fases agrupadas por eixo de aproximação automaticamente.
  signals: ['J_W3N', 'J_PB', 'J_W3b', 'J_S3b', 'J_S3a', 'J_L2b', 'J_S2_L2', 'J_L2m', 'J_L2a', 'J_SAFS', 'J_JAQ2', 'J_PRIM'],

  // Faixas de pedestre no meio de quadra (as dos semáforos são automáticas).
  crosswalks: [
    { seg: 'qrsw2', at: [-1440, 200] },
    { seg: 'qrsw2_e', at: [-1290, 200] },
    { seg: 'jaq_m', at: [-1500, 330] },
    { seg: 'eixo_s1_c0', at: [-170, 40] },
    { seg: 'eixo_n1', at: [-110, -40] },
    { seg: 'eixo_s1_d', at: [470, 40] },
    { seg: 'eixo_n1_e', at: [470, -40] },
    { seg: 's3_safs', at: [600, 260] },
    { seg: 's3_scs', at: [-320, 212] },
    { seg: 's2_b', at: [650, 150] },
    { seg: 'parque', at: [-600, 390] },
    { seg: 'w3_m', at: [-430, 450] },
    { seg: 'l2_m', at: [500, 600] },
    { seg: 'ent_e', at: [260, 700] },
    { seg: 'primeira_av', at: [-1200, 662] },
  ],

  // Pontos de ônibus (abrigo na calçada, à direita do sentido `dir`); ônibus da IA param em stop.s da faixa.
  busStops: [
    { seg: 'eixo_s1_b', at: [-820, 40], dir: 1, name: 'Eixo — Memorial JK/SIG' },
    { seg: 'eixo_s1_b', at: [-560, 40], dir: 1, name: 'Eixo — Torre de TV' },
    { seg: 'eixo_s1_c0', at: [-250, 40], dir: 1, name: 'Eixo — Setor Hoteleiro' },
    { seg: 's3_scs', at: [-260, 222], dir: 1, name: 'SCS — Pátio Brasil' },
    { seg: 's3_scs', at: [-360, 205], dir: -1, name: 'SCS — Quadra 2' },
    { seg: 's3_mid', at: [-110, 241], dir: 1, name: 'Via S3 — Eixão' },
    { seg: 's3_mid', at: [40, 250], dir: -1, name: 'Via S3 — SAUS' },
    { seg: 'w3_m', at: [-430, 380], dir: 0, name: 'W3 Sul 502/503' },
    { seg: 'jaq_m', at: [-1500, 300], dir: 0, name: 'Jaqueiras — QRSW' },
  ],

  // Fiscalização: posições CANDIDATAS (quem decide quais ativar e multa é rules.js). dir: 1, -1 ou 0 (ambos).
  // type: 'speed' (pardal) | 'redLight' (avanço de sinal; nos semáforos também há candidatos automáticos) | 'busLane'
  radars: [
    { seg: 'eixo_s1_a', at: [-1200, 40], dir: 1 },
    { seg: 'eixo_s1_b', at: [-700, 40], dir: 1 },
    { seg: 'eixo_s1_c0', at: [-200, 40], dir: 1 },
    { seg: 'eixo_n1', at: [-700, -40], dir: 1 },
    { seg: 'eixo_n1_e', at: [400, -40], dir: 1 },
    { seg: 'epig_m', at: [-1020, 320], dir: 0 },
    { seg: 'eixao_s', at: [0, 950], dir: 0 },
    { seg: 'eixao_m', at: [0, 520], dir: 0 },
    { seg: 's2_b', at: [350, 150], dir: 0 },
    { seg: 's3_saus', at: [350, 260], dir: 0 },
    { seg: 'w3_m', at: [-430, 560], dir: 0 },
    { seg: 'jaq_n', at: [-1500, 120], dir: 0 },
    { seg: 'eixo_s1_b', at: [-620, 40], dir: 1, type: 'busLane' },
    { seg: 's3_scs', at: [-300, 214], dir: 0, type: 'busLane' },
    { seg: 's3_mid', at: [-60, 244], dir: 0, type: 'busLane' },
  ],

  // ESCONDERIJOS de agente de trânsito (fora da pista, atrás de algo). O agente "enxerga" o trecho
  // do segmento `seg` em volta de `at` (±range m) no sentido `dir` (0 = ambos). side: 1 = à direita do
  // sentido from→to do segmento, -1 = à esquerda. cover: o que o esconde. Sorteio/ocupação/multa: rules.js.
  agentHideouts: [
    { seg: 'eixo_s1_b', at: [-880, 40], side: 1, dir: 1, range: 70, cover: 'arvore' },
    { seg: 'eixo_s1_c', at: [-40, 40], side: -1, dir: 1, range: 60, cover: 'viaduto' },
    { seg: 'eixo_n1', at: [-500, -40], side: 1, dir: 1, range: 70, cover: 'arvore' },
    { seg: 'eixo_s1_d', at: [600, 40], side: 1, dir: 1, range: 70, cover: 'placa' },
    { seg: 's3_scs', at: [-280, 218], side: 1, dir: 0, range: 50, cover: 'ponto' },
    { seg: 's3_mid', at: [-150, 238], side: -1, dir: 0, range: 50, cover: 'viaduto' },
    { seg: 's3_saus', at: [300, 260], side: 1, dir: 0, range: 60, cover: 'arvore' },
    { seg: 's2_b', at: [420, 150], side: -1, dir: 0, range: 70, cover: 'arvore' },
    { seg: 'w3_m', at: [-430, 600], side: 1, dir: 0, range: 70, cover: 'ponto' },
    { seg: 'jaq_m', at: [-1500, 380], side: -1, dir: 0, range: 60, cover: 'arvore' },
    { seg: 'epig_m', at: [-1020, 300], side: 1, dir: 0, range: 80, cover: 'placa' },
    { seg: 'parque', at: [-700, 545], side: 1, dir: 0, range: 50, cover: 'arvore' },
    { seg: 'eixao_m', at: [0, 600], side: 1, dir: 0, range: 90, cover: 'arvore' },
    { seg: 'l2_m', at: [500, 560], side: -1, dir: 0, range: 70, cover: 'arvore' },
  ],

  // Arborização "de avenida": árvores SÓLIDAS (colisores) rente ao meio-fio, dos dois lados, a cada `step` m.
  // A malha gera net.avenueTreeSlots (onde o cenário planta) e, para os trechos com `fruit`, net.fruitSpots
  // (candidatos a fruta no asfalto: 'manga' sob mangueira, 'jaca' sob jaqueira). Sorteio/efeito: traffic/rules.
  avenueTrees: [
    { segs: ['jaq_n', 'jaq_m', 'jaq_s', 'jaq_s2', 'jaq_far'], step: 13, offset: 1.6, margin: 14,
      kinds: ['mangueira', 'jaqueira', 'mangueira'], fruit: true },
  ],

  // Corredores das 2 rotas principais (waypoints em ordem; use net.planRouteVia). O GPS livre (planRoute) dá a
  // mais rápida, que é a do Eixo nos dois sentidos; a do Parque é a alternativa lenta.
  routeCorridors: {
    eixo: {
      label: 'Eixo Monumental',
      'casa-stj': ['jaq_n', 'eixo_s1_b', 'eixo_s1_c', 's2_alca', 's2_a'],
      'stj-casa': ['s2_a', 'alca_rodo', 'eixo_n1', 'jaq_n'],
    },
    parque: {
      label: 'Via S3 + Parque da Cidade',
      'casa-stj': ['jaq_s2', 'primeira_av', 'parque', 's3_scs', 's3_mid'],
      'stj-casa': ['s3_mid', 's3_scs', 'parque', 'primeira_av', 'jaq_s2', 'jaq_m'],
    },
  },

  // Zonas de chegada (círculos no chão) e poses de largada (snap para a faixa da direita).
  zones: {
    casa: { x: -1390, z: 200, r: 20, label: 'QRSW 2 — Sudoeste' },
    stj: { x: 650, z: 262, r: 22, label: 'STJ (SAFS)' },
  },
  starts: {
    casa: { x: -1360, z: 198, heading: -90 * D2R }, // rumo oeste (sai para a Av. das Jaqueiras)
    stj: { x: 720, z: 258, heading: -90 * D2R },    // rumo oeste (Via S3; ou L2 ↑ → Via S2 → Praça dos Três Poderes)
  },
};
