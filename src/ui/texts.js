// Todos os textos do jogo (pt-BR, humor leve). Separado para facilitar ajustes de copy.

export const MODE_UI = {
  davi: {
    name: 'Sendo o Davi',
    car: 'Renault Kwid branco',
    tag: 'Você dirige. A culpa é dos outros.',
    desc: 'Você É o Davi, ao volante do Kwid branco. Ansioso, estressado, agressivo, 4 batidas no ano — e a culpa, claro, é sempre dos outros. Vamos pra 5?',
    level: 2, levelName: 'tenso',
  },
  carona: {
    name: 'Dando carona pro Davi',
    car: 'C4 Cactus THP cinza',
    tag: 'Você é a paz. Ele é o caos.',
    desc: 'Você, dono calmo do Cactus THP, dirige. O Davi vai de passageiro palpitando: "cuidado!", "passa!", "tá vermelho!". Duas duplas de barras: as suas ficam tranquilas. As dele, não.',
    level: 1, levelName: 'tranquilo',
  },
  perigo: {
    name: 'PERIGO',
    car: 'C4 Cactus THP cinza',
    tag: 'Você emprestou o carro. Por quê?',
    desc: 'Você emprestou o Cactus pro Davi. Ele dirige; você vai do lado, com a mão no teto, gritando "ai, meu carrinho". Turbo + ansiedade = a sua vida passando diante dos olhos.',
    level: 3, levelName: 'perigo',
  },
};

export const ROUTE_UI = {
  'casa-stj': { name: 'Casa → STJ', when: 'manhã', sub: 'QRSW 2, Sudoeste → STJ. Sol na cara e reunião às 9h.' },
  'stj-casa': { name: 'STJ → Casa', when: 'fim de tarde', sub: 'Saindo do trabalho. Rush, pardal e muita pressa de chegar em casa.' },
};

export const HOWTO_CONTROLS = [
  ['W  /  ↑', 'Acelerar'],
  ['S  /  ↓', 'Frear e dar ré'],
  ['A D  /  ← →', 'Direção'],
  ['Espaço', 'Freio de mão'],
  ['H', 'Buzinar'],
  ['R', 'Respirar fundo'],
  ['X', 'Xingar (sem palavrão pesado)'],
  ['P  /  Esc', 'Pausar'],
];

export const HOWTO_RULES = [
  ['Objetivo', 'Chegar ao destino sem bater, sem multa e no menor tempo. O Davi tem 4 batidas no ano. Não vamos para a 5ª.'],
  ['Barras de humor', 'Ansiedade e estresse nunca zeram: existe um piso (a parte listrada). Pior: perto do máximo a barra treme e o volante começa a ficar traiçoeiro.'],
  ['Zona de equilíbrio', 'A faixa marcada nas barras do motorista. Ficar dentro dela dá bônus e aumenta o multiplicador de pontos.'],
  ['Respirar e xingar', 'R e X ajudam a baixar a pressão, mas têm tempo de recarga. Buzinar também desabafa (e irrita os outros).'],
  ['Multas', 'Pardal (excesso de velocidade), sinal vermelho, faixa exclusiva de ônibus, faixa de pedestres... O valor e os pontos na CNH aparecem no aviso.'],
  ['Batida', 'Impacto forte encerra a viagem na hora. Aí vem o boletim de ocorrência — com a versão do Davi.'],
];

export const GRADE_TITLES = {
  A: 'Piloto de Esplanada',
  B: 'Quase Zen',
  C: 'Cidadão Médio do DF',
  D: 'Candidato à Reciclagem',
  E: 'Cliente VIP do Detran',
  F: 'A Culpa Foi Sua, Dessa Vez',
};
export const GRADE_QUIPS = {
  A: 'Sem multa, sem susto. O Davi estranhou e pediu pra checar o retrovisor.',
  B: 'Chegou inteiro. A ansiedade, nem tanto.',
  C: 'Nada de mais. Só um pouco de buzina e uma ou outra palavra feia.',
  D: 'Chegou, mas o pardal já tem o seu rosto no mural.',
  E: 'A CNH está tossindo. O despachante mandou lembranças.',
  F: 'Chegou por milagre. O carro agradece por ter sobrevivido.',
};

export const REASON_UI = {
  chegou: { head: 'CHEGOU!', sub: 'Sem bater. Isso é novidade.' },
  bateu: { head: 'SINISTRO', sub: '' },
  desistiu: { head: 'DESISTIU', sub: 'O Davi estacionou em fila dupla, abriu o app de carro e foi de Uber.' },
  tomouOCarro: { head: 'O DONO TOMOU O CARRO', sub: '"Chega, Davi. Passa a chave. AGORA."' },
};

// ---- batida --------------------------------------------------------------
export const CRASH_WITH = {
  building: 'um prédio (que estava no meio do caminho)',
  tree: 'uma árvore (ipê, ainda por cima)',
  pole: 'um poste que apareceu do nada',
  guardrail: 'um guard-rail',
  landmark: 'um monumento tombado pelo patrimônio',
  busStop: 'um ponto de ônibus',
  wall: 'um muro (sem sinalização)',
  water: 'o Lago Paranoá',
  vehicle: 'outro carro (que freou do nada)',
  pedestrian: 'um pedestre (fora da faixa, claro)',
};
export const CRASH_WITH_DEFAULT = 'um obstáculo não identificado';

export const CRASH_EXCUSE = {
  building: ['O prédio entrou na minha frente. Eu estava na minha faixa.', 'Esse prédio não estava aqui ontem. Absurdo.'],
  tree: ['Árvore sem seta, sem pisca, sem nada. Quem planta uma coisa dessas?', 'Ela mudou de lugar. Eu vi.'],
  pole: ['Poste mal posicionado. Já mandei mensagem pra Administração.', 'Ele se jogou.'],
  guardrail: ['O guard-rail estava muito perto da pista. Pista estreita, falha do governo.'],
  landmark: ['Quem põe um monumento ali? Era obrigação do Oscar Niemeyer avisar.'],
  busStop: ['O ponto de ônibus estava despreparado pra minha chegada.'],
  wall: ['Muro sem luz de freio. Criminoso.'],
  water: ['O lago estava na altura errada.'],
  vehicle: ['O cara freou do nada. Eu estava a quatro metros, no máximo. Segui o manual.', 'Ele me fechou! Eu só estava de olho no GPS, no celular e na vida.'],
  pedestrian: ['Ele atravessou olhando pro celular! Eu só buzinei com carinho.'],
  _: ['A culpa foi do outro. Não sei quem, mas foi.', 'Eu estava calmo. CALMO! Quem bateu foi o asfalto.'],
};

export const REPAIR_ITEMS = [
  ['Para-choque dianteiro', 0.24], ['Farol esquerdo (o bonito)', 0.14], ['Capô e vincos de dignidade', 0.2],
  ['Mão de obra', 0.16], ['Pintura "cinza Cactus" original', 0.12], ['Danos morais ao proprietário', 0.14],
];

export const BO_WITNESSES = ['Nenhuma. O poste estava distraído.', 'Um flanelinha (cobrou pela vaga do guincho).', 'Uma capivara, que não quis se envolver.', 'Um senhor de bermuda, que filmou tudo.'];

// ---- toasts e reações ----------------------------------------------------
export const TOASTS = {
  overtaken: [['Ultrapassado!', 'Ah, claro. Vai, passa. Passa, vai.'], ['Ultrapassado!', 'De Gol 1.0. Vai ser calmo assim…']],
  cutOff: [['Fechado!', 'Isso foi proposital. Eu vi a cara.'], ['Fechado!', 'Setinha, hein? Existe, é de graça.']],
  honkedAt: [['Buzinaram pra você', 'Que falta de educação!'], ['Buzinaram pra você', 'Eu estava ESQUENTANDO o motor.']],
  nearMiss: [['Raspou!', 'Passou a um dedo. Mas a culpa é dele.']],
  peakAnx: 'ANSIEDADE NO TALO!',
  peakStress: 'ESTRESSE NO TALO!',
};
export const PEAK_SUB = {
  davi: 'Respira, Davi. R.',
  dono: 'Pelo amor do Cactus…',
};

export const FINE_BY = { radar: 'pego pelo pardal', agent: 'pego pelo agente' };
export const FINE_FALLBACK_LABEL = { speed: 'Excesso de velocidade', redLight: 'Avanço de sinal vermelho', busLane: 'Faixa exclusiva de ônibus', crosswalk: 'Não parou na faixa de pedestres' };

// ---- botões de ação ------------------------------------------------------
export const ACTIONS = [
  { key: 'horn', keycap: 'H', label: 'Buzinar' },
  { key: 'breathe', keycap: 'R', label: 'Respirar' },
  { key: 'curse', keycap: 'X', label: 'Xingar' },
];

export const PAUSE_QUIPS = ['Respira. O trânsito espera.', 'Pausa pra um café (e um calmante).', 'O Davi aproveita pra conferir o retrovisor. Pela terceira vez.'];
