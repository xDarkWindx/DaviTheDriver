// Todos os textos do jogo (pt-BR, humor leve). Separado para facilitar ajustes de copy.

export const MODE_UI = {
  davi: {
    name: 'Sendo o Davi',
    car: 'Renault Kwid branco',
    tag: 'Você é o motorista.',
    desc: 'Você é o Davi, ao volante do Kwid branco. Trânsito de Brasília, pardal no caminho e duas barras para equilibrar: ansiedade e estresse.',
    level: 2, levelName: 'tenso',
  },
  carona: {
    name: 'Dando carona pro Davi',
    car: 'C4 Cactus THP cinza',
    tag: 'Você dirige. Ele comenta.',
    desc: 'Você dirige o seu Cactus THP cinza e o Davi vai de passageiro, dando palpite em cada cruzamento. Duas duplas de barras: a sua e a dele.',
    level: 1, levelName: 'tranquilo',
  },
  perigo: {
    name: 'PERIGO',
    car: 'C4 Cactus THP cinza',
    tag: 'Você emprestou o carro.',
    desc: 'Você emprestou o Cactus pro Davi. Ele dirige e você vai do lado, de olho no painel e na pintura. Turbo 1.6, trânsito cheio e as barras do passageiro subindo.',
    level: 3, levelName: 'perigo',
  },
};

export const ROUTE_UI = {
  'casa-stj': { name: 'Casa → STJ', when: 'manhã', sub: 'QRSW 2, Sudoeste → STJ, de manhã.' },
  'stj-casa': { name: 'STJ → Casa', when: 'fim de tarde', sub: 'Saindo do STJ no fim da tarde, de volta ao Sudoeste.' },
};

export const HOWTO_CONTROLS = [
  ['W  /  ↑', 'Acelerar'],
  ['S  /  ↓', 'Frear e dar ré'],
  ['A D  /  ← →', 'Direção'],
  ['Espaço', 'Freio de mão'],
  ['H', 'Buzinar'],
  ['R', 'Respirar fundo'],
  ['X', 'Xingar'],
  ['F', 'Piscar o farol (para o lento da frente)'],
  ['P  /  Esc', 'Pausar'],
];

export const HOWTO_RULES = [
  ['Objetivo', 'Chegar ao destino sem bater, sem multa e no menor tempo.'],
  ['Barras de humor', 'Ansiedade e estresse nunca zeram: existe um piso (a parte listrada). Pior: perto do máximo a barra treme e o volante começa a ficar traiçoeiro.'],
  ['Zona de equilíbrio', 'A faixa marcada nas barras do motorista. Ficar dentro dela dá bônus e aumenta o multiplicador de pontos.'],
  ['Respirar, xingar, buzinar, piscar', 'R e X ajudam a baixar a pressão, mas têm tempo de recarga. Buzinar (H) também desabafa (e irrita os outros); piscar o farol (F) pede passagem ao lento da frente — às vezes ele dá, às vezes freia de birra.'],
  ['Congestionamento', 'Às vezes a rota tem trânsito parado (marcado em vermelho no minimapa). Dá para desviar por outro caminho; a faixa de ônibus vazia do lado é tentadora — e multa se alguém vir.'],
  ['Multas', 'Pardal (excesso de velocidade), sinal vermelho, faixa exclusiva de ônibus, faixa de pedestres... O valor e os pontos na CNH aparecem no aviso.'],
  ['Batida', 'Impacto forte encerra a viagem na hora. Aí vem o boletim de ocorrência.'],
];

export const GRADE_TITLES = {
  A: 'Piloto de Esplanada',
  B: 'Quase Zen',
  C: 'Cidadão Médio do DF',
  D: 'Candidato à Reciclagem',
  E: 'Cliente VIP do Detran',
  F: 'Chegou. Milagre do DF',
};
export const GRADE_QUIPS = {
  A: 'Sem multa, sem susto, sem pressa. Quase suspeito.',
  B: 'Chegou inteiro e com a CNH intacta.',
  C: 'Nada de mais. Uma buzinada aqui, uma multa ali.',
  D: 'Chegou, mas o pardal já tem o seu rosto no mural.',
  E: 'A CNH está tossindo. O despachante mandou lembranças.',
  F: 'Chegou por milagre. O carro agradece por ter sobrevivido.',
};

export const REASON_UI = {
  chegou: { head: 'CHEGOU!', sub: 'Sem bater. Isso é novidade.' },
  bateu: { head: 'SINISTRO', sub: '' },
  desistiu: { head: 'DESISTIU', sub: 'O Davi estacionou em fila dupla, abriu o app de carro e foi de Uber.' },
  tomouOCarro: { head: 'O LEANDRO TOMOU O CARRO', sub: '"Chega, Davi. Passa a chave. AGORA."' },
};

// ---- batida --------------------------------------------------------------
export const CRASH_WITH = {
  building: 'um prédio (que estava no meio do caminho)',
  tree: 'uma árvore (ipê, ainda por cima)',
  pole: 'um poste',
  car: 'um carro estacionado',
  guardrail: 'um guard-rail',
  landmark: 'um monumento tombado pelo patrimônio',
  busStop: 'um ponto de ônibus',
  wall: 'um muro (sem sinalização)',
  water: 'o Lago Paranoá',
  vehicle: 'outro carro',
  bus: 'um ônibus',
  pedestrian: 'um pedestre (que levou um susto e está bem)',
};
export const CRASH_WITH_DEFAULT = 'um obstáculo não identificado';

// Causas apuradas: absurdas e impessoais (sem apontar responsável).
export const CRASH_EXCUSE = {
  building: ['O prédio estava exatamente onde a planta mandava.', 'Lei da física: dois corpos não ocupam o mesmo lugar.'],
  tree: ['Uma árvore de ipê, em plena floração. Houve distração estética.', 'Cerrado: a árvore já estava lá antes da rua.'],
  pole: ['O poste apareceu.', 'Poste em posição estratégica. Sem comentários.'],
  guardrail: ['O guard-rail cumpriu a função dele. Com louvor.'],
  landmark: ['Patrimônio tombado, carro destombado.'],
  busStop: ['O ponto de ônibus estava no ponto.'],
  wall: ['Muro. Um clássico.'],
  water: ['O lago estava no nível de sempre.'],
  vehicle: ['Dois carros, um espaço. A matemática não fechou.', 'Uma manga caiu e mudou tudo.'],
  pedestrian: ['Pedestre na faixa. A faixa é dele.'],
  car: ['Carro estacionado, exatamente onde estava estacionado.'],
  _: ['Uma manga caiu do céu. Ninguém viu de onde.', 'A física, como sempre, venceu.'],
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
  nearMiss: [['Raspou!', 'Passou a um dedo.']],
  pedScare: [['Quase!', 'O pedestre reclamou: "Olha a faixa!"'], ['Quase!', '"Ô, motorista! Tá vendo não?"']],
  peakAnx: 'ANSIEDADE NO TALO!',
  peakStress: 'ESTRESSE NO TALO!',
};
// Versões com tempero de trânsito (só com o interruptor "Palavrões" ligado). Sem ofensa a grupos.
export const TOASTS_RUDE = {
  overtaken: [['Ultrapassado!', 'Vai, passa, fominha! Passa!'], ['Ultrapassado!', 'Que merda, até esse me passou.']],
  cutOff: [['Fechado!', 'Pô, cara, setinha custa o quê?!'], ['Fechado!', 'Porra, olha o espelho!']],
  honkedAt: [['Buzinaram pra você', 'Buzina o quê, rapaz? Vai catar coquinho.']],
  nearMiss: [['Raspou!', 'Caralho, passou a um dedo!']],
  pedScare: [['Quase!', 'O pedestre: "Tá cego, porra?"'], ['Quase!', 'O pedestre: "Ô, desgraça, a faixa!"']],
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
  { key: 'flash', keycap: 'F', label: 'Farol' },
];

export const PAUSE_QUIPS = ['Respira. O trânsito espera.', 'Pausa pra um café.', 'Tá tudo parado mesmo. Igual a Via S3 às 18h.'];
