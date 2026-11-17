# Davi, the Driver

Jogo de direção isométrico (three.js/WebGL) ambientado numa Brasília estilizada. Pegue o volante e leve o Davi
da **QRSW 2 — Sudoeste** (casa) até o **STJ** (SAFS), ou o caminho inverso: sem bater, sem multa e no menor tempo
possível, equilibrando as barras de **ansiedade** e **estresse** pelo caminho (respirar fundo ajuda!).

> Uma brincadeira entre amigos, sem fins comerciais.

## Modos de jogo

| Modo | Como é |
|---|---|
| **Sendo o Davi** | você dirige o Renault Kwid branco do Davi |
| **Dando carona pro Davi** | você é o Leandro, no seu C4 Cactus THP cinza, com o Davi de passageiro |
| **PERIGO** | o Davi dirige o Cactus emprestado do Leandro, que vai do lado. Cuidado com o carro alheio! |

**Rotas:** Casa → STJ (manhã) e STJ → Casa (fim de tarde). Há duas rotas principais no mapa, ambas nos dois
sentidos: **Eixo Monumental** (rápida, com pardais) e **Via S3 + Parque da Cidade** (lenta, com semáforos e faixa
de ônibus). A seta amarela segue o GPS (rota mais rápida). Chegada ao STJ por um dos dois estacionamentos (sorteado na
viagem): **Norte** (faixa comprida colada ao prédio, pela SAFS Quadra 2 e a avenida, ou pela lateral leste) ou **Leste** (o bolsão
arborizado, pela Rotatória 2). Às vezes há **congestionamento** no caminho (vermelho no minimapa) e, perto do STJ, o
**ônibus do STJ** pode entrar no balão na sua frente.

## Como jogar

Abra **`DaviTheDriver.html`** com duplo clique: é um arquivo único, funciona sem internet e dá para mandar por
WhatsApp ou e-mail. (`index.html` também funciona com duplo clique, desde que a pasta `dist/` esteja ao lado.)
No celular, use a tela na horizontal: aparecem botões de toque.

| Tecla | Ação |
|---|---|
| W / ↑ | acelerar |
| S / ↓ | frear / ré |
| A D / ← → | direção |
| Espaço | freio de mão |
| H | buzinar |
| R | respirar fundo |
| X | xingar |
| F | piscar o farol |
| P / Esc | pausa |

H, R, X e F têm tempo de recarga (detalhes em *Regras e humor*). No celular os mesmos quatro aparecem como botões acima do
velocímetro; em retrato o jogo pede para girar o aparelho.

**Requisitos:** qualquer navegador moderno com WebGL. Roda bem em GPU integrada (testado pensando em Intel UHD 770);
a qualidade gráfica se ajusta sozinha ao desempenho. Para forçar: `index.html?q=leve` (padrão; `?q=hd` ainda cai para `leve`).

### Trocar a foto do menu

Coloque uma imagem quadrada (de preferência pixel art) em `assets/davi.png` e rode `npm run build:single`: a foto é
embutida em `DaviTheDriver.html` e aparece na moldura do menu. Sem o arquivo, o menu mostra um avatar desenhado.
Ao abrir `index.html` (sem o arquivo único) a foto é lida de `assets/davi.png`.

## Build e testes

```bash
npm install          # esbuild + three (devDependencies; three é empacotado no bundle)
npm run build        # src/ -> dist/game.js (IIFE minificado) e DaviTheDriver.html (arquivo único). Ambos ENTRAM no git.
npm run build:single # só o arquivo único DaviTheDriver.html (CSS + JS + foto embutidos; sem rede)
npm run watch        # rebuild contínuo de dist/game.js (não minificado, sourcemap inline)
npm test             # malha viária + humor/regras + trânsito, tudo em Node puro
npm run smoke        # Playwright: abre via file://, joga os 3 modos, mede draw calls, screenshots em .shots/
node tools/smoke.cjs /tmp/minha-pasta   # idem, salvando screenshots em outra pasta (verificações por passos de simulação, não relógio)
node tools/shots.cjs /tmp/pasta [filtro] # vistas de inspeção (mapa, bairros, marcos, carros, tráfego) + draw calls/triângulos
node tools/tune-cars.js                 # mede 0-100, retomada, final e frenagem de cada carro
index.html?bot=normal[&rota=parque]     # piloto-robô dirige sozinho (cuidadoso | normal | apressado), para assistir/depurar
```

**Piloto-robô** (`src/debug/autopilot.js`, inerte até ser ligado; `ctx.autopilot.start({ profile, corridor })`): dirige só pelos
controles reais (`input.setVirtual` com modulação sigma-delta), com a física real e os efeitos de humor no volante; segue a rota
(GPS ou corredor do Parque), troca de faixa para cumprir a rota, respeita limite/curva/semáforo/faixa de pedestre, freia pelo que
está no caminho (corredor + previsão pela faixa do outro em balões) e usa H/R/F como um jogador. Perfis: `cuidadoso`, `normal`,
`apressado` (corre 35% acima, cola, ultrapassa, usa faixa de ônibus, passa no amarelo). Usado no `smoke` e no playtest em lote
(avança a simulação com `game.advance`, sem depender do FPS).

Sem CDN, sem downloads em runtime: texturas são geradas em canvas e toda geometria é procedural.
Lembre de rodar `npm run build` antes de commitar mudanças em `src/`, para `dist/` e `DaviTheDriver.html` não ficarem defasados.

### Publicar no GitHub Pages

O repositório já está pronto (`index.html` na raiz, caminhos relativos, `.nojekyll`). Para ativar: **Settings → Pages →
Build and deployment → Source: "Deploy from a branch" → Branch: `main` (ou o branch desejado), pasta `/ (root)` → Save**.
O jogo fica em `https://<usuario>.github.io/<repositório>/`. O repositório precisa ser público, ou a conta precisa
ter plano que ofereça Pages para repositórios privados.

## Arquitetura

### Convenções

- **Unidades:** metros, segundos, radianos. Velocidade interna em m/s; campos com `Kmh` no nome estão em km/h.
- **Eixos:** `+X` = leste, `+Z` = **sul** (norte = `-Z`), `+Y` = cima. Chão em `y = 0`.
- **Heading:** `forward = (sin h, cos h)`; `h = 0` aponta para o sul, `h = +π/2` para o leste. Virar à
  esquerda = `h` aumenta. Igual a `object3D.rotation.y = h` (modelos olham para `+Z`).
- **Direita** de um rumo `h`: `(-cos h, sin h)`. Lateral positivo = à direita.
- **Tempo:** simulação em passo fixo de 1/60 s (`update`), render desacoplado com interpolação (`frame`).

### Árvore

```
index.html               carrega dist/game.js (script clássico)
src/main.js              boot: cria tudo, monta ctx, registra módulos, inicia o laço; window.__davi = ctx
src/config.js            CONFIG, QUALITY (perfis), VEHICLES, MODES, PEOPLE, ROUTES
src/core/events.js       EventBus + EV (catálogo ÚNICO de nomes de eventos)
src/core/state.js        createState(), MODE (MENU/PLAYING/PAUSED/FINISHED), moodBars()
src/core/game.js         máquina de estados + orquestração de módulos
src/core/loop.js         passo fixo + render
src/core/input.js        teclado + ações virtuais (toque/testes)
src/core/collision.js    OBB/círculo 2D + StaticColliders (grade espacial)
src/core/math.js         clamp, damp, makeRng, smoothNoise...
src/render/renderer.js   WebGLRenderer, luzes, TIME_OF_DAY (manha/tarde)
src/render/cameraRig.js  câmera isométrica ortográfica
src/render/instancer.js  ChunkedInstancer / ChunkedMeshBuilder (culling por chunk)
src/render/geo.js        GeoBuilder (mescla primitivas com cor por vértice)
src/render/renderer.js   (+ shadow map que acompanha a câmera e ajuste automático de qualidade: view.autoQuality)
src/render/textures.js   texturas em canvas (chão, asfalto, calçada, grama, fachadas, atlas de placas + placas de trânsito, blob)
src/render/materials.js  makeMaterial(quality, params), makeMaskedMaterial (cor da instância só onde paint=1), makeFacadeMaterial, LIVE_SHADOW
src/world/mapData.js     O MAPA COMO DADOS (nós, vias, balões, semáforos, faixas, ônibus, fiscalização...)
src/world/roadNetwork.js RoadNetwork (grafo de faixas + consultas) e LaneWalker — sem three.js
src/world/roadMesh.js    malha das vias
src/world/signals.js     SignalController (ciclo + visual)
src/world/scenery.js     cenário procedural (prédios com fachada, árvores por espécie, postes, bancos, lixeiras, guard-rails)
src/world/props.js       geometrias instanciadas: ipê, mangueira, jaqueira, palmeira, cerrado, arbusto, poste, banco, lixeira, abrigo
src/world/landmarks.js   marcos (Torre de TV, Estádio, Catedral, Congresso, STJ, Memorial JK...)
src/world/world.js       monta o mundo; colisores; placas; getMinimapData()
src/player/physics.js    física arcade pura (stepVehicle, engineAccel, defaultMods)
src/player/vehicleModels.js  modelos Kwid e Cactus + modelos de TRÁFEGO e PESSOAS instanciáveis (ver "Modelos")
src/player/player.js     Player (física + colisão estática + state.player)
src/game/trip.js         viagem: largada, cronômetro, GPS, seta, chegada
src/systems/traffic.js   trânsito: IA de veículos, pedestres, frutas na pista, radares/agentes da viagem (lógica em systems/traffic/)
src/systems/rules.js     multas, colisões, pontuação e state.result (lógica pura em systems/rules/: fines, score, result, balance)
src/systems/mood.js      ansiedade/estresse, efeitos no volante, ações, falas (lógica pura em systems/mood/: model, lines, balance)
src/systems/rules/traffic-adapter.js  adaptador defensivo p/ ctx.modules.traffic (valores neutros se faltar algo)
src/systems/fx.js        STUB  efeitos visuais
src/systems/audio.js     STUB  áudio
src/ui/ui.js             UI: menu, HUD, pausa, fim, recordes, toque (módulos auxiliares em src/ui/*; CSS em index.html)
assets/                  arquivos do usuário (ex.: davi.png, a foto do menu)
tools/                   smoke.cjs, shots.cjs, test-roads.js, tune-cars.js
```

### Contrato de módulo

Todo módulo plugável é um objeto registrado em `main.js` (ordem de `update`: traffic → rules → mood → fx → audio → ui):

```js
export default {
  name: 'traffic',
  init(ctx) {},              // 1x, mundo pronto
  reset(ctx, trip) {},       // início de cada viagem (trip = ctx.state.trip já preenchido)
  update(dt, ctx) {},        // passo fixo (1/60 s), SÓ em PLAYING (após player.update)
  frame(dt, alpha, ctx) {},  // todo frame de render, qualquer estado (dt real, alpha de interpolação)
};
```

Cada agente edita **só o seu arquivo** em `src/systems/` ou `src/ui/`. Para trocar a UI, reescreva `src/ui/ui.js`
inteiro mantendo `name: 'ui'`: ela só lê `ctx.state`, escuta eventos e emite `EV.REQ_*`.

### `ctx` (contexto compartilhado)

| campo | o que é |
|---|---|
| `THREE` | three.js (mesma instância do bundle) |
| `CONFIG, QUALITY, VEHICLES, MODES, ROUTES, EV` | tabelas de `config.js` / eventos |
| `quality` | perfil de qualidade em uso (objeto de `QUALITY`) |
| `state` | estado compartilhado (abaixo) |
| `events` | `EventBus`: `on(name, fn) → off`, `once`, `off`, `emit(name, payload)` (síncrono) |
| `input` | `Input`: `axes {throttle, brake, steer}`, `handbrake`, `held{...}`, `setVirtual(action, bool)`, `enabled` |
| `view` | `{ renderer, scene, lights:{hemi,sun}, setTimeOfDay(name), tintables, quality, applyLiveQuality(q) }` |
| `cameraRig` | `CameraRig` (ganchos abaixo) |
| `net` | `RoadNetwork` (malha viária) |
| `world` | `{ colliders, signals, landmarks[], stats, materials, getMinimapData() }` |
| `colliders` | `StaticColliders` (`add(c)`, `query(x,z,r,outArr)`) |
| `signals` | `SignalController` |
| `player` | `Player` |
| `trip` | `Trip` |
| `collision` | helpers: `makeOBB, makeCircle, makeContact, obbVsObb, circleVsObb, obbVsCircle, circleVsCircle, collide, StaticColliders` |
| `game` | `Game`: `startTrip(routeId, mode)`, `pause()`, `resume()`, `finish(reason, details)`, `toMenu()`, `advance(seconds)`, `mode` |
| `modules` | módulos por nome |

### Estado compartilhado (`ctx.state`)

```js
{
  mode: 'MENU'|'PLAYING'|'PAUSED'|'FINISHED',  finishReason: 'chegou'|'bateu'|'desistiu'|null, finishDetails,
  quality: 'leve',
  trip: { id, routeId, mode: 'davi'|'carona'|'perigo', vehicleId: 'kwid'|'cactus', driver: 'davi'|'dono',
          passenger: 'davi'|'dono'|null, label, from, to, timeOfDay: 'manha'|'tarde', elapsed (s),
          distToDest, routeDistLeft, guideX, guideZ, guideBearing, destX, destZ, destRadius, arrived },
  player: { x, z, heading, vx, vz, speed (m/s, <0 ré), speedKmh, steer, throttle, brake, handbrake,
            braking, reversing, turbo (0..1), offroad, inJunction, roadName, speedLimitKmh,
            laneId, laneKind: 'normal'|'bus'|null, onBusLane, collisions, vehicleId },
  mood: { driver:    { who, anxiety, stress, floor, active },     // dono dos valores: mood.js
          passenger: { who, anxiety, stress, floor, active } },   // who/active definidos pelo núcleo
  fines: [], fineTotal: 0,                                         // dono: rules.js
  score: { points, multiplier, inZone, zoneLo, zoneHi },           // dono: rules/mood; barras 0..100; zoneHi<=zoneLo = sem zona
  settings: { volume 0..1, muted, retro, quality },                // dono: UI (persiste em localStorage); áudio/fx só LEEM
  result: null | { reason, time, points, grade, title, fines[], crash{...,sinistroNo?}, yearsLost },  // dono: rules; preencher ANTES de REQ_FINISH
  actions?: { horn, breathe, curse, flash }  // dono: mood.js; cada { cooldown (s restantes), max (s) }; a UI desenha o recarregamento se existir
  traffic: { seed: null|n, tripSeed, active, peds },  // seed fixo = viagem reproduzível; null = sorteia por viagem. tripSeed (o núcleo sorteia/fixa
                                                      // no startTrip) alimenta TODO sorteio de jogo: trânsito, humor, falas, regras, estacionamento
  time: { sim, real, frame },
}
```

`mood.driver.who`/`mood.passenger.who` vêm de `MODES[mode]`: davi → driver=davi, passageiro inativo;
carona → driver=dono, passenger=davi; perigo → driver=davi, passenger=dono. Efeitos no volante seguem o **driver**.

### Eventos (`EV` em `src/core/events.js`)

| nome | quem emite | payload |
|---|---|---|
| `STATE_CHANGE` | núcleo | `{ from, to, reason }` |
| `TRIP_START` | núcleo | `{ tripId, routeId, mode, label, timeOfDay, from, to, vehicleId, driver, passenger }` |
| `ARRIVED` / `TRIP_FINISH` | núcleo | `{ tripId, time }` / `{ tripId, mode, reason, time, details }` |
| `REQ_START` / `REQ_PAUSE` / `REQ_RESUME` / `REQ_MENU` / `REQ_FINISH` | qualquer um (UI, regras) | `{ routeId, mode }` / `{}` / `{}` / `{}` / `{ reason, details }` |
| `HORN`, `HORN_END`, `BREATHE`, `CURSE` | núcleo (input, só em PLAYING) | `{ source: 'player' }` |
| `OFFROAD` | núcleo | `{ on, x, z }` |
| `COLLISION` | núcleo (estáticos) / traffic (veículos, pedestres) | `{ a:'player', b:'static'|'vehicle'|'pedestrian', kind, impactKmh, x, z, nx, nz, otherId }`; traffic acrescenta `id, persona, playerAtFault, otherKmh, brakeChecked` (veículo) / `id, playerAtFault, crosswalkId, soft` (pedestre; `kind` = `pedestre`\|`corredor`\|`ciclista`; `soft` = encostou abaixo de 8 km/h, "quase") |
| `SIGNAL_CHANGE` | núcleo | `{ signalId, group, state }` |
| `FINE` | rules | `{ code, label, amount, points, x, z }` |
| `NEAR_MISS` | traffic | `{ id, otherId, kind, b:'vehicle'\|'pedestrian'\|'cyclist', dist (m de folga), relKmh, x, z }` |
| `OVERTAKEN` / `PLAYER_OVERTOOK` | traffic | `{ id, otherId, kind, persona, side:'left'\|'right', relKmh }` (no `PLAYER_OVERTOOK`, `'right'` = jogador passou pela direita) |
| (todo evento de veículo do trânsito) | traffic | também `onPhone, noSignal, speeder, revenge, filtering, stjBus` do veículo envolvido (falas de situação) |
| `CUT_OFF` ("fechado") | traffic | `{ id, otherId, kind, persona, gap, ring }` (`ring` = entrada/dentro de rotatória) |
| `HONKED_AT` / `FLASHED` / `TAILGATED` | traffic | `{ id, otherId, kind, persona, x, z }` / `{ id, otherId, kind, persona }` / `{ ..., gap }` |
| `PEDESTRIAN_CROSSING` | traffic | `{ crosswalkId, x, z, dist, on, pedCount, signalized }` — `on:true` 1x por travessia na faixa à frente do jogador, `on:false` quando esvazia |
| `HAZARD_HIT` | traffic | `{ id, kind:'manga'\|'jaca', x, z, speedKmh, wheel }` (o escorregão é de humor/regras) |
| `MOOD_CHANGE`, `MOOD_PEAK`, `PASSENGER_SAY` | mood | `{ who, ... }` / `{ text, intensity }` |
| `CAMERA_SHAKE` | qualquer um | `{ amount, duration }` (o núcleo aplica no `cameraRig`) |
| `SETTINGS_CHANGE` | **ui** (única que escreve `state.settings`) | `{ volume, muted, retro, quality }` — emitido no boot e a cada mudança |
| `FLASH` | núcleo (input, tecla F, só em PLAYING) | `{ source: 'player' }` |
| `SIGNAL_RUN` | rules | `{ signalId, group, state:'red'\|'yellow', x, z, seen }` (passou do semáforo; multa só se `seen`) |
| `TAKEOVER` | mood (perigo) | `{ who:'dono' }` → rules encerra com `'tomouOCarro'` |
| `SAY` | mood/traffic/rules | `{ who:'davi'\|'dono', role:'driver'\|'passenger', text, tone:'anx'\|'stress'\|'calm'\|'panic', ttl (s) }` → balão de fala (`PASSENGER_SAY` também vira balão do passageiro) |

### Malha viária (`ctx.net`, `src/world/roadNetwork.js`)

Dados em `mapData.js` → grafo de **faixas** (inclui *conectores* dentro de cruzamentos/balões, então seguir o
trânsito = andar em `lane.pts` e escolher um de `lane.next`).

- `Node { id, x, z, type: 'junction'|'ring'|'edge'|'deadend', radius, segs[], signalId, roundaboutId, approaches[] }`
  (`edge` = borda do mapa: fonte/sumidouro de tráfego; lista em `net.edgeNodes`).
- `Segment { id, name, from, to, pts, cum, length, lanesF, lanesB, laneW, median, limitKmh, kind, layer, edgeL, edgeR, oneWay, laneIdsF[], laneIdsB[], busLane }`.
- `Lane { id, segId|null, nodeId|null, dir (+1|-1|0 conector), index (0 = mais à direita), pts (Float64Array x,z...), cum, length, limitKmh, kind: 'normal'|'bus', next[], prev[], isConnector, turn, signal: {signalId, group}|null (parar em lane.length), crosswalks: [{id, s}], busStops: [{id, s}], name, layer }`.
- Listas: `signals[]` (aproximações com `stopX/Z`, `poleX/Z`, `group`), `crosswalks[]`, `busStops[]` (`laneId, s, x, z, heading, shelterX/Z`),
  `enforcementSpots[]` (`type: 'speed'|'redLight'|'busLane'`, `segId, dir, laneIds, laneS, x, z, heading, limitKmh, poleX/Z`; `redLight` também tem `signalId, group`),
  `radarSpots[]` (só `speed`), `agentHideouts[]` (`x, z, facing, cover, segId, dir, s0, s1, laneIds, roadX/Z`), `spawnPoints[]` (`laneId, s, x, z, heading`),
  `gradeSeparations[]` (`over, under, x, z`), `roundabouts[]`, `zones`, `starts`, `bounds`.

Consultas (nenhuma aloca se você passar `out`):

| método | retorno |
|---|---|
| `nearestLane(x, z, out, headingHint?, maxAngle=1.75, includeConnectors=true)` | `{ lane, laneId, s, x, z, dist, lateral, heading, kind }` ou `null` (busca ~40–80 m) |
| `laneAt(x, z, heading, out)` | idem, só faixas no sentido do heading |
| `roadInfoAt(x, z, out)` | `{ onRoad, inJunction, nodeId, segId, name, limitKmh, lateral, segDist }` (canteiro ≠ pista) |
| `isOnRoad(x, z)` / `speedLimitAt(x, z, heading?)` / `isBusLaneAt(x, z, heading?)` | bool / km/h / bool |
| `clearance(x, z, range=80)` | distância até a borda de asfalto (negativa = na pista) |
| `sampleLane(lane, s, out)` | `{ x, z, tx, tz, heading }` |
| `projectOnLane(lane, x, z)` / `projectOnSegment(seg, x, z, out)` | `s` / `{ s, lateral, dist, x, z, tx, tz }` |
| `planRoute(fromLaneId, fromS, toLaneId | laneIds[], outArr?)` | `laneIds[]` (Dijkstra por tempo; inclui trocas de faixa) |
| `routeLength(route, fromS, toS)` · `siblingLanes(lane)` · `laneForZone(zoneId)` · `snapStart(pose)` | — |
| `isGradeSeparated(segA, segB)` | veículos nesses segmentos não colidem no cruzamento em desnível |
| `createWalker(laneId, s, rng)` | `LaneWalker`: `advance(ds)`, `x, z, heading, lane, s, ended, remaining`, `route`, `chooser(lane, nextIds, rng)`, `peekNext()` |
| `planRouteVia(fromLaneId, fromS, viaSegIds[], toLane(s), outArr?)` | rota forçada por waypoints (ex.: `net.routeCorridors.parque['stj-casa']`) |
| `routeNames(route)` | nomes das vias da rota, sem repetição (para HUD/relatórios) |

Funções puras exportadas: `samplePts`, `offsetPolyline`, `smoothPolyline`. Teste: `npm test`.

**Manga garantida (fase 5):** em toda viagem, cada rota (GPS e Parque) que passa pela Jaqueiras recebe um cacho de manga sob uma
mangueira na faixa que o caminho usa (e outro 7 m adiante na faixa ao lado do mesmo sentido), além das sorteadas; `traffic.hazardAhead()`
faz o Davi gritar "manga!" ao avistar. Teste: 20 sementes × 2 rotas × 2 sentidos × 2 estacionamentos.

**Dados para trânsito/perigos (fase 2):**
- `net.fruitSpots[]` — candidatos a **fruta no asfalto** ao longo da Av. das Jaqueiras:
  `{ id, segId, dir, s, x, z, heading, fruit: 'manga'|'jaca', treeX, treeZ, lanes: [{ laneId, s, x, z }] }` (`lanes[0]` = faixa da
  direita, rente à árvore). Quem sorteia/ativa e o efeito é do trânsito/regras.
- `net.avenueTreeSlots[]` — `{ segId, s, side, x, z, kind }`: onde o cenário plantou as mangueiras/jaqueiras SÓLIDAS (colisor `tree`)
  rente ao meio-fio (definido em `MAP.avenueTrees`).
- `net.routeCorridors` — `{ eixo: { label, 'casa-stj': [segIds], 'stj-casa': [...] }, parque: {...} }` (as 2 rotas × 2 sentidos).
- Trechos para mecânicas: retas livres no Eixo (Via S1/N1, 70 km/h, pardais), faixa ÚNICA sem ultrapassagem no anel do Parque
  (`parque`, 1+1 faixas), rotatórias com fluxo (Cruzeiro, Três Poderes, Quarta/Terceira/Segunda Avenida, EPIG), semáforos com faixa
  de pedestre na Via S3/SCS/SAUS, faixas de ônibus ao lado de faixa normal (Eixo Via S1, `s3_mid`, `s3_scs`).

**Topologia (fase 3).** O Sudoeste só se liga ao resto da cidade pela Av. das Jaqueiras (e a Primeira Avenida, que vai ao
Balão da EPIG); EQRSW e Comércio Local são sem saída (senão o GPS cortava caminho). O Eixo Monumental (Vias S1/N1) tem 5 faixas
por sentido (4 + ônibus à direita, linha branca contínua, "ÔNIBUS"/"SÓ" e "Via S1"/"Via N1" pintados no chão, limite pintado antes
dos semáforos). **Entorno do STJ** (mapa real comprimido): a quadra fica entre a **SAFS Quadra 2** (Via S2) ao norte, a avenida
(L2 / St. de Adm. Federal Sul) a oeste e a transversal (Via S3) ao sul. Balões: **SAFS Q. 2 × avenida** (`R_Q2`), **Rotatória 1**
(`R_STJ1`, avenida × transversal, com ponto de ônibus), **Rotatória 2** (`R_STJ2`, canto leste: Estacionamento Leste, lateral e
acesso à Via L4), **Rotatória 3** (`R_STJ3`, perto do TSE), e dois ao sul (`R_STJN1` L2 × L3, `R_STJN2` na Via L4 — dirigíveis,
fora das rotas do GPS). Estacionamentos: `stj_norte` (zona `stj_norte`/`stj`) e `stj_leste` (laço; zona `stj_leste`), com
carros parados instanciados. Rotas que o GPS devolve (testadas em `tools/test-roads.js`):
- Saída de casa (fase 4): o carro larga **estacionado na vaga** em frente ao prédio (`vaga_casa`, de frente para a rua), sai para a rua
  da QRSW 2 para oeste, vira à direita na **Marginal da Av. das Jaqueiras** (`marg_jaq`, mão dupla estreita, gramado e terreno de terra
  vermelha ao lado) e entra na Jaqueiras (2 + 2 faixas, canteiro arborizado) em `J_JAQ2`, sem semáforo. A volta é o inverso, até a vaga livre.
- Casa → STJ Norte (Eixo): QRSW 2 › Marginal › Jaqueiras › Praça do Cruzeiro › Eixo (Via S1) › descida da Rodoviária › Via S2 › Balão da SAFS Q. 2 › avenida › Estacionamento Norte (ponta oeste). Variante: SAFS Q. 2 › lateral leste › ponta leste.
- Casa → STJ Leste: … › Eixo (Esplanada) › Três Poderes › Via S2 › lateral do STJ › Rotatória 2 › Estacionamento Leste (ou pela avenida › Rotatória 1 › transversal › Rotatória 2).
- Volta: do mesmo estacionamento, pelo caminho inverso (Eixo pela Via N1 / alça da Rodoviária).
- Parque (corredor `planRouteVia`): QRSW 2 › Jaqueiras › Primeira Avenida › Balão da EPIG › anel do Parque › Via S3 (SCS, SAUS) › Rotatória 3 › Rotatória 1 › STJ, e o inverso.
Trevo Eixo × Eixão: `alca_eixao` (Eixo → Eixão Sul) e `alca_rodo` (Via S2 → Eixo/Via N1, em desnível sob a Via S1).
Ids que mudaram na fase 2a: `eixo_s1_c` foi dividido em `eixo_s1_c0` (W3 → saída do Eixão) + `eixo_s1_c` (→ Rodoviária);
`eixo_n1` em `eixo_n1_e` + `eixo_n1`; `eixao_n` em `eixao_n` + `eixao_n2`; `s2_a` em `s2_alca` + `s2_a`; `qrsw2` em `qrsw2` + `qrsw2_e`;
`jaq_s` em `jaq_s` + `jaq_s2`; `terceira_e` agora é interna (não chega mais à EPIG). Novas: `segunda_w/e`, `quarta_av_s`, `terceira_m`,
`rua_q1`, `rua_q34`, `rua_q56`, `clsw`.

### Modelos (`src/player/vehicleModels.js`)
Tudo procedural, cor por vértice + atributo `paint` (1 = lataria/camisa: recebe a cor da instância; 0 = vidro, pneu, luzes).
- **Jogador:** `buildVehicleModel(VEHICLES[id], quality, blobTexture)` → `{ root, body, wheels (InstancedMesh 4), wheelSlots, brake, reverse,
  shadow, wheelR, triangles }`. Carroceria "lofted" (capô, para-brisa, colunas, teto, caixas de roda recortadas), vidros em malha
  própria (Phong com brilho), rodas pneu+aro que giram/esterçam (player.js), luz de freio (`brake.visible`) e de ré (acende sozinha
  quando o carro anda para trás). Kwid ≈ 2,7 mil tri, Cactus ≈ 3,0 mil tri (com as 4 rodas).
- **Tráfego:** `buildTrafficModel(kind)` com `kind` ∈ `sedan, hatch, suv, picape, autoescola, onibus, mudanca, moto` →
  `{ geometry (rodas fixas embutidas), bodyGeometry (sem rodas), wheelGeometry, wheelSlots, wheelR, length, width, height,
  obb: { hx, hz }, massKg, colors[], triangles }` (moto 600, carros 870–970, ônibus 1.080 tri). Uso:
  `const m = buildTrafficModel('sedan'); const im = new THREE.InstancedMesh(m.geometry, makeVehicleMaterial(), N); im.setColorAt(i, cor)`.
  Modelos olham para +Z (rotation.y = heading), base em y = 0; colisão = OBB `length × width`. `TRAFFIC_MODELS[kind]` traz as dimensões.
- **Pessoas:** `buildPersonModel('pedestre'|'agente', variante)` → `{ geometry, radius, height, shirts[], triangles }` (170–250 tri).
  Pedestre: a cor da instância pinta a camisa. Agente de trânsito: colete verde-limão com faixas refletivas e boné (cores fixas).
- `makeVehicleMaterial()` (Phong + máscara de pintura) serve para carros, motos e pessoas instanciados (1 draw call por tipo).
- Vitrine para conferir: `ctx.world.debugShowcase(x, z)` (usada por `tools/shots.cjs`).

### Semáforos (`ctx.signals`)
`getState(signalId, group)` → `'green'|'yellow'|'red'`; `stateForLane(lane)`; `timeToChange(signalId)`;
`isPedWalk(signalId, group)`; tempos em `SIGNAL_TIMING`. Emite `EV.SIGNAL_CHANGE`. A **regra** de multa é de `rules.js`.

### Jogador (`ctx.player`)
- `vehicle` (linha de `VEHICLES`), `phys` (`x, z, heading, vx, vz, speed, lateral, steer, yawRate, spool, latAccel, longAccel, offroad, braking`).
- **Ganchos de humor:** `player.mods = { steerNoise, steerGain, steerDelay, throttleBias, accelMul, brakeMul, maxSpeedMul, gripMul }` (neutros em `defaultMods()`; resetados a cada viagem).
- Colisão: `player.obb` (`{x,z,hx,hz,angle}`, atualizada a cada passo), `player.radius`, `getOBB(out)`. Colisão com estáticos já resolvida e emitida (`EV.COLLISION`, `b:'static'`, `kind` = `building|tree|pole|guardrail|landmark|busStop|wall|water`).
- `player.frozen` (não simula), `setVehicle(id)`, `reset(pose)`.

### Veículos e modos (`config.js`)
`VEHICLES.kwid` / `VEHICLES.cactus`: dimensões reais (caixa de colisão = `length × width`), `real` (ficha técnica),
`game.zeroTo100` (alvo), `maxSpeed`, `engineAccel`, `torqueCurve [[km/h, mult]...]`, `turboBoost/turboLag/turboSpoolRate`,
`brakeDecel`, direção (`maxSteerLow/High`, `steerRate`), aderência (`grip`, `handbrakeGrip`, `offroadGrip`),
instabilidade (`unstableFromKmh`, `highSpeedGripLoss`, `instability`), `massKg`, `bodyRoll`.
Medido com `tools/tune-cars.js`: Kwid 0-100 9,9 s, final 156 km/h; Cactus 0-100 5,7 s, final 212 km/h.
`MODES[id] = { vehicle, driver, passenger, label, description }`. `ROUTES[id] = { from, to, timeOfDay, start, destZone }`.

### Câmera (`ctx.cameraRig`)
Ortográfica isométrica alta (`CONFIG.camera`). Ganchos: `shake(amount, duration)`, `zoomMul` (multiplicador externo),
`offsetX/offsetZ`, `lookAt(x, z, view)` (modo livre), `mode: 'follow'|'orbit'|'free'`, `camera` (THREE).

### Viagem (`ctx.trip`)
GPS recalcula a cada 0,5 s (`state.trip.guideX/Z`, `routeDistLeft`, `trip.route` = laneIds); seta 3D sobre o carro;
anel + coluna de luz no destino. Chegada = entrar no raio da zona → `ARRIVED` + `finish('chegou')`.
Estacionamento do STJ por viagem: `state.trip.parking` (`'norte'|'leste'`, sorteado por `chooseParking` em `core/game.js` — com
`state.traffic.seed` fixo é reproduzível; `REQ_START`/`startTrip(route, mode, { parking, via })` forçam) e `state.trip.arrivalVia`
(waypoints que o GPS respeita, `planRouteVia`, até passar por eles). O destino aparece no HUD (`state.trip.destLabel`) e no minimapa.
O GPS soma `net.laneExtraCost` (custo extra por faixa, escrito pelo trânsito no congestionamento) e por isso pode sugerir desvio.

### Minimapa
`ctx.world.getMinimapData()` → `{ bounds, roads: [{id, name, kind, width, oneWay, pts: Float32Array}], roundabouts, landmarks, zones, signals }`.
Posição/rumo do jogador em `state.player`, destino em `state.trip.destX/Z`, rota sugerida em `ctx.trip.route`.

### Perfis de qualidade (`QUALITY` em `config.js`; em uso: `ctx.quality`, nome em `state.quality`)

| chave | efeito | ao trocar |
|---|---|---|
| `pixelRatioMax` | teto do devicePixelRatio | tempo real (`view.applyLiveQuality`) |
| `antialias` | MSAA do contexto | **recriar renderer** |
| `postprocess` | gancho de pós-processamento (`null` no leve) | **recriar renderer** |
| `materialKind` | `lambert`/`basic`/`standard`(TODO) | **reconstruir mundo** |
| `shadows` | `none`/`blob`/`shadowmap` (leve = `shadowmap`; o ajuste automático pode cair para blob em tempo real) | **reconstruir mundo** |
| `shadowMapSize`, `shadowRange` | lado do shadow map (1024) / meia-largura do frustum que segue a câmera (m) | **recriar renderer** |
| `autoQuality` | `{ enabled, minFps, warmupSec, windowSec, upFps, upHoldSec }` — ver "Ajuste automático" | tempo real |
| `textureSize`, `anisotropy`, `signTextureWidth` | resolução das texturas de canvas | **reconstruir mundo** |
| `chunkSize` | chunk de culling | **reconstruir mundo** |
| `density.{trees,scrub,lamps,buildings,guardrails,furniture}` | densidade do cenário | **reconstruir mundo** |
| `vehicleLOD`, `landmarkLOD` | `high` no leve (informativo; os modelos atuais são os "high") | **reconstruir mundo** |
| `cameraFar`, `viewMul` | distância de visão / abertura do zoom | recriar `CameraRig` / tempo real |
| `maxTrafficVehicles`, `maxPedestrians`, `maxParticles` | tetos para traffic/fx | tempo real (respeitados pelos módulos) |
| `fxSkidMax` | pool de marcas de pneu (fx.js) | ao (re)criar o módulo |
| `fxGrain` | granulação do filtro retrô (fx.js) | ao (re)criar o módulo |

Hoje a troca de perfil é por `?q=` na URL (recarrega tudo). `hd` está declarado com `implemented: false`.

### Orçamento de performance (perfil leve)
Alvo: Intel UHD 770 a 1080p — até ~350 mil triângulos e ~120 draw calls na câmera de jogo (contando a passada de sombra).
Um shadow map direcional 1024 (PCF) com frustum de ±48 m que segue o ponto focado; só objetos perto projetam. Sem pós-processamento,
Lambert (cenário) / Phong (carros), InstancedMesh por chunk de 200 m, pixelRatio ≤ 1,5, sem alocação por passo no caminho quente.
Medido (SwiftShader, 1280×720, câmera de jogo): ~55–105 draw calls, ~130–270 mil triângulos (ver relatório da fase 2a).

Medido na fase 3 (SwiftShader 1280×720, câmera de jogo, sombra projetada ligada, pool de trânsito cheio = 56): Sudoeste 100–104
draw calls / 290–298 mil tri; SCS 114–122 / 282–313 mil; Eixo 64–65 / 176–177 mil; STJ 83–89 / 163–188 mil; Jaqueiras 83–90 /
281–297 mil (o segundo número é com o zoom máximo de alta velocidade). Simulação por passo de 1/60 s ≈ 0,8 ms (trânsito ~0,5,
jogador ~0,13, GPS ~0,12 em média com picos a cada 0,5 s, humor ~0,05, regras ~0,01). Os carros do trânsito usam sombra blob:
com eles projetando no shadow map o SCS passava de 350 mil triângulos (`SHADOW_TRAFFIC` em `traffic/render.js`).
Medido na fase 5 (pool 88, Eixo mais cheio, câmera de jogo, SwiftShader): pior caso Via S3 107 draw calls / 247 mil tri; Parque 96 / 311
mil (o anel ficou mais curto: floresta e fileira de árvores afinadas para caber); Sudoeste 96–110 / 276–311 mil; passo 0,16 ms em média.
Medido na fase 4 (robô dirigindo as rotas, câmera de jogo, pool de trânsito 64, SwiftShader 1280×720): pior caso no Sudoeste/QRSW 2
111 draw calls / 331 mil tri; Via S3/SCS 101–103 / 250–306 mil; Parque 100 / 333 mil; Eixo 92–94 / 232 mil; STJ 70–87 / 228–242 mil.
Passo de simulação 0,15 ms em média (trânsito 0,10 ms); ~0,4 % dos passos passam de 4 ms (pausas de GC do headless, não de um sistema).
Prédios/marcos/caixas entre a câmera e o carro ficam pontilhados ("screen-door", `OCCLUSION` em `render/materials.js`): o jogador nunca
some atrás de prédio.

**Ajuste automático** (`ctx.view.autoQuality`, em `render/renderer.js`): mede o FPS depois de `warmupSec`; média de `windowSec` abaixo
de `minFps` (50) desce um degrau: `0 completo → 1 sem sombra projetada (sombras blob) → 2 resolução reduzida (pixelRatio × 0,75)
→ 3 cenário reduzido (some capim/arbustos/bancos, a visão encurta 30% e o pool do trânsito cai para 60%)`. O degrau atual aparece
em Opções. Sobe um degrau só após `upHoldSec` acima de `upFps` e
nunca para um degrau do qual já caiu 2 vezes (histerese). Estado público: `view.autoQuality.{step,label,fps,history}`, espelhado em
`state.qualityAuto = { step, label, fps }` quando muda (para a UI). `view.autoQuality.set(n)` força um degrau.

## Regras e humor (`src/systems/rules.js`, `src/systems/mood.js`)

Toda constante de balanceamento está em **`systems/mood/balance.js` (`MOOD_BALANCE`)** e **`systems/rules/balance.js` (`RULES_BALANCE`)**
(também em `ctx.modules.mood.balance` / `ctx.modules.rules.balance`). Lógica pura e testada: `mood/model.js`, `mood/lines.js`,
`rules/fines.js`, `rules/score.js`, `rules/result.js`. Toda consulta ao trânsito passa por `rules/traffic-adapter.js` (roda com o stub).

- **Humor — duas barras DISTINTAS (fase 5):**
  - **Ansiedade** = poder correr e NÃO PODER por causa das **regras**: pista livre com ele abaixo do que quer por causa do limite (×1,7
    perto do pardal), via de limite baixo e vazia, sinal vermelho (pior com a pista vazia), pedestre na faixa, faixa de ônibus vazia ao
    lado, agente à vista, o relógio (fraco). Alivia **respirando (R)** e correndo.
  - **Estresse** = **gente dirigindo mal e trânsito ruim**: preso atrás de lento sem por onde passar (gatilho mais forte, cresce com o
    tempo e a proximidade; com faixa livre ao lado quase não sobe — vira a fala "muda de faixa!"; soma ansiedade só se uma regra proíbe
    passar), fila, congestionamento, fechada, ultrapassagem, sem seta, buzina, farol, cola, motoboy, multa, fina, raspão, manga. Alivia
    **xingando (X)**, **buzinando (H)**, piscando o farol para o lento sair, **passando quem travava** e correndo.
  - Sem acoplamento entre as barras. O HUD mostra, ao lado do nome da barra, o porquê de ela estar subindo (`state.mood.*.whyA/whyS`:
    "sinal", "pardal", "limite 40", "lento na frente", "fechado"...). Correlação medida entre as barras ao longo das viagens: ver relatório.
  - **Embalo** (`MOOD_BALANCE.speedRelief`): correr com pista razoavelmente livre (ou costurando com faixa livre ao lado) alivia as DUAS,
    até o piso: perto do limite um pouco; acima, proporcional ao excesso (100 numa via de 80: estresse −5/s, ansiedade −7,5/s). Cortar o
    embalo de repente ("tava tão bom") dá pico de ansiedade. Carona: o Leandro acelerando acalma o Davi (as barras dele não mudam);
    perigo: alivia o Davi ainda mais (×1,25) — e é o que apavora o Leandro. Estresse sobe com eventos do trânsito (ultrapassado, fechado — x1,7 em
  rotatória —, buzina, farol, cola, fina, multa, fruta, raspão) e desce com calma. Pisos: Davi 15 (12 de carona), dono 0 ao volante.
  Os alívios "naturais" (correr com pista livre, calma) param no **repouso** (`anx.rest` 26, `str.rest` 22): só respirar desce até o
  piso, então as barras não colam no piso sozinhas. **Congestionamento** (`MOOD_BALANCE.jam`): parado na fila sobe ansiedade E
  estresse juntos, crescendo com o tempo (substitui o "atrás de lento" enquanto durar); no carona o Davi reclama da rota; no perigo é
  quase um alívio para o dono. **Ônibus do STJ** fechando no balão: fala própria (e surto imediato do Davi passageiro no carona).
  Falas de multa por tipo (pardal, câmera do sinal, faixa de pedestre, faixa de ônibus, agente).
- **Faixa de ônibus para converter:** usar a exclusiva nos últimos `busLane.turnZone` (90) m antes de uma conversão à direita não
  conta (CTB); só multa o trânsito NA faixa (≥ 3 s, visto por radar `busLane` ou agente).
- **Faixa de pedestre ocupada** = alguém atravessando NA faixa (`crossing`/`down`); quem espera na calçada ou já saiu dela não conta.
- **Volante (`player.mods`, só quando o Davi dirige):** ansiedade → `throttleBias` (pé pesado: tendência a passar do limite/avançar o
  amarelo; só andando e sem freio), `steerNoise`; estresse → puxão para a esquerda colado num lento (aplicado em `player.phys.steer`, pois `mods` não tem viés de direção); estresse → `steerGain`,
  `steerDelay`, `brakeMul`, buzina/xingamento automáticos. Fruta (`HAZARD_HIT`): `gripMul`/ruído por ~1 s e um empurrão de rumo.
- **Ações:** H buzina (−estresse, provoca), R respira (−ansiedade em 2,5 s, tira o pé), X xinga (−20 na hora, +26 de rebote depois,
  provoca), F pisca o farol (`traffic.flashLead`). No modo carona as ações agem no Davi passageiro.
- **Carona:** Davi palpita a cada 2,5–5 s (às vezes só gesto, às vezes se contradiz), surta acima de 90 de estresse (xinga pela janela
  → `traffic.provoke`; rotatória = surto imediato); só os surtos/palpites sobem as barras do dono. **Perigo:** susto/pânico do dono
  (velocidade, cola, freada, curva, turbo, fina, raspão, sinal furado, fruta); reclamação sobe o estresse do Davi; as duas barras do
  dono ≥ 97 por 3 s → `'tomouOCarro'`.
- **Falas:** `EV.SAY` com `gesture` opcional; banco em `mood/lines.js`, cada fala com variante com palavrão e leve
  (`state.settings.profanity === false` usa a leve); sem repetir em sequência e com intervalo mínimo por personagem/banco.
  **Falas de situação** (`situationOf` em `mood/model.js`, bancos `sit*`/`ev*` do Davi motorista, `ps*` do Davi passageiro, `os*`
  do Leandro no perigo) narram o que está na tela: quem está na frente e por que não anda (`leadInfo().why`: autoescola que deixou
  morrer, celular no verde, ônibus no ponto, tio na esquerda...), pedestre na faixa, sinal fechando na pista livre, pardal, faixa de
  ônibus vazia, gramado, e os eventos citam quem causou (sem seta, motoboy, ônibus, revanche). Têm prioridade (`minGapHigh` 1,4 s);
  o enchimento (`filler`: resmungo, relógio, cruzeiro...) só preenche silêncio de `speech.fillerGap` (8 s). Ritmo medido: 11–16
  falas/min no davi/perigo, 17–19 no carona; a UI mostra no máximo 2 balões por lado.
- **Multas:** pardal (`speed`, 3 faixas, tolerância 7 km/h/7 %), vermelho (radar `redLight` ou agente vendo a linha de retenção),
  faixa de pedestre ocupada (sempre), faixa de ônibus (≥ 3 s e só se radar `busLane` ou agente viu; `traffic.revealAgent`). Agentes
  também multam excesso > 20 % no campo de visão. Sem repetir mesmo código a < 150 m em 15 s. Sem `traffic.radars`, usa os radares
  declarados no mapa (`net.enforcementSpots` com `s`).
- **Colisão:** atropelar pedestre (≥ `collision.pedSoftKmh`, 8 km/h) encerra; encostar abaixo disso é **"quase"**: susto (estresse do
  Davi, pânico do Leandro), o pedestre recua e reclama (mão levantada + aviso), −pontos e multa de faixa se foi na faixa. Veículo/estático
  ≥ `CONFIG.crashImpactKmh` encerra (`'bateu'`); abaixo disso é raspão (−pontos, +estresse/pânico) e nunca encerra.
- **Faixa de pedestre — critério espacial:** só é infração se, quando o carro cruza a linha, há pedestre atravessando NO corredor da
  faixa de rolamento do carro (meia largura `cwBand` 1,9 m) ou a até `cwAheadM` (2,4 m) de entrar nele, ou sinalizando na beira da
  calçada do lado do carro. Quem já passou da trajetória, está na outra pista além do canteiro ou terminou a travessia não conta, mesmo
  em cima da faixa pintada (`traffic.crosswalkBlockedAt(cid, x, z)`; a IA usa o mesmo critério para voltar a andar).
- **Fora da pista (art. 193, `code: 'offroad'`):** canteiro, gramado, calçada ou terreno: R$ 880,41 e 7 pontos, por videomonitoramento
  (ou pelo agente escondido, se ele vir). Carência: 2 s contínuos OU 15 m fora; reincide a cada 8 s ou 120 m (`RULES_BALANCE.offroad`).
  Vagas, estacionamentos (`MAP.parkingAreas`) e as zonas de largada/chegada são área permitida. No perigo, o Leandro entra em pânico
  enquanto o carro estiver no gramado.
- **Pontos:** zona de equilíbrio nas barras do Davi (20–55; carona: dono 0–12 e Davi ≤ 60) → 10 pt/s × multiplicador (sobe 0,12/s até
  4/3/6; base 1/1/1,5); estourar o teto corta o multiplicador pela metade. Fim: bônus de tempo (par = distância/45 km/h), −(pontos CNH×100
  + R$) por multa, batida mantém 35 %. `state.result.crash = { withWhat, excuse (causa impessoal), repairCost (só Cactus), repairItems,
  impactKmh, kind, cause, sinistroNo }`; `yearsLost` só no perigo.

## Trânsito (`src/systems/traffic.js`)

Lógica pura em `systems/traffic/sim.js` (sem three.js), elenco em `traffic/personas.js`, desenho em `traffic/render.js`.
Testes em Node: **`node src/systems/traffic/__tests__/traffic.test.js`** (`MINUTOS=10` para o teste longo; `VERBOSE=1` detalha).
Nada de id/nome/coordenada de via no código: tudo sai de `ctx.net` (tipos de via, faixas, conectores, balões, pontos, `fruitSpots`...).

- **Traços de motorista** (independentes da persona; `TUNING.traits` em `traffic/sim.js`, da pesquisa autodeclarada de motoristas
  brasileiros): `speeder` 59% (anda 5–25% acima do limite; os demais no limite ou abaixo; apressado/motoboy sempre), `onPhone` 38%
  (demora 1–3 s a mais no verde, velocidade irregular, oscila na faixa, reage mais tarde), `noYield` 27% (não para para quem ESPERA
  na faixa sem semáforo — quem já atravessa, todos respeitam; a IA nunca atropela), `noSignal` 23% (sem seta em troca de faixa,
  curva e balão). Contagem em `sim.stats.traits`.
- **Congestionamento** (0, 1 ou 2 por viagem; `TUNING.jamSpots/jamChances`): fila anda-e-para (≤ 18 km/h em onda) de ~70 m num trecho
  das rotas da viagem (Eixo antes da Rodoviária, S3/SCS, chegada/saída do Balão da EPIG, Jaqueiras, Via S2), com causa visível no fim
  (carro quebrado ou ônibus parado no acostamento com pisca-alerta), enchida quando o jogador se aproxima. Avisado num toast na largada,
  marcado em vermelho no minimapa e com custo extra no GPS (que pode sugerir desvio). Não engavetamento: a fila escoa; não nasce carro
  em faixa já com 3+ parados. API: `traffic.jams[]`, `traffic.inJam()`; `state.traffic.jams`/`jamSpot` forçam (testes).
- **Ônibus do STJ** (`_stjBusLogic`, ~42% das viagens, no máx. 1): quando o jogador circula numa das rotatórias do entorno do STJ, um
  ônibus institucional (azul, "STJ" na lateral, persona `onibusSTJ`, com seta em 80% das vezes) aparece na próxima entrada, à vista,
  e entra sem esperar brecha; a traseira varre para fora na curva (`_busSwing`). `CUT_OFF` com `ring: true, stj: true`; `NEAR_MISS`
  se passou raspando; `COLLISION` pela regra normal (boletim: "Um ônibus do STJ, na rotatória."). Teste: 5 sementes, piloto cuidadoso
  nunca bate e ninguém fica preso no balão.
- **Saída no verde:** reação 0,4–0,9 s (normal) e aceleração viva (IDM `a` 2,2–3,0); os atrasos não se empilham: OU reação, OU
  celular (`onPhone`, +0,8–1,5 s em 40 % das paradas), OU autoescola que "deixa morrer" (1 em cada 4 paradas, 1,8–2,8 s, com tranco e
  pisca-alerta). Buzina (H) ou farol (F) no carro parado no verde faz arrancar na hora (birra só de persona agressiva).
  Medido (1º carro da fila cruzar a linha): normal 3,3 → 2,3 s (pior caso 11,9 → 4,7 s); ônibus 8,1 → 5,2 s.
- **Eixo encurtado (fase 5):** `mapData.js` comprime a faixa entre a EPIG e a W3 (`SQUEEZE`: x −1000…−460 → −1000+300…−460) e anda
  300 m para leste com tudo a oeste dela; quem tem coordenada fixa (cenário, marcos, placas) usa `sqx()`. Via S1 1425 → 1125 m, anel do
  Parque 800 → 590 m. O Eixo não tem mais semáforo na W3 (quem vem da W3 dá a preferência).
- **Semáforos:** via principal (`MAP.signalMain`) com verde de 22 s e transversal 10 s (ciclo 40 s); ninguém entra no cruzamento
  sem espaço na saída; quem já entrou e ficou travado por outro carro também travado no cruzamento desocupa (ignora veículos por 1,6 s).
  A saída da QRSW 2 (marginal → Jaqueiras) não tem semáforo.
- **Presença na via do jogador** (`TUNING.flowPerLane`): repõe gente à frente, logo além da vista (distância cresce com a velocidade),
  contando pela via e sentido, e já povoa a próxima via mais movimentada do caminho (sair do balão para o Eixo e achar o Eixo cheio).
  Eixo: 4,5 por faixa em ~150 m à frente (janela que se estende além da borda de spawn) mais gente mais rápida nascendo logo ATRÁS da
  vista (`flowBehind`), nunca a menos de `flowNoSpawnR` (70 m) do jogador; em via de 3+ faixas quem é mais lento nasce à direita e quem
  corre à esquerda. Filas paradas FORA da vista (> 110 m do jogador há > 5 s) evaporam (`queueEvap*`), para o fluxo denso não virar
  engarrafamento fantasma no balão adiante. Pool do perfil leve: 88 veículos (fundo fora da vista: `todDensity` 0,6/0,7).
  A saída de casa (vaga, rua da QRSW 2, marginal) é calma por desenho (`TUNING.quietSegs`).
- **Preferência no balão:** o jogador no balão perto da entrada é sempre conflito para quem quer entrar (qualquer velocidade; antes um
  carro quase parado no balão parecia "longe" e a IA entrava em cima); quem já decidiu entrar desiste se o jogador chega. Na fusão de
  alça com via ("zíper") o jogador também entra na ordem de chegada. O ônibus do STJ continua entrando na marra.
- **Lento em trecho sem ultrapassagem** (anel do Parque): com fila colada atrás por 12–22 s (ou se pedirem passagem com farol/buzina),
  encosta no acostamento por ~7 s e a fila passa (ninguém fica atrás do mesmo lento a rota toda).
- **Pedestres:** travessias a ~1/3 da taxa antiga, em pequenos grupos (quem chega sozinho espera o grupo ou 6 s); depois que a faixa
  esvazia, 30 s de "vez dos carros"; logo depois de o jogador parar para um grupo, a faixa seguinte à frente dele não abre travessia
  (nunca duas paradas seguidas). Com semáforo, só atravessam no vermelho dos carros e se dá tempo de cruzar antes do verde deles.
  Passantes andam pelas calçadas sem atravessar (a cidade não fica vazia). Encostar devagar = "quase" (ver Regras).
- **Menu vivo:** no menu o trânsito roda em volta da Esplanada (jogador "fantasma" no gramado).
- **IA:** cada veículo é um `LaneWalker` com um caminho curto já sorteado (`path`). Longitudinal = IDM (seguimento suave) contra todos
  os obstáculos do caminho: veículo/jogador à frente (baldes por faixa), linha de parada no vermelho/amarelo (antes da faixa de pedestre
  colada no semáforo), faixa de pedestre com gente atravessando ou sinalizando, entrada de balão sem brecha (quem circula tem a vez;
  brecha por persona), ponto de ônibus, curva/limite menor adiante, ponto de conflito entre conectores que se cruzam (quem chega
  antes passa), fusão de dois conectores na mesma faixa ("zíper") e um cone geométrico (jogador fora da faixa, pedestres, cruzamentos).
  Troca de faixa estilo MOBIL com checagem de espaço (seta acesa); ninguém entra na faixa de ônibus (quem cai nela sai). Vigia de "preso":
  parado > 25 s sem motivo legítimo (vermelho, pedestre, ponto, jogador ou fila atrás deles) → some se longe, senão ignora o cone por 3 s.
  Decisões em fatias (1/15 da frota por passo); cinemática todo passo.
- **Elenco** (`PERSONAS`): normal, *tio de chapéu* (30–40 km/h na faixa da esquerda, não sai), autoescola (lenta, freia do nada,
  "deixa morrer" no verde), caminhão de mudança, ônibus (faixa exclusiva, para nos pontos 6–10 s), motoboy (corredor entre faixas,
  buzina), apressado (cola, pisca, ultrapassa — inclusive pela direita — e fecha). Mistura e densidade por `segment.kind`
  (`ROAD_TRAFFIC`: urbano cheio e variado, Eixo/Eixão rápido, local vazio); tarde = 100 % do pool, manhã = 80 %.
  Garantias: trecho longo de mão dupla com 1 faixa por sentido (o anel do Parque) ganha um lento à frente do jogador; ao circular num
  balão, de vez em quando alguém "fura" e entra na frente; metade da reposição nasce na via do jogador (à frente ou atrás, fora da vista).
- **Spawn/despawn:** pool fixo `quality.maxTrafficVehicles` / `maxPedestrians`; nasce a 135–330 m do jogador (fora da vista), some a
  > 385 m (ou > 250 m e já para trás de quem anda). Na largada pode nascer a partir de 26 m.
- **Reação ao jogador:** `provoke(amount, radius)` → irritação sobe por `temper`; > 0,55 vira revanche (buzina de volta, cola,
  ultrapassa e fecha, freada de birra). Buzina do jogador (`EV.HORN`, este módulo escuta) e `flashLead()` / cola do jogador no da
  frente por ~2,5 s → sorteio ponderado por persona: `yield` (sai da faixa), `brake` (freia de birra) ou `ignore`. A irritação geral
  (`provoke`) é chamada pelo humor, não por este módulo.
- **Pedestres:** aguardam na calçada, levantam a mão (sem semáforo) e atravessam quando os carros param/há brecha; com semáforo, só em
  `isPedWalk`; ~16 % atravessam correndo; os carros param (Brasília). Corredores/ciclistas pelo acostamento dos trechos sem ultrapassagem.
- **Por viagem (PRNG com `state.traffic.seed`/`tripSeed`):** radares ativos (`speed` 55 %, `busLane` 60 %, `redLight` 25 % dos
  `enforcementSpots`), 2–4 agentes nos `agentHideouts` (agachados atrás da cobertura; `revealAgent(id)` → vai à calçada com o
  bloquinho), 6–10 cachos de manga (e jaca às vezes) nos `fruitSpots`. A multa é de `rules.js`.
- **Colisão jogador × IA:** OBB×OBB, empurra o jogador para fora, impulso por massa (`massKg`), IA para com pisca-alerta;
  `playerAtFault` heurístico (bateu na traseira = jogador; levou na traseira / o outro trocava de faixa ou furou o balão = outro).
  Viadutos (`net.isGradeSeparated`) não colidem. Velocidade do jogador = `phys.vx/vz` (um piloto que teleporta com v = 0 atravessa
  carros e pode levar batidas de baixa velocidade).
- **API** (`ctx.modules.traffic`, objetos reutilizados): `vehicles`, `pedestrians`, `hazards`, `radars`, `agents`, `leadInfo()`
  (`{ id, kind, persona, gap, speed, closing, onPhone, noSignal, stalled, lane, laneCount, why }`, `why` = `'sinal'|'pedestre'|'morreu'|
  'celular'|'verde'|'fila'|'ponto'|'balao'|'quebrado'|null`), `crosswalkBlockedAt(cid, x, z)`,
  `rearInfo()`, `freeAhead()`, `neighbors(r)`, `crosswalkAhead()`, `provoke(a, r)`, `flashLead()`, `revealAgent(id)`, `stats()`;
  depuração: `debug.spawn(modeloOuPersona, metrosÀFrente, faixa±, opts)`, `debug.clear()`, `debug.spawnPed(cw, atravessarJá)`,
  `debug.setAutoSpawn(bool)` (desliga spawn/despawn automáticos), `debug.repopulate()`, `debug.sim`. Campos completos no topo de `traffic.js`.
- **Desenho:** 1 `InstancedMesh` por modelo de `TRAFFIC_MODELS` + luzes (freio, setas, pisca-alerta, farol piscando, "!" de buzina,
  mão do pedestre, bloquinho) + sombras blob + 2 pedestres + bicicleta + agente + frutas + pardal: 9–14 draw calls e ~20–45 mil
  triângulos visíveis com o pool cheio (malhas vazias ficam invisíveis). Som: `audio.vehiclePass` para os ~5 mais próximos.
- **Custo** (passo de 1/60 s, frota cheia de 40 + 24 pedestres): ~0,05–0,1 ms em Node, ~0,05–0,25 ms no Chromium headless.

## Interface (src/ui/)

`ui.js` é um módulo comum (`name: 'ui'`) que só lê `ctx.state`, escuta eventos e emite `EV.REQ_*`. Arquivos:
`faces.js` (rostos em pixel art COMO DADOS: paleta + matriz de strings por expressão — `calm`, `anx`, `stress`, `panic` — para o Davi e o Leandro, 24×24; avatar do menu 32×32), `menu.js` (menu), `hud.js` + `minimap.js` (HUD; DOM só muda quando o valor muda, minimapa a ~10 Hz), `end.js` (chegou / boletim de
ocorrência / desistiu / tomouOCarro), `panels.js` (Como jogar e Opções), `touch.js` (botões de toque, só em dispositivo de toque
ou com `?touch=1`), `storage.js` (opções e recordes em `localStorage`, tudo com try/catch e cópia em memória), `texts.js` (toda a
copy pt-BR), `pixel.js` (pixel art desenhada em canvas, sem imagens externas), `demo.js` (veja abaixo). O CSS inteiro fica em `index.html`
(unidade `em`, escala com a janela: 1em = 16 px a 1280x720). Camadas: `#fx-layer` (efeitos, z 5) abaixo de `#ui-layer` (UI, z 10).

- **Foto do Davi no menu:** coloque uma imagem em `assets/davi.png` (qualquer tamanho; quadrada fica melhor, é exibida com
  `image-rendering: pixelated`, então pixel art pequena, ex. 64x64 ou 128x128, é o ideal). Sem o arquivo aparece um avatar de capacete
  desenhado em canvas e a legenda "FOTO DO DAVI DE CAPACETE (em breve)". Obs.: em automação (`navigator.webdriver`) a sondagem do
  arquivo é pulada para não gerar erro 404 no console; use `index.html?foto=1` para forçá-la.
- **Recordes:** `localStorage`, chave `davi-the-driver:v1:records`, um registro por `modo|rota` (melhor pontuação e melhor tempo; só
  contam chegadas). Opções em `...:settings`. Se o storage estiver bloqueado (file:// em alguns navegadores) o jogo funciona igual,
  só não lembra entre sessões.
- **Modo de demonstração da UI:** `index.html?uidemo=1` (ou `uidemo=hot` para barras no talo) injeta humor, pontos, ações, multas, falas e toasts falsos
  enquanto `mood/rules/traffic` são stubs. Expõe `window.__uiDemo` (`freeze(t)`, `hot()`, `say({...})`, `fine()`, `finish(reason, {noResult})`).
  Nunca roda sem o parâmetro.
- **Para quem escreve `rules.js`:** preencha `state.result` *antes* de emitir `REQ_FINISH` (a UI lê no `TRIP_FINISH`, síncrono); o
  `reason` do resultado deve bater com o do fim. Sem `state.result` a UI monta a tela com `state.fines`/`state.score`/`trip.elapsed`
  e textos de reserva. `data-testid` estáveis: `menu`, `mode-{davi|carona|perigo}`, `route-{casa-stj|stj-casa}`, `start` (também `#ui-start`),
  `hud`, `pause`, `resume`, `restart`, `pause-menu`, `end-{chegou|bateu|desistiu|tomouOCarro}`, `again` (também `#ui-again`), `to-menu`.

### Áudio e efeitos (`src/systems/audio.js`, `src/systems/fx.js`; auxiliares em `systems/audio/` e `systems/fx/`)

- **Áudio** 100% Web Audio sintetizado. O `AudioContext` nasce no 1º gesto (pointerdown/keydown/touchstart) ou no `TRIP_START`;
  aba oculta suspende; pausa e mudo zeram o ganho mestre; limitador (DynamicsCompressor) no fim da cadeia.
  Lê `state.settings {volume, muted}` por polling e em `EV.SETTINGS_CHANGE` (se o nome não existir em `EV`, usa a string `'settings:change'`).
  API: `ctx.modules.audio.vehiclePass(x, z, kind: 'car'|'bus'|'moto'|'truck', speedMps, id?)` (chamar todo frame por veículo próximo;
  máx. 4 vozes, descarta o mais distante), `playSpeech(who, text, intensity)`, `unlock()`, `stats()` (diagnóstico).
  Escuta `PASSENGER_SAY` (e `EV.SAY` se existir), `FINE` (`by: 'agent'` toca apito), `HONKED_AT` (`x, z` opcionais para pan).
- **Efeitos**: `#fx-layer` (criado no init; fica logo antes de `#ui-layer`, senão logo após o canvas) com túnel/pulso (ansiedade do Davi),
  borda vermelha + veias (estresse/`MOOD_PEAK`), borda fria (pânico do dono em `perigo`), linhas de velocidade, flashes, filtro retrô
  (`state.settings.retro`, em tempo real; permanece visível no menu — os demais efeitos somem no MENU). Partículas num único
  `THREE.Points` (pool = `quality.maxParticles`) e marcas de pneu num único `InstancedMesh` (`quality.fxSkidMax`): +0 draw calls em
  repouso, +2 com partículas/marcas visíveis. Humor mostrado = o do Davi (peso 1 se dirige, 0,5 se vai de carona).
  `ctx.modules.fx.stats()` para diagnóstico. Respeita `prefers-reduced-motion`.
