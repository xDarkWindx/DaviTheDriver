// ROSTOS EM PIXEL ART COMO DADOS (editáveis à mão). Gerado a partir do desenho anterior; edite livremente.
// Formato: cada personagem tem uma PALETA { caractere: '#rrggbb' } e, por EXPRESSÃO, uma matriz de strings (uma string
// por linha, um caractere por pixel). '.' = transparente. Rostos do HUD/balões/fim: 24×24. Avatar do menu: 32×32.
// Expressões (as mesmas para os dois): calm (tranquilo/feliz), anx (incomodado), stress (bravo), panic (susto/pânico).
// Camada opcional HORNS (Davi): chifrinhos de fantasia desenhados POR CIMA de qualquer expressão (segredo do HUD:
// aparecem por alguns segundos quando a barra de estresse do Davi chega ao máximo).
// Quem usa: ui/pixel.js drawFace(cv, who, tone, { horns }) e drawDaviHelmet(cv) (canvas com image-rendering: pixelated).

export const FACE_SIZE = 24;
export const AVATAR_SIZE = 32;
export const EXPRESSIONS = ['calm', 'anx', 'stress', 'panic'];

export const DAVI_FACE = {
  palette: {
    'a': '#6fcf8e', // FUNDO_CALMO
    'b': '#22150f', // CABELO
    'c': '#3d281c', // CABELO_BRILHO
    'd': '#f0c6a2', // PELE
    'e': '#d9a582', // PELE_SOMBRA
    'f': '#fff', // BRANCO
    'g': '#1c1c24', // OLHO
    'h': '#24170f', // BARBA
    'i': '#a8705a', // NARINA
    'j': '#9a4a42', // LABIO
    'k': '#3a281c', // BARBA_BRILHO
    'l': '#5a1e1e', // BOCA
    'm': '#f2f2f2', // CAMISETA
    'n': '#ffd23a', // FUNDO_INCOMODADO
    'o': '#bfe9ff', // SUOR
    'p': '#ea5a41', // FUNDO_ESTRESSE
    'q': '#e00', // VEIA
    'r': '#eaa486', // PELE_VERMELHA
    's': '#3a0f0f', // BOCA
    't': '#b45fe0', // FUNDO_PANICO
    'u': '#e8556a', // LINGUA
    'v': '#6b6b78', // CHIFRE
  },
  faces: {
    calm: [
      'aaaaabbaabbaabbaaaaaaaaa',
      'aaaabbbbcbbbbbcbbbbbaaaa',
      'aaabbcbbbcbcbbbcbbbbbaaa',
      'aabbbbcbbbbbcbbbbcbbbbaa',
      'abbbbbbbbbbbbbbbbbcbbbbb',
      'abbbbbbbbbbbbbbbbbbbbbba',
      'abbcbabbdbddbbdbdbabcbba',
      'abbbcadddbdddddbddabbcba',
      'abbbbadbbbddddbbbdabbbba',
      'abcbbadddddddeddddabbbba',
      'abbcbdddfgdddegfdddbbcba',
      'abbbbddddddddedddddbbbca',
      'aabcbhhddddddedddhhcbbaa',
      'aabbchhddddddedddhhbcbaa',
      'aaaaahhddddddddddhhaaaaa',
      'aaaaahhhhhieeihhhhhaaaaa',
      'aaaaahhhjhhhhhhjhhhaaaaa',
      'aaaaahhhhffffffhhhhaaaaa',
      'aaaaaakhhllllllhkhaaaaaa',
      'aaaaaaaahhhhhhhhaaaaaaaa',
      'aaammmmmmeeeeeemmmmmmaaa',
      'aaammmmmmmmmmmmmmmmmmaaa',
      'aaammmmmmmmmmmmmmmmmmaaa',
      'aaammmmmmmmmmmmmmmmmmaaa',
    ],
    anx: [
      'nnnnnbbnnbbnnbbnnnnnnnnn',
      'nnnnbbbbcbbbbbcbbbbbnnnn',
      'nnnbbcbbbcbcbbbcbbbbbnnn',
      'nnbbbbcbbbbbcbbbbcbbbbnn',
      'nbbbbbbbbbbbbbbbbbcbbbbb',
      'nbbbbbbbbbbbbbbbbbbobbbn',
      'nbbconbbdbddbbdbdbnocbbn',
      'nbbbondbbbddddbbbdnbbcbn',
      'nbbbbnddddbddbddddnbbbbn',
      'nbcbbndfffdddefffdnbbbbn',
      'nbbcbddfgfdddefgfddbbcbn',
      'nbbbbddfffdddefffddbbbcn',
      'nnbcbhhddddddedddhhcbbnn',
      'nnbbchhddddddedddhhbcbnn',
      'nnnnnhhddddddddddhhnnnnn',
      'nnnnnhhhhhieeihhhhhnnnnn',
      'nnnnnhhhhhjhhjhhhhhnnnnn',
      'nnnnnhhhhjhjjhjhhhhnnnnn',
      'nnnnnnkhhhhhhhhhkhnnnnnn',
      'nnnnnnnnhhhhhhhhnnnnnnnn',
      'nnnmmmmmmeeeeeemmmmmmnnn',
      'nnnmmmmmmmmmmmmmmmmmmnnn',
      'nnnmmmmmmmmmmmmmmmmmmnnn',
      'nnnmmmmmmmmmmmmmmmmmmnnn',
    ],
    stress: [
      'pppppbbppbbppbbppppppppp',
      'ppppbbbbcbbbbbcbbbbbpppp',
      'pppbbcbbbcbcbbbcbbqbbppp',
      'ppbbbbcbbbbbcbbbbqqqbbpp',
      'pbbbbbbbbbbbbbbbbbqbbbbb',
      'pbbbbbbbbbbbbbbbbbbbbbbp',
      'pbbcbpbbrbrrbbrbrbpbcbbp',
      'pbbbcprrrbrrrrrbrrpbbcbp',
      'pbbbbprbbbrrrrbbbrpbbbbp',
      'pbcbbprrrbrrrebrrrpbbbbp',
      'pbbcbrrgggrrregggrrbbcbp',
      'pbbbbrrrrrrrrerrrrrbbbcp',
      'ppbcbhhrrrrrrerrrhhcbbpp',
      'ppbbchhrrrrrrerrrhhbcbpp',
      'ppppphhrrrrrrrrrrhhppppp',
      'ppppphhhhhieeihhhhhppppp',
      'ppppphhhsffffffshhhppppp',
      'ppppphhhsssssssshhhppppp',
      'ppppppkhsffffffskhpppppp',
      'pppppppphhhhhhhhpppppppp',
      'pppmmmmmmeeeeeemmmmmmppp',
      'pppmmmmmmmmmmmmmmmmmmppp',
      'pppmmmmmmmmmmmmmmmmmmppp',
      'pppmmmmmmmmmmmmmmmmmmppp',
    ],
    panic: [
      'tttttbbttbbttbbttttttttt',
      'ttttbbbbcbbbbbcbbbbbtttt',
      'tttbbcbbbcbcbbbcbbbbbttt',
      'ttbbbbcbbbbbcbbbbcbbbbtt',
      'tbbbbbbbbbbbbbbbbbcbbbbb',
      'tbbbbbbbbbbbbbbbbbbobbbt',
      'tbbcotbbbbddbbbbbbtocbbt',
      'tbbbotdddbdddddbddtbbcbt',
      'tbbbbtdfffddddfffdtbbbbt',
      'tbcbbtdfgfdddefgfdtbbbbt',
      'tbbcbddfgfdddefgfddbbcbt',
      'tbbbbddfffdddefffddbbbct',
      'ttbcbhhddddddedddhhobbtt',
      'ttbbchhddddddedddhhocbtt',
      'ttttthhddddddddddhhttttt',
      'ttttthhhhhieeihhhhhttttt',
      'ttttthhhhhsssshhhhhttttt',
      'ttttthhhhhsuushhhhhttttt',
      'ttttttkhhhsssshhkhtttttt',
      'tttttttthhhhhhhhtttttttt',
      'tttmmmmmmeeeeeemmmmmmttt',
      'tttmmmmmmmmmmmmmmmmmmttt',
      'tttmmmmmmmmmmmmmmmmmmttt',
      'tttmmmmmmmmmmmmmmmmmmttt',
    ],
  },
  horns: [
    '.....v............v.....',
    '....vvv..........vvv....',
    '...vv.............bvv...',
    '...v.............cbbv...',
    '..v...............c..v..',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
};

export const DONO_FACE = {
  palette: {
    'a': '#6fcf8e', // FUNDO_CALMO
    'b': '#3b2a1e', // CABELO
    'c': '#5a412e', // CABELO_BRILHO
    'd': '#efc4a0', // PELE
    'e': '#cf9f78', // PELE_SOMBRA
    'f': '#fff', // BRANCO
    'g': '#1c1c24', // OLHO
    'h': '#b98d6e', // BARBA_RALA
    'i': '#a8705a', // NARINA
    'j': '#9a4a42', // LABIO
    'k': '#23262d', // CAMISA
    'l': '#14161a', // GOLA_SOMBRA
    'm': '#ffd23a', // FUNDO_INCOMODADO
    'n': '#bfe9ff', // SUOR
    'o': '#ea5a41', // FUNDO_ESTRESSE
    'p': '#e00', // VEIA
    'q': '#e0957a', // PELE_VERMELHA
    'r': '#3a0f0f', // BOCA
    's': '#b45fe0', // FUNDO_PANICO
    't': '#e8556a', // LINGUA
  },
  faces: {
    calm: [
      'aaaaaaaaaaaaabbbaaaaaaaa',
      'aaaaaaaaabccccbbaaaaaaaa',
      'aaaaaaabbbbbbbbbbaaaaaaa',
      'aaaaaabbccccccbbbbaaaaaa',
      'aaaaabbbbbbbbbbbbbbaaaaa',
      'aaaaabbbbbbbbbbbbbbaaaaa',
      'aaaaabddddddddddddbaaaaa',
      'aaaaabddddddddddddbaaaaa',
      'aaaaaadbbbddddbbbdaaaaaa',
      'aaaaaadddddddeddddaaaaaa',
      'aaaaadddfgdddegfdddaaaaa',
      'aaaaaddddddddedddddaaaaa',
      'aaaaaddddddddedddddaaaaa',
      'aaaaaadhdddddedddhaaaaaa',
      'aaaaaahdddddddddhdaaaaaa',
      'aaaaaadhddieeidddhaaaaaa',
      'aaaaaahdddddddddhdaaaaaa',
      'aaaaaaahdhjjjjdhdhaaaaaa',
      'aaaaaahahdhdhdhdhaaaaaaa',
      'aaaaaaaaaeeeeeeaaaaaaaaa',
      'aaakkkkkkeeeeeekkkkkkaaa',
      'aaakkkkkkkkllkkkkkkkkaaa',
      'aaakkkkkkkkkkkkkkkkkkaaa',
      'aaakkkkkkkkkkkkkkkkkkaaa',
    ],
    anx: [
      'mmmmmmmmmmmmmbbbmmmmmmmm',
      'mmmmmmmmmbccccbbmmmmmmmm',
      'mmmmmmmbbbbbbbbbbmmmmmmm',
      'mmmmmmbbccccccbbbbmmmmmm',
      'mmmmmbbbbbbbbbbbbbbmmmmm',
      'mmmmmbbbbbbbbbbbbbbnmmmm',
      'mmmmnbddddddddddddbnmmmm',
      'mmmmnbdbbbddddbbbdbmmmmm',
      'mmmmmmddddbddbddddmmmmmm',
      'mmmmmmdfffdddefffdmmmmmm',
      'mmmmmddfgfdddefgfddmmmmm',
      'mmmmmddfffdddefffddmmmmm',
      'mmmmmddddddddedddddmmmmm',
      'mmmmmmdhdddddedddhmmmmmm',
      'mmmmmmhdddddddddhdmmmmmm',
      'mmmmmmdhddieeidddhmmmmmm',
      'mmmmmmhdddjddjddhdmmmmmm',
      'mmmmmmmhdjdjjhjhdhmmmmmm',
      'mmmmmmhmhdhdhdhdhmmmmmmm',
      'mmmmmmmmmeeeeeemmmmmmmmm',
      'mmmkkkkkkeeeeeekkkkkkmmm',
      'mmmkkkkkkkkllkkkkkkkkmmm',
      'mmmkkkkkkkkkkkkkkkkkkmmm',
      'mmmkkkkkkkkkkkkkkkkkkmmm',
    ],
    stress: [
      'ooooooooooooobbboooooooo',
      'ooooooooobccccbboooooooo',
      'ooooooobbbbbbbbbbopooooo',
      'oooooobbccccccbbbpppoooo',
      'ooooobbbbbbbbbbbbbpooooo',
      'ooooobbbbbbbbbbbbbbooooo',
      'ooooobqqqqqqqqqqqqbooooo',
      'ooooobqqqqqqqqqqqqbooooo',
      'ooooooqbbbqqqqbbbqoooooo',
      'ooooooqqqbqqqebqqqoooooo',
      'oooooqqgggqqqegggqqooooo',
      'oooooqqqqqqqqeqqqqqooooo',
      'oooooqqqqqqqqeqqqqqooooo',
      'ooooooqhqqqqqeqqqhoooooo',
      'oooooohqqqqqqqqqhqoooooo',
      'ooooooqhqqieeiqqqhoooooo',
      'oooooohqrffffffrhqoooooo',
      'ooooooohrrrrrrrrqhoooooo',
      'oooooohorffffffrhooooooo',
      'oooooooooeeeeeeooooooooo',
      'oookkkkkkeeeeeekkkkkkooo',
      'oookkkkkkkkllkkkkkkkkooo',
      'oookkkkkkkkkkkkkkkkkkooo',
      'oookkkkkkkkkkkkkkkkkkooo',
    ],
    panic: [
      'sssssssssssssbbbssssssss',
      'sssssssssbccccbbssssssss',
      'sssssssbbbbbbbbbbsssssss',
      'ssssssbbccccccbbbbssssss',
      'sssssbbbbbbbbbbbbbbsssss',
      'sssssbbbbbbbbbbbbbbnssss',
      'ssssnbdbbbddddbbbdbnssss',
      'ssssnbddddddddddddbsssss',
      'ssssssdfffddddfffdssssss',
      'ssssssdfgfdddefgfdssssss',
      'sssssddfgfdddefgfddsssss',
      'sssssddfffdddefffddsssss',
      'sssssddddddddedddddnssss',
      'ssssssdhdddddedddhsnssss',
      'sssssshdddddddddhdssssss',
      'ssssssdhddieeidddhssssss',
      'sssssshdddrrrrddhdssssss',
      'ssssssshdhrttrdhdhssssss',
      'sssssshshdrrrrhdhsssssss',
      'ssssssssseeeeeesssssssss',
      'ssskkkkkkeeeeeekkkkkksss',
      'ssskkkkkkkkllkkkkkkkksss',
      'ssskkkkkkkkkkkkkkkkkksss',
      'ssskkkkkkkkkkkkkkkkkksss',
    ],
  },
};

/** Avatar provisório do menu (Davi de capacete), 32×32. */
export const DAVI_HELMET = {
  palette: {
    'a': '#7cc4f2', // CEU
    'b': '#fff7c2', // SOL_HALO
    'c': '#e8c21c', // CAPACETE_SOMBRA
    'd': '#c4452b', // TERRA
    'e': '#ffe45e', // SOL
    'f': '#fff2a0', // CAPACETE_BRILHO
    'g': '#ffd21f', // CAPACETE
    'h': '#22150f', // CABELO
    'i': '#1b1230', // VISEIRA_SOMBRA
    'j': '#3d281c', // CABELO_BRILHO
    'k': '#3a8fe0', // VISEIRA
    'l': '#f0c6a2', // PELE
    'm': '#d9a582', // PELE_SOMBRA
    'n': '#fff', // BRANCO
    'o': '#1c1c24', // OLHO
    'p': '#24170f', // BARBA
    'q': '#8fcf6a', // GRAMA
    'r': '#5a1e1e', // BOCA
    's': '#f2f2f2', // CAMISETA
  },
  rows: [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaabbbbbaaa',
      'aaaaaaaacccccccddcccccccbeeebaaa',
      'aaaaaaaacccccccddcccccccbeeebaaa',
      'aaaaaaaffffffffddffffffffeeebaaa',
      'aaaaaaaggggggggddggggggggbbbbaaa',
      'aaaaaaaggggggggddggggggggaaaaaaa',
      'aaaaaagggggggggddgggggggggaaaaaa',
      'aaaaaagggggggggddgggggggggaaaaaa',
      'aaaaaagggggggggddgggggggggaaaaaa',
      'aaaahhgggggggggddggggggggghhaaaa',
      'aaahhhggiiiiiiiiiiiiiiiigghhhhaa',
      'aaaahjghkkkkkkkkkkkkkkkkhghhaaaa',
      'aaahhhjhhllllllllllllllhjhhhhaaa',
      'aaahhhhhhllhhhhllhhhhllhhjhhhaaa',
      'aaahhhhhhllllllllmlllllhhhhhhaaa',
      'aaahhhjhhllnonlllmnonllhhhhhhaaa',
      'aaahhhhjhllnonlllmnonllhhhjhhaaa',
      'aaahhhhhhppllllllmlllpphhhhjhaaa',
      'qqqhjhhhhpplllmmmmlllpphhhhhhqqq',
      'qqqhhjhhhppllppppppllpphjhhhhqqq',
      'ddddhhhhhppppnnnnnnpppphhjhhdddd',
      'ddddhhhhhpppprrrrrrpppphhhhhdddd',
      'dddddddhhdppppppppppppdhhddddddd',
      'dddddssssssssmmmmmmssssssssddddd',
      'dddddssssssssssssssssssssssddddd',
      'dddddssssssssssssssssssssssddddd',
      'dddddssssssssssssssssssssssddddd',
      'dddddssssssssssssssssssssssddddd',
    ],
};
