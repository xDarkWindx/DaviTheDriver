// BANCO DE FALAS (pt-BR) + "Speaker" (sorteio sem repetição e limite de frequência). Puro (sem DOM/three).
// Tom: o jogo MOSTRA, não ROTULA — reações à SITUAÇÃO de trânsito; ninguém se descreve, ninguém aponta responsável
// por batida, nada contra grupos, nada de ameaça. Cada fala é 'texto' (igual nas duas variantes) ou
// ['com palavrão', 'versão leve'] — state.settings.profanity === false usa a leve.
//
// Banco: { who, role, tone, cd (s entre falas deste banco), prio (1 = evento, ignora parte do intervalo),
//          gestures: [...] (gestos possíveis), lines: [...] }
// Gestos (EV.SAY.gesture): 'bracoPraFora' | 'buzinaImaginaria' | 'maosNaCabeca' | 'apontando' | 'joinha' | 'banana'

const D = 'davi', O = 'dono';

export const BANKS = {
  // =============================== DAVI AO VOLANTE ===============================
  slow0: { who: D, role: 'driver', tone: 'anx', cd: 2.5, gestures: ['apontando'], lines: [
    'Vai… vai… vai…', 'Hmmm.', 'Ô, amigo…', 'Bora, bora.', 'Tá passeando?', 'Que isso, gente.', 'Anda, por favor.',
    'Tá de boa aí na frente, né?', 'Acelerador é o da direita…', 'Isso é velocidade de cruzeiro?',
  ] },
  slow1: { who: D, role: 'driver', tone: 'anx', cd: 2.5, gestures: ['bracoPraFora', 'apontando'], lines: [
    'ANDA, TIO!', 'A ESQUERDA É PRA PASSAR!', 'Encosta pra direita, amigo!', 'Dá passagem, pô!', 'Pisa, pisa, PISA!',
    ['Anda, porra!', 'Anda, poxa!'], 'Libera a esquerda!', 'Isso aqui é via, não é estacionamento!', 'Vamo, vamo, VAMO!',
    'Sai da frente, por favor, SAI!',
  ] },
  slow2: { who: D, role: 'driver', tone: 'stress', cd: 2.5, gestures: ['bracoPraFora', 'buzinaImaginaria', 'apontando'], lines: [
    ['ANDA, CARALHO!', 'ANDA, CARAMBA!'], ['Puta que pariu, que lerdeza!', 'Nossa senhora, que lerdeza!'],
    ['Vai tomar no… ANDA!', 'Vai pentear macaco… ANDA!'], ['Porra, a esquerda é pra PASSAR!', 'Poxa vida, a esquerda é pra PASSAR!'],
    ['Filho da… ANDA!', 'Filho de uma… ANDA!'], ['Caralho, quarenta numa via de oitenta!', 'Caramba, quarenta numa via de oitenta!'],
    'TÁ DE BRINCADEIRA?!', ['Que merda é essa?!', 'Que palhaçada é essa?!'],
  ] },
  slow3: { who: D, role: 'driver', tone: 'stress', cd: 2.2, gestures: ['bracoPraFora', 'buzinaImaginaria', 'banana'], lines: [
    ['A ESQUERDA É PRA PASSAR, CARALHO!', 'A ESQUERDA É PRA PASSAR, MEU DEUS!'],
    ['ANDA, PORRA! ANDA! ANDAAA!', 'ANDA! ANDA! ANDAAA!'], ['PUTA QUE PARIU, TIO! SAI DA FRENTE!', 'PELO AMOR DE DEUS, TIO! SAI DA FRENTE!'],
    'VINTE MINUTOS ATRÁS DESSE CARRO!', ['VAI TOMAR NO… PISCA! PISCA E SAI!', 'VAI PLANTAR BATATA! PISCA E SAI!'],
    'AAAAAAAAAAH!',
  ] },
  jam: { who: D, role: 'driver', tone: 'anx', cd: 4, gestures: ['apontando', 'maosNaCabeca'], lines: [
    'Não anda!', 'De onde saiu tanto carro?', 'Muda pra esquerda… não, a direita tá andando!', 'Vai, vai, um metro, vai…',
    'O que tem lá na frente?', 'Bora, gente, é só andar!', 'Essa fila não acaba nunca.', 'Olha a faixa da esquerda andando…',
  ] },
  jam2: { who: D, role: 'driver', tone: 'stress', cd: 4, gestures: ['bracoPraFora', 'maosNaCabeca', 'buzinaImaginaria'], lines: [
    ['NÃO ANDA, PORRA!', 'NÃO ANDA, MEU DEUS!'], 'Cinco minutos parado aqui!', ['Puta que pariu, que trânsito!', 'Nossa senhora, que trânsito!'],
    'Eu devia ter ido pelo outro caminho!', 'Faixa da direita, faixa da direita, AGORA!', 'Alguém liga pro Detran!',
  ] },
  freeSlow: { filler: 1, who: D, role: 'driver', tone: 'anx', cd: 6, lines: [
    'Pista livre e a gente aqui…', 'Olha esse vazio na frente. OLHA.', 'Dava pra estar no STJ já.', 'Bora, que tá livre!',
    ['Tá livre, porra, vai!', 'Tá livre, gente, vai!'], 'Nem um carro na frente. Nenhum.',
  ] },
  red: { filler: 1, who: D, role: 'driver', tone: 'anx', cd: 7, gestures: ['buzinaImaginaria'], lines: [
    'Abre… abre… abre…', ['Esse sinal tá de sacanagem.', 'Esse sinal tá de brincadeira.'], 'Três minutos de vermelho. Contei.',
    ['Que sinal demorado do caralho.', 'Que sinal demorado, meu Deus.'], 'Verde, verde, verde, verde…', 'Quem programou esse sinal?',
  ] },
  crosswalk: { who: D, role: 'driver', tone: 'stress', cd: 6, gestures: ['apontando'], lines: [
    'Pode ir… sem pressa, né.', 'Atravessa, campeão, atravessa.', 'Olhando o celular na faixa…', 'Vai, vai, que eu espero. Espero, sim.',
    'Passinho de formiga, hein.',
  ] },
  overtaken: { who: D, role: 'driver', tone: 'stress', cd: 3, prio: 1, gestures: ['banana', 'bracoPraFora'], lines: [
    'Ah, vai, passa. Passa!', ['Olha esse filho da… passando!', 'Olha esse sujeito passando!'], 'Vai com Deus. E devagar.',
    ['Porra, por cima da faixa!', 'Poxa, por cima da faixa!'], 'Tá com pressa? Eu também!', 'E a seta, campeão?',
    ['Vai tomar no… vai na frente, vai.', 'Vai catar coquinho… vai na frente, vai.'],
  ] },
  overtakenMoto: { who: D, role: 'driver', tone: 'stress', cd: 3, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'O retrovisor! Quase leva o retrovisor!', ['Caralho, motoboy no corredor!', 'Caramba, motoboy no corredor!'], 'Passou a um palmo!',
    'Essa moto saiu de onde?!',
  ] },
  cutOff: { who: D, role: 'driver', tone: 'stress', cd: 2.5, prio: 1, gestures: ['bracoPraFora', 'banana', 'buzinaImaginaria'], lines: [
    'Ô ANIMAL!', 'TÁ CEGO?!', 'SETA! Existe SETA!', ['Filho da puta, me fechou!', 'Filho de uma mãe, me fechou!'],
    ['Porra, olha o retrovisor!', 'Poxa, olha o retrovisor!'], 'Entrou na minha frente sem nem olhar!', 'Que isso, meu filho?!',
  ] },
  stjBus: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca', 'apontando'], lines: [
    'O ÔNIBUS DO STJ! NA ROTATÓRIA!', ['Caralho, olha a traseira desse ônibus!', 'Caramba, olha a traseira desse ônibus!'],
    'Ônibus do tribunal não dá seta pra ninguém?!', 'Ele vai varrer a rotatória inteira!', 'Opa, opa — espaço pro ônibus, espaço!',
  ] },
  cutOffRing: { who: D, role: 'driver', tone: 'stress', cd: 2.5, prio: 1, gestures: ['bracoPraFora', 'banana'], lines: [
    'NA ROTATÓRIA?! QUEM ESTÁ NA ROTATÓRIA TEM A PREFERÊNCIA!', ['CARALHO, A PREFERÊNCIA É MINHA!', 'CARAMBA, A PREFERÊNCIA É MINHA!'],
    'Isso é balão, não é pista de kart!', ['PUTA QUE PARIU, ENTROU DIRETO!', 'NOSSA SENHORA, ENTROU DIRETO!'],
  ] },
  honked: { who: D, role: 'driver', tone: 'stress', cd: 3, prio: 1, gestures: ['bracoPraFora'], lines: [
    'Buzina pra tua mãe!', 'Tá buzinando pra quê?!', ['Vai buzinar no inferno!', 'Vai buzinar lá na casa do chapéu!'],
    'Já ouvi, já ouvi!', 'Que pressa é essa?',
  ] },
  flashed: { who: D, role: 'driver', tone: 'stress', cd: 3, prio: 1, lines: [
    'Tá piscando o farol pra quem?', 'Pisca pra lá!', 'Farol alto na cara, que beleza.', ['Apaga essa porra!', 'Apaga esse farol!'],
  ] },
  tailgated: { who: D, role: 'driver', tone: 'stress', cd: 4, prio: 1, gestures: ['apontando'], lines: [
    'Cola mais, cola!', 'Tá querendo entrar no porta-malas?', ['Que porra é essa colado aqui?', 'Que negócio é esse colado aqui?'],
    'Se eu frear, já era.', 'Distância, meu amigo, DISTÂNCIA!',
  ] },
  nearMiss: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'OPA! OPA! OPA!', ['CARALHO!', 'CARAMBA!'], 'Essa foi por pouco.', ['Puta merda!', 'Minha nossa!'], 'Uou. Uou. UOU.',
  ] },
  fineRadar: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'FLASH?! Foi flash?!', ['Puta que pariu, o pardal!', 'Ai, não, o pardal!'], 'Esse pardal não estava aí ontem.',
    'Lá se vai o almoço da semana.', ['Caralho, mais uma!', 'Caramba, mais uma!'],
  ] },
  fineAgent: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'De onde saiu esse agente?!', 'Atrás da árvore?! SÉRIO?!', ['Porra, tava escondido!', 'Poxa, tava escondido!'], 'Ele tava de tocaia!',
  ] },
  fineRed: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'Tava amarelo! Tava… meio amarelo.', ['Puta merda, a câmera do sinal!', 'Ai, a câmera do sinal!'], 'Foi o flash do sinal?!',
    'Esse vermelho veio rápido demais.',
  ] },
  fineCrosswalk: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'Opa, tinha gente na faixa!', ['Caralho, a faixa! Foi mal!', 'Caramba, a faixa! Foi mal!'], 'Foi mal, moça! Foi mal!',
    'Brasília não perdoa faixa, né…',
  ] },
  fineBus: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'Era só um pouquinho na faixa do ônibus…', ['Porra, a faixa exclusiva!', 'Poxa, a faixa exclusiva!'], 'Câmera na faixa do ônibus. Claro.',
  ] },
  manga: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'MANGA! MANGA NA PISTA!', ['Porra de manga!', 'Raios de manga!'], 'Escorregou! Escorregou tudo!', 'Brasília em outubro, né…',
  ] },
  jaca: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'UMA JACA?! INTEIRA?!', ['Caralho, uma jaca!', 'Caramba, uma jaca!'], 'Quem deixa uma jaca no meio da pista?!', 'Que cheiro é esse… JACA!',
  ] },
  scrape: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'Ai! Ai, ai, ai.', ['Porra!', 'Putz!'], 'Isso foi o para-choque?', 'Só um beijinho. Só um beijinho.',
  ] },
  bus: { filler: 1, who: D, role: 'driver', tone: 'stress', cd: 8, lines: [
    'Ônibus parando em todo ponto…', 'Atrás de ônibus, a vida não anda.', ['Puta que pariu, ônibus!', 'Ai, meu Deus, ônibus!'],
  ] },
  busLane: { filler: 1, who: D, role: 'driver', tone: 'anx', cd: 9, gestures: ['apontando'], lines: [
    'Olha a faixa do ônibus vazinha ali…', 'Ninguém na faixa do ônibus. Ninguém.', 'E se eu for só um pouquinho por ali…',
  ] },
  clock: { filler: 1, who: D, role: 'driver', tone: 'anx', cd: 25, lines: [
    'Que horas são? Que horas são?!', 'Vou chegar atrasado.', 'Já era pra estar lá.', 'O relógio não para, né.',
    'Mais cinco minutos e eu tô ferrado.',
  ] },
  overtook: { who: D, role: 'driver', tone: 'calm', cd: 3, prio: 1, gestures: ['joinha'], lines: [
    'Tchau!', 'Fica aí!', 'É assim que se faz.', 'Finalmente!', 'Vai com calma aí atrás, viu?', 'Aaah, agora sim.',
  ] },
  cruise: { filler: 1, who: D, role: 'driver', tone: 'calm', cd: 12, gestures: ['joinha'], lines: [
    'Agora sim.', 'Isso. Isso!', 'Assim dá gosto.', 'Pista livre, vida boa.',
  ] },
  horn: { who: D, role: 'driver', tone: 'stress', cd: 2, prio: 1, lines: [
    'SAI DA FRENTE!', 'Ô, AMIGO!', 'ACORDA!', 'BIIII!', 'Tá verde, tá verde!',
  ] },
  curse: { who: D, role: 'driver', tone: 'stress', cd: 1, prio: 1, gestures: ['bracoPraFora', 'banana'], lines: [
    ['VAI TOMAR NO CU!', 'VAI PASSEAR NO PARQUE!'], ['FILHO DA PUTA!', 'FILHO DE UMA MÃE!'], ['PUTA QUE PARIU, HEIN!', 'PUXA VIDA, HEIN!'],
    ['CARALHO, QUE TRÂNSITO!', 'CARAMBA, QUE TRÂNSITO!'], ['VAI SE FERRAR!', 'VAI CATAR COQUINHO!'], ['PORRA, MEU!', 'POXA, MEU!'],
    'Ô ANIMAL! TÁ CEGO?!', ['Arrombado!', 'Desgramado!'],
  ] },
  breathe: { who: D, role: 'driver', tone: 'calm', cd: 1, prio: 1, lines: [
    'Inspira… expira…', 'Quatro segundos inspira. Quatro segura. Anda… quatro solta.', 'Respira. Só respira.', 'Fuuuuuu…',
    'Serenidade. Serenidade. Serenidade.',
  ] },
  peakAnx: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, lines: [
    'Eu não vou chegar. Não vou chegar.', 'Por que todo mundo tá tão DEVAGAR hoje?', 'O coração tá na boca.', 'Vai, vai, vai, vai, vai…',
  ] },
  peakStress: { who: D, role: 'driver', tone: 'stress', cd: 8, prio: 1, gestures: ['bracoPraFora'], lines: [
    ['AAAAH, PORRA!', 'AAAAH, MEU DEUS!'], 'EU NÃO AGUENTO MAIS ESSE TRÂNSITO!', ['QUE CIDADE DO CARALHO!', 'QUE CIDADE, MEU DEUS!'],
    'BRASÍLIA, POR QUÊ?!',
  ] },
  idle: { filler: 1, who: D, role: 'driver', tone: 'anx', cd: 5, gestures: ['apontando'], lines: [
    'Muda de faixa… não, fica.', 'Esse aí vai entrar. Vai entrar. Olha.', 'Seta, amigo. SETA.', 'Bora, bora.',
    'Por ali era mais rápido.', 'Waze disse 12 minutos. Mentira.',
  ] },

  // =============================== FALAS DE SITUAÇÃO (Davi ao volante) ===============================
  // Narram o que está na tela: reação ao evento e a quem causou (tipo do veículo, traço). Prioridade sobre as genéricas.
  sitVerde: { who: D, role: 'driver', tone: 'anx', cd: 6, prio: 1, situ: 1, gestures: ['buzinaImaginaria', 'apontando'], lines: [
    'Verde! VERDE!', 'Abriu, amigo!', 'Tá esperando ficar mais verde?', 'Sinal abriu, ô!', ['Abriu, porra!', 'Abriu, gente!'],
  ] },
  sitVerdeAuto: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Tinha que ser carro de autoescola.', 'Deixou morrer, né?', 'Liga de novo, liga… embreagem!', 'Calma, aluno, calma… mas vai.',
    'Pisca-alerta. Morreu mesmo.',
  ] },
  sitVerdeCel: { who: D, role: 'driver', tone: 'stress', cd: 8, prio: 1, situ: 1, gestures: ['buzinaImaginaria', 'bracoPraFora'], lines: [
    'Larga o celular!', 'Abriu, ô! Sai do zap!', ['Olha pra frente, caralho!', 'Olha pra frente, criatura!'], 'Tá respondendo mensagem no sinal?',
  ] },
  sitVerdeOnibus: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, situ: 1, lines: [
    'Vai, ônibus!', 'Bora, motorista!', 'Ônibus saindo no verde é uma novela.',
  ] },
  sitVerdeMudanca: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, situ: 1, lines: [
    'Caminhão de mudança arrancando… vai levar a tarde.', 'Vai, caminhão, vai!', 'Esse caminhão sai em primeira e fica em primeira.',
  ] },
  sitVerdeTio: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Abriu, tio!', 'Tio, é verde. VERDE.', 'Ajeita o chapéu e vai, tio!',
  ] },
  sitTioEsq: { who: D, role: 'driver', tone: 'stress', cd: 9, prio: 1, situ: 1, gestures: ['bracoPraFora', 'apontando'], lines: [
    'A esquerda é pra passar, tio!', 'Tio na faixa da esquerda a quarenta!', ['Sai da esquerda, porra!', 'Sai da esquerda, tio!'],
    'Chapéu na esquerda… sabia.',
  ] },
  sitTio: { who: D, role: 'driver', tone: 'anx', cd: 9, prio: 1, situ: 1, lines: [
    'Passeio de domingo, tio?', 'Tá apreciando a paisagem, tio?', 'Quarenta por hora, constante. Impressionante.',
  ] },
  sitAuto: { who: D, role: 'driver', tone: 'anx', cd: 9, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Autoescola na minha frente. Claro.', 'Tá aprendendo justo aqui, né?', 'Freou do nada! Autoescola…', 'Paciência… é aula.',
  ] },
  sitMudanca: { who: D, role: 'driver', tone: 'anx', cd: 9, prio: 1, situ: 1, lines: [
    'Caminhão de mudança na frente…', 'Mudando a casa inteira a trinta por hora.', 'Dá pra passar esse caminhão? Dá?',
  ] },
  sitOnibus: { who: D, role: 'driver', tone: 'anx', cd: 9, prio: 1, situ: 1, lines: [
    'Passa esse ônibus…', 'Atrás de ônibus de novo.', 'Fumaça na cara, ótimo.',
  ] },
  sitPonto: { who: D, role: 'driver', tone: 'stress', cd: 9, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Vai parar em todos?', 'Parou no ponto. De novo.', 'Desce todo mundo, sobe todo mundo…',
  ] },
  sitCel: { who: D, role: 'driver', tone: 'stress', cd: 9, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Olha o celular! Tá no celular!', 'Ziguezague… tá digitando.', 'Larga esse telefone, amigo!',
  ] },
  sitQuebrado: { who: D, role: 'driver', tone: 'anx', cd: 10, prio: 1, situ: 1, lines: [
    'Carro quebrado no meio da pista. Claro.', 'Pisca-alerta lá na frente… quebrou.', 'Logo hoje alguém quebra aqui.',
  ] },
  sitPed: { who: D, role: 'driver', tone: 'anx', cd: 8, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Atravessa rápido!', 'Bora, bora!', 'Vai, pode ir, pode ir!', 'Um, dois, três… quatro? Mais um?!', 'Isso, atravessa, atravessa…',
  ] },
  sitSinalLivre: { who: D, role: 'driver', tone: 'anx', cd: 10, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Fechou na minha cara!', 'Pista livre e o sinal fecha.', ['Fechou! Puta merda.', 'Fechou! Que coisa.'],
  ] },
  sitPardal: { who: D, role: 'driver', tone: 'anx', cd: 12, prio: 1, situ: 1, lines: [
    'Pardal ali! Pardal!', 'Olha o pardal… tira o pé.', 'Radar, radar, radar.',
  ] },
  sitLargada: { who: D, role: 'driver', tone: 'anx', cd: 30, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Quem estacionou torto aí do lado?', 'Bora, que já tô atrasado.', 'Sai da vaga… devagar… pronto.', 'Cadê a chave… achei. Bora.',
  ] },
  // eventos citando o tipo/traço de quem causou
  evSemSeta: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['bracoPraFora'], lines: [
    'Sem seta!', 'E a SETA?!', ['A seta é de enfeite, porra?', 'A seta é de enfeite?'], 'Entrou sem seta nenhuma!',
  ] },
  evCel: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Olha o celular!', 'No celular e me fechando!', 'Larga o telefone e dirige!',
  ] },
  evMoto: { who: D, role: 'driver', tone: 'stress', cd: 5, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Motoboy no corredor!', 'Passou raspando o retrovisor!', 'De onde saiu essa moto?!',
  ] },
  evOnibus: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['bracoPraFora'], lines: [
    'O ônibus entrou na marra!', 'Ônibus fechando! Ônibus!', 'Doze metros me fechando!',
  ] },
  evApressado: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['banana', 'bracoPraFora'], lines: [
    'Vai tirar o pai da forca?', ['Pressa do caralho!', 'Que pressa!'], 'Costurando todo mundo… vai.',
  ] },
  evRevanche: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, lines: [
    'Ficou bravinho, é?', 'Ah, agora ele quer conversar.', 'Buzinou de volta…',
  ] },
  evFuraoBalao: { who: D, role: 'driver', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['bracoPraFora'], lines: [
    'Furou a preferência!', 'Quem tá no balão tem a vez!', ['Entrou no balão sem olhar, porra!', 'Entrou no balão sem olhar!'],
  ] },
  sitFaixaOnibus: { who: D, role: 'driver', tone: 'anx', cd: 12, prio: 1, situ: 1, lines: [
    'Faixa de ônibus vazia do lado…', 'Olha essa faixa vazia. Não pode. Mas olha.',
  ] },

  pedScare: { who: D, role: 'driver', tone: 'panic', cd: 4, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Perdão! Perdão!', 'Ai, meu Deus! Tá tudo bem?', 'Foi mal, foi mal!', ['Caralho, não vi!', 'Nossa, não vi!'], 'Opa, opa! Tá bem, moço?',
  ] },
  sitOffroad: { who: D, role: 'driver', tone: 'anx', cd: 10, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Atalho! Atalho!', 'É rapidinho, é só cortar aqui…', 'Grama é quase asfalto.',
  ] },
  fineOffroad: { who: D, role: 'driver', tone: 'stress', cd: 4, prio: 1, lines: [
    'Era só um atalho!', ['Multa por andar na grama? Porra!', 'Multa por andar na grama? Sério?'], 'Tinha câmera no gramado?!',
  ] },
  // =============================== DAVI DE PASSAGEIRO (carona) ===============================
  pGo: { who: D, role: 'passenger', tone: 'anx', cd: 2, gestures: ['apontando', 'bracoPraFora'], lines: [
    'Vai! VAI!', 'Agora vai, agora!', 'Entra, entra, entra!', 'Muda de faixa! Agora!', 'Passa ele! Passa!', 'Cabe! Cabe, vai!',
  ] },
  pContradict: { who: D, role: 'passenger', tone: 'anx', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'Não! Não era pra ir!', 'Peraí, peraí, PERAÍ!', 'Não, não, volta, volta!', 'Eu falei vai, mas não ASSIM!', 'Ixi. Não cabia.',
  ] },
  pBrake: { who: D, role: 'passenger', tone: 'anx', cd: 4, lines: [
    'Por que freou?', 'Freou por quê?!', 'Precisava frear?', 'Não tinha nada ali!', 'Eu não teria freado.',
  ] },
  pBlocked: { who: D, role: 'passenger', tone: 'anx', cd: 3, gestures: ['apontando', 'buzinaImaginaria'], lines: [
    'Dava pra ter passado.', 'Pela esquerda! Pela ESQUERDA!', 'Buzina nele!', 'Pisca o farol, pisca!', 'Eu teria ido.',
    ['Passa esse lerdo, porra!', 'Passa esse lerdo, poxa!'], 'Olha o espaço ali! OLHA!', 'Tá esperando convite?',
  ] },
  pFreeSlow: { who: D, role: 'passenger', tone: 'anx', cd: 4, gestures: ['apontando'], lines: [
    'Esse carro anda e você não usa!', 'É turbo! TURBO! Usa o turbo!', 'Cento e sessenta e seis cavalos e a gente a quarenta.',
    'Tá livre! Acelera!', ['Pisa, caralho, tá livre!', 'Pisa, criatura, tá livre!'], 'Vou descer e empurrar.',
  ] },
  pFast: { who: D, role: 'passenger', tone: 'calm', cd: 8, gestures: ['joinha'], lines: [
    'Isso! Agora sim!', 'Olha o carro andando!', 'Aí, ó! Aí!', 'Assim, assim!',
  ] },
  pYellow: { who: D, role: 'passenger', tone: 'anx', cd: 4, prio: 1, lines: [
    'Esse sinal tava amarelo, hein.', 'Amarelo-avermelhado, isso aí.', 'Passou raspando no amarelo.',
  ] },
  pRed: { who: D, role: 'passenger', tone: 'stress', cd: 3, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'TAVA VERMELHO!', 'Era vermelho! VERMELHO!', ['Puta que pariu, vermelho!', 'Nossa senhora, vermelho!'],
  ] },
  pInstr: { filler: 1, who: D, role: 'passenger', tone: 'anx', cd: 2, gestures: ['apontando'], lines: [
    'Seta! SETA!', 'Olha o retrovisor.', 'Reduz, reduz.', 'Agora vai.', 'Muda de faixa.', 'Eu teria ido.', 'Fica na da esquerda.',
    'Não, na da direita.', 'Olha o pardal ali.', 'Cuidado com esse aí.', 'Encosta mais pra cá.', 'Liga o ar.', 'Pega a S1, é melhor.',
    'Não pega a S1.', 'Esse aí vai entrar.', 'Olha o motoboy!', 'Desvia da manga!', 'Segunda marcha não, terceira.', 'Ultrapassa, ultrapassa.',
  ] },
  pOvertaken: { who: D, role: 'passenger', tone: 'stress', cd: 3, prio: 1, gestures: ['banana', 'bracoPraFora'], lines: [
    'Vai deixar ele passar assim?!', 'Ele passou a gente! A GENTE!', ['Olha esse filho da… passando!', 'Olha esse sujeito passando!'],
    'Num Cactus! A gente tá num CACTUS!',
  ] },
  pStjBus: { who: D, role: 'passenger', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca', 'apontando'], lines: [
    'O ônibus do STJ! Freia, freia!', 'Olha a traseira dele! A TRASEIRA!', ['Puta merda, entrou com tudo!', 'Minha nossa, entrou com tudo!'],
    'Deixa ele ir, deixa ele ir!',
  ] },
  pJam: { who: D, role: 'passenger', tone: 'anx', cd: 5, gestures: ['apontando', 'maosNaCabeca'], lines: [
    'Eu falei pra ir pelo Eixo!', 'Por que você veio por aqui?', 'Pega a da esquerda, a da esquerda!', 'Não anda! Não anda!',
    'Waze, cadê você?', 'Tinha que ter virado lá atrás!', 'Sobe na calçada… brincadeira. Brincadeira!',
  ] },
  pCutOff: { who: D, role: 'passenger', tone: 'stress', cd: 2.5, prio: 1, gestures: ['bracoPraFora', 'banana'], lines: [
    'Ô ANIMAL!', 'TÁ CEGO?!', ['Fechou a gente, filho da puta!', 'Fechou a gente, filho de uma mãe!'], 'Buzina! BUZINA NELE!',
  ] },
  pHonked: { who: D, role: 'passenger', tone: 'stress', cd: 3, prio: 1, gestures: ['bracoPraFora'], lines: [
    'Tá buzinando pra gente?!', 'Buzina de volta!', ['Buzina pra tua mãe, porra!', 'Buzina pra tua mãe, viu!'],
  ] },
  pNearMiss: { who: D, role: 'passenger', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'CUIDADO!', 'OLHA! OLHA! OLHA!', ['CARALHO!', 'CARAMBA!'], 'Eu vi a minha vida passando.',
  ] },
  pHazard: { who: D, role: 'passenger', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'MANGA! Eu falei da manga!', 'Escorregou tudo!', 'Desvia da fruta! Da fruta!',
  ] },
  pFine: { who: D, role: 'passenger', tone: 'stress', cd: 2, prio: 1, lines: [
    'Eu VI o pardal. Eu ia falar.', 'Ihhh, multa.', 'Esse agente tava escondido!', 'Era só ter reduzido.',
  ] },
  pOutburst: { who: D, role: 'passenger', tone: 'stress', cd: 1, prio: 1, gestures: ['bracoPraFora', 'banana'], lines: [
    ['VAI TOMAR NO CU, Ô ANIMAL!', 'VAI PASSEAR, Ô ANIMAL!'], ['FILHO DA PUTA! APRENDE A DIRIGIR!', 'FILHO DE UMA MÃE! APRENDE A DIRIGIR!'],
    ['PUTA QUE PARIU, TÁ CEGO?!', 'NOSSA SENHORA, TÁ CEGO?!'], ['VAI SE FODER COM ESSA SETA!', 'VAI SE FERRAR COM ESSA SETA!'],
    ['CARALHO, ANDA!', 'CARAMBA, ANDA!'], 'ESSA RUA NÃO É SUA, NÃO!',
  ] },
  pRingSurto: { who: D, role: 'passenger', tone: 'stress', cd: 1, prio: 1, gestures: ['bracoPraFora'], lines: [
    ['NA ROTATÓRIA, CARALHO?! NA ROTATÓRIA?!', 'NA ROTATÓRIA, MEU DEUS?! NA ROTATÓRIA?!'],
    'QUEM TÁ NO BALÃO TEM PREFERÊNCIA! PREFERÊNCIA!', ['PUTA QUE PARIU, ENTROU DIRETO!', 'PELO AMOR DE DEUS, ENTROU DIRETO!'],
  ] },
  pScrape: { who: D, role: 'passenger', tone: 'stress', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'Eita! Raspou!', 'Ouvi um barulho. Ouvi.', ['Porra, o para-choque!', 'Putz, o para-choque!'],
  ] },

  // =============================== DONO AO VOLANTE (carona) ===============================
  oCalm: { who: O, role: 'driver', tone: 'calm', cd: 7, gestures: ['joinha'], lines: [
    'Calma, Davi.', 'Tá tudo bem.', 'Respira, cara.', 'A gente chega.', 'O carro da frente também quer chegar.', 'Fecha o vidro, Davi.',
    'Não precisa disso.', 'Tá tranquilo.', 'Eu tô vendo, Davi.',
  ] },
  oAnnoyed: { who: O, role: 'driver', tone: 'stress', cd: 8, gestures: ['maosNaCabeca'], lines: [
    'Davi… por favor.', 'Fecha o vidro. Agora.', 'Eu tô dirigindo, Davi.', 'Uma palavra a mais e você vai a pé.',
  ] },

  // =============================== DONO DE PASSAGEIRO (perigo) ===============================
  oOverLimit: { who: O, role: 'passenger', tone: 'panic', cd: 4, lines: [
    'O limite ali é bem menos, hein.', 'Olha o velocímetro, Davi.', 'Devagar, devagar…', 'Tira o pé. Tira o pé!', 'A gente não tá atrasado!',
  ] },
  oRadar: { who: O, role: 'passenger', tone: 'panic', cd: 5, prio: 1, gestures: ['apontando'], lines: [
    'OLHA O PARDAL!', 'Pardal! PARDAL!', 'Tem radar ali, Davi!', 'A multa vem no MEU nome!',
  ] },
  oTailgate: { who: O, role: 'passenger', tone: 'panic', cd: 4, lines: [
    'Muito perto! Muito perto!', 'Distância, Davi!', 'Vai entrar no porta-malas dele!', 'Ai, ai, ai, olha a traseira dele…',
  ] },
  oHardBrake: { who: O, role: 'passenger', tone: 'panic', cd: 3, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'AI MEU DEUS!', 'FREIA! FREIA!', 'Meu pescoço!', 'O cinto travou!',
  ] },
  oCorner: { who: O, role: 'passenger', tone: 'panic', cd: 4, gestures: ['maosNaCabeca'], lines: [
    'Devagar na curva!', 'Ai, a curva!', 'Eu tô segurando no teto!', 'O pneu tá cantando!',
  ] },
  oTurbo: { who: O, role: 'passenger', tone: 'panic', cd: 6, lines: [
    'Não pisa tudo!', 'Ouviu esse barulho? É o turbo. NÃO.', 'Esse turbo não é brinquedo!', 'Devagar com o meu turbo!',
  ] },
  oPanic: { who: O, role: 'passenger', tone: 'panic', cd: 4, gestures: ['maosNaCabeca'], lines: [
    'Ai, meu carrinho…', 'A minha vida…', 'A parcela nem acabou!', 'Eu tenho família, Davi.', 'Por que eu emprestei? Por quê?',
    'Eu só queria ir trabalhar.', 'O seguro cobre isso? Cobre?', 'Devagar, pelo amor de Deus.', 'Meu carro. Meu. Carro.',
  ] },
  oStjBus: { who: O, role: 'passenger', tone: 'panic', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'O ÔNIBUS! Dá espaço, Davi!', 'Freia! É o ônibus do tribunal!', 'Calma, deixa ele passar…',
  ] },
  oJam: { who: O, role: 'passenger', tone: 'calm', cd: 12, lines: [
    'Ufa. Parado eu gosto.', 'Pode ficar nessa fila o quanto quiser, Davi.', 'Finalmente uma velocidade segura.',
    'Respira. A gente tá parado. Que maravilha.',
  ] },
  oNearMiss: { who: O, role: 'passenger', tone: 'panic', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'AAAAH!', 'FREIA!', 'Passou a um dedo!', 'Eu vi a luz. Eu vi a luz.',
  ] },
  oScrape: { who: O, role: 'passenger', tone: 'panic', cd: 2, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'MEU PARA-CHOQUE!', 'Isso foi o MEU carro?!', 'Ai, meu carrinho! Ai!', 'Tá riscado. Eu sei que tá riscado.',
  ] },
  oRed: { who: O, role: 'passenger', tone: 'panic', cd: 2, prio: 1, lines: [
    'ERA VERMELHO, DAVI!', 'Vermelho! VERMELHO!', 'Você viu a cor do sinal?!',
  ] },
  oYellow: { who: O, role: 'passenger', tone: 'panic', cd: 4, prio: 1, lines: [
    'Amarelo é pra parar, Davi.', 'Isso tava quase vermelho.',
  ] },
  oHazard: { who: O, role: 'passenger', tone: 'panic', cd: 2, prio: 1, lines: [
    'A MANGA!', 'Escorregou! Escorregou!', 'Fruta no pneu do meu carro…',
  ] },
  oFine: { who: O, role: 'passenger', tone: 'panic', cd: 3, prio: 1, lines: [
    'Vem no meu nome. NO MEU NOME.', 'Lá se vão os meus pontos.', 'Eu avisei do pardal!',
  ] },
  oTakeover: { who: O, role: 'passenger', tone: 'panic', cd: 1.5, prio: 1, gestures: ['maosNaCabeca'], lines: [
    'ENCOSTA. ENCOSTA AGORA.', 'Para o carro, Davi.', 'Eu vou dirigir. EU.', 'Passa a chave. Já.',
  ] },
  oCurseReact: { who: O, role: 'passenger', tone: 'panic', cd: 4, prio: 1, lines: [
    'Fecha esse vidro!', 'Não xinga, ele vai descer do carro!', 'Davi! O carro é meu, a placa é minha!',
  ] },

  // =============================== SITUAÇÃO: Davi de passageiro (carona) — palpite/instrução ===============================
  psVerde: { who: D, role: 'passenger', tone: 'anx', cd: 6, prio: 1, situ: 1, gestures: ['buzinaImaginaria'], lines: [
    'Buzina pra ele! Abriu!', 'Verde, Leandro! Ele não viu!', 'Pisca o farol, pisca!',
  ] },
  psVerdeAuto: { who: D, role: 'passenger', tone: 'anx', cd: 8, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'Autoescola! Deixou morrer!', 'Tinha que ser autoescola…', 'Desvia pela outra faixa!',
  ] },
  psVerdeCel: { who: D, role: 'passenger', tone: 'stress', cd: 8, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Ele tá no celular! Buzina!', 'Olha ele no zap! Buzina!',
  ] },
  psLento: { who: D, role: 'passenger', tone: 'anx', cd: 7, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Passa esse aí!', 'Ultrapassa! Tá livre do lado!', 'Vai ficar atrás dele?',
  ] },
  psTioEsq: { who: D, role: 'passenger', tone: 'stress', cd: 9, prio: 1, situ: 1, gestures: ['bracoPraFora'], lines: [
    'Tio na esquerda! Pisca o farol!', 'Pela direita, Leandro, pela direita!',
  ] },
  psOnibus: { who: D, role: 'passenger', tone: 'anx', cd: 8, prio: 1, situ: 1, lines: [
    'Passa esse ônibus!', 'Sai de trás do ônibus!', 'Vai parar em todos os pontos, passa!',
  ] },
  psPed: { who: D, role: 'passenger', tone: 'anx', cd: 8, prio: 1, situ: 1, lines: [
    'Atravessa, atravessa…', 'Pode ir, pode ir, a gente espera…', 'Mais um! Sempre mais um!',
  ] },
  psSemSeta: { who: D, role: 'passenger', tone: 'stress', cd: 6, prio: 1, situ: 1, gestures: ['bracoPraFora'], lines: [
    'Sem seta! Viu isso?', 'Buzina pra ele! Sem seta!',
  ] },
  psMoto: { who: D, role: 'passenger', tone: 'stress', cd: 6, prio: 1, situ: 1, lines: [
    'Olha a moto! Olha a moto!', 'Motoboy do lado!',
  ] },
  psPardal: { who: D, role: 'passenger', tone: 'anx', cd: 12, prio: 1, situ: 1, lines: [
    'Pardal! Reduz!', 'Olha o radar ali!',
  ] },

  // =============================== SITUAÇÃO: Leandro de passageiro (perigo) ===============================
  osVerdeAuto: { who: O, role: 'passenger', tone: 'calm', cd: 10, prio: 1, situ: 1, lines: [
    'É autoescola, calma.', 'Deixa o aluno, Davi.', 'Morreu o carro dele. Respira.',
  ] },
  osVerde: { who: O, role: 'passenger', tone: 'calm', cd: 10, prio: 1, situ: 1, lines: [
    'Ele já vai, Davi.', 'Não buzina, não buzina.', 'Dois segundos, Davi. Dois.',
  ] },
  osPed: { who: O, role: 'passenger', tone: 'panic', cd: 9, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'O pedestre, Davi!', 'Para, para, tem gente!', 'Faixa! FAIXA!',
  ] },
  osLento: { who: O, role: 'passenger', tone: 'calm', cd: 10, prio: 1, situ: 1, lines: [
    'Fica atrás dele, não tem pressa.', 'Não precisa ultrapassar.', 'Deixa ele, Davi.',
  ] },
  osMoto: { who: O, role: 'passenger', tone: 'panic', cd: 8, prio: 1, situ: 1, lines: [
    'A moto! O retrovisor!', 'Olha a moto do lado!',
  ] },
  pPedScare: { who: D, role: 'passenger', tone: 'panic', cd: 4, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'O PEDESTRE!', 'Quase, quase! Tá tudo bem, moço?', 'Leandro, a faixa!',
  ] },
  oPedScare: { who: O, role: 'passenger', tone: 'panic', cd: 4, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'DAVI! O PEDESTRE!', 'Para! Para tudo! Tá bem, moço?', 'Meu Deus do céu, Davi…', 'Foi por um triz!',
  ] },
  psOffroad: { who: D, role: 'passenger', tone: 'anx', cd: 10, prio: 1, situ: 1, gestures: ['apontando'], lines: [
    'Leandro, isso é gramado!', 'Volta pro asfalto, multa!', 'Corta por aqui! Não, não corta!',
  ] },
  osOffroad: { who: O, role: 'passenger', tone: 'panic', cd: 6, prio: 1, situ: 1, gestures: ['maosNaCabeca'], lines: [
    'O gramado NÃO, Davi!', 'Isso é canteiro! CANTEIRO!', 'A suspensão, Davi… a suspensão!',
  ] },
};

/** Texto de uma entrada do banco conforme o interruptor de palavrão. */
export function lineText(entry, profanity) {
  if (Array.isArray(entry)) return profanity ? entry[0] : entry[1];
  return entry;
}

/**
 * Speaker: sorteia falas sem repetir em sequência (saco embaralhado por banco) e limita a frequência
 * (intervalo mínimo por personagem e cooldown por banco). rng injetável (testes).
 */
export class Speaker {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.minGap = opts.minGap != null ? opts.minGap : 1.4;
    this.minGapHigh = opts.minGapHigh != null ? opts.minGapHigh : 0.6;
    this.fillerGap = opts.fillerGap != null ? opts.fillerGap : 0;
    this.banks = opts.banks || BANKS;
    this.reset();
  }
  reset() { this.lastAt = Object.create(null); this.bankAt = Object.create(null); this.bags = Object.create(null); this.lastIdx = Object.create(null); }

  _next(key, n) {
    let bag = this.bags[key];
    if (!bag || bag.length === 0) {
      bag = []; for (let i = 0; i < n; i++) bag.push(i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
      // nunca repete a última fala ao recomeçar o saco
      if (n > 1 && bag[bag.length - 1] === this.lastIdx[key]) { const t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t; }
      this.bags[key] = bag;
    }
    const i = bag.pop();
    this.lastIdx[key] = i;
    return i;
  }

  /** Pode falar agora? (sem consumir) */
  can(t, key, prio) {
    const b = this.banks[key]; if (!b) return false;
    const gap = (prio != null ? prio : b.prio || 0) > 0 ? this.minGapHigh : this.minGap;
    const la = this.lastAt[b.who + b.role];
    if (la != null && t - la < gap) return false;
    // enchimento só preenche silêncio longo (a fala de situação tem preferência)
    if (b.filler && la != null && t - la < this.fillerGap) return false;
    const ba = this.bankAt[key];
    if (ba != null && t - ba < (b.cd || 0)) return false;
    return true;
  }

  /**
   * Tenta falar. opts: { prio, profanity (default true), gestureOnly, gestureChance, force }
   * Retorna o payload de EV.SAY ou null.
   */
  say(t, key, opts = {}) {
    const b = this.banks[key];
    if (!b) return null;
    if (!opts.force && !this.can(t, key, opts.prio)) return null;
    this.lastAt[b.who + b.role] = t; this.bankAt[key] = t;
    const gestures = b.gestures || null;
    let gesture = null;
    if (gestures && gestures.length) {
      const gc = opts.gestureChance != null ? opts.gestureChance : 0.35;
      if (opts.gestureOnly || this.rng() < gc) gesture = gestures[Math.floor(this.rng() * gestures.length) % gestures.length];
    }
    let text = '';
    if (!(opts.gestureOnly && gesture)) text = lineText(b.lines[this._next(key, b.lines.length)], opts.profanity !== false);
    const ttl = text ? Math.min(6, Math.max(2.4, 2.0 + text.length * 0.045)) : 1.8;
    return { who: b.who, role: b.role, text, tone: b.tone, ttl, gesture, bank: key };
  }
}
