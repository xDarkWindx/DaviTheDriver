# Davi, the Driver

Jogo de direção isométrico (three.js/WebGL) ambientado numa Brasília estilizada. Pegue o volante e leve o Davi
da **QRSW 2 — Sudoeste** (casa) até o **STJ** (SAFS), ou o caminho inverso: sem bater, sem multa e no menor tempo
possível, equilibrando as barras de **ansiedade** e **estresse** pelo caminho (respirar fundo ajuda!).

> Uma brincadeira entre amigos, sem fins comerciais.

## Modos de jogo

| Modo | Como é |
|---|---|
| **Sendo o Davi** | você dirige o Renault Kwid branco do Davi |
| **Dando carona pro Davi** | você dirige o seu C4 Cactus THP cinza, com o Davi de passageiro |
| **PERIGO** | o Davi dirige o seu Cactus emprestado. Cuidado com o carro alheio! |

**Rotas:** Casa → STJ (manhã) e STJ → Casa (fim de tarde). Há duas rotas principais no mapa, ambas nos dois
sentidos: **Eixo Monumental** (rápida, com pardais) e **Via S3 + Parque da Cidade** (lenta, com semáforos e faixa
de ônibus). A seta amarela segue o GPS (rota mais rápida).

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

H, R, X e F têm tempo de recarga (detalhes em *Regras e humor*).

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
```

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
  traffic: { seed: null|n, tripSeed, active, peds },  // dono: traffic.js; seed fixo = viagem reproduzível (radares, agentes, frutas, IA)
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
| `COLLISION` | núcleo (estáticos) / traffic (veículos, pedestres) | `{ a:'player', b:'static'|'vehicle'|'pedestrian', kind, impactKmh, x, z, nx, nz, otherId }`; traffic acrescenta `id, persona, playerAtFault, otherKmh, brakeChecked` (veículo) / `id, playerAtFault, crosswalkId` (pedestre; `kind` = `pedestre`\|`corredor`\|`ciclista`) |
| `SIGNAL_CHANGE` | núcleo | `{ signalId, group, state }` |
| `FINE` | rules | `{ code, label, amount, points, x, z }` |
| `NEAR_MISS` | traffic | `{ id, otherId, kind, b:'vehicle'\|'pedestrian'\|'cyclist', dist (m de folga), relKmh, x, z }` |
| `OVERTAKEN` / `PLAYER_OVERTOOK` | traffic | `{ id, otherId, kind, persona, side:'left'\|'right', relKmh }` (no `PLAYER_OVERTOOK`, `'right'` = jogador passou pela direita) |
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

**Topologia (pós fase 2a).** O Sudoeste só se liga ao resto da cidade pela Av. das Jaqueiras (e a Primeira Avenida, que vai ao
Balão da EPIG); EQRSW e Comércio Local são sem saída (senão o GPS cortava caminho). Rotas que o GPS devolve:
- Casa → STJ (Eixo): QRSW 2 › Av. das Jaqueiras › Praça do Cruzeiro › Eixo (Via S1) › descida da Rodoviária (Via S2) › Via S2 › L2 Sul › Via S3 (SAFS — STJ).
- STJ → Casa (Eixo): Via S3 (SAFS) › L2 Sul › Via S2 › Alça Via S2 → Eixo (Rodoviária) › Eixo (Via N1) › Praça do Cruzeiro › Av. das Jaqueiras › QRSW 2.
- Parque (forçada com `planRouteVia`): QRSW 2 › Jaqueiras › Primeira Avenida › Balão da EPIG › anel do Parque › Via S3 (SCS, SAUS, SAFS), e o inverso.
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

**Ajuste automático** (`ctx.view.autoQuality`, em `render/renderer.js`): mede o FPS depois de `warmupSec`; média de `windowSec` abaixo
de `minFps` (50) desce um degrau: `0 completo → 1 sem sombra projetada (sombras blob) → 2 resolução reduzida (pixelRatio × 0,75)
→ 3 cenário reduzido (some capim/arbustos/bancos e a visão encurta 30%)`. Sobe um degrau só após `upHoldSec` acima de `upFps` e
nunca para um degrau do qual já caiu 2 vezes (histerese). Estado público: `view.autoQuality.{step,label,fps,history}`, espelhado em
`state.qualityAuto = { step, label, fps }` quando muda (para a UI). `view.autoQuality.set(n)` força um degrau.

## Regras e humor (`src/systems/rules.js`, `src/systems/mood.js`)

Toda constante de balanceamento está em **`systems/mood/balance.js` (`MOOD_BALANCE`)** e **`systems/rules/balance.js` (`RULES_BALANCE`)**
(também em `ctx.modules.mood.balance` / `ctx.modules.rules.balance`). Lógica pura e testada: `mood/model.js`, `mood/lines.js`,
`rules/fines.js`, `rules/score.js`, `rules/result.js`. Toda consulta ao trânsito passa por `rules/traffic-adapter.js` (roda com o stub).

- **Humor:** ansiedade do Davi sobe com pista livre e ele devagar, *atrás de carro lento* (gatilho mais forte; cresce com o tempo e a
  proximidade), vermelho, pedestre na faixa, abaixo do limite, cronômetro, faixa de ônibus vazia ao lado; desce correndo com pista
  livre, ultrapassando (`PLAYER_OVERTOOK`) e respirando. Estresse sobe com eventos do trânsito (ultrapassado, fechado — x1,7 em
  rotatória —, buzina, farol, cola, fina, multa, fruta, raspão) e desce com calma. Pisos: Davi 15 (12 de carona), dono 0 ao volante.
- **Volante (`player.mods`, só quando o Davi dirige):** ansiedade → `throttleBias` (só andando e sem freio), `steerNoise`, puxão para
  a esquerda colado num lento (aplicado em `player.phys.steer`, pois `mods` não tem viés de direção); estresse → `steerGain`,
  `steerDelay`, `brakeMul`, buzina/xingamento automáticos. Fruta (`HAZARD_HIT`): `gripMul`/ruído por ~1 s e um empurrão de rumo.
- **Ações:** H buzina (−estresse, provoca), R respira (−ansiedade em 2,5 s, tira o pé), X xinga (−20 na hora, +26 de rebote depois,
  provoca), F pisca o farol (`traffic.flashLead`). No modo carona as ações agem no Davi passageiro.
- **Carona:** Davi palpita a cada 2,5–5 s (às vezes só gesto, às vezes se contradiz), surta acima de 90 de estresse (xinga pela janela
  → `traffic.provoke`; rotatória = surto imediato); só os surtos/palpites sobem as barras do dono. **Perigo:** susto/pânico do dono
  (velocidade, cola, freada, curva, turbo, fina, raspão, sinal furado, fruta); reclamação sobe o estresse do Davi; as duas barras do
  dono ≥ 97 por 3 s → `'tomouOCarro'`.
- **Falas:** `EV.SAY` com `gesture` opcional; banco em `mood/lines.js`, cada fala com variante com palavrão e leve
  (`state.settings.profanity === false` usa a leve); sem repetir em sequência e com intervalo mínimo por personagem/banco.
- **Multas:** pardal (`speed`, 3 faixas, tolerância 7 km/h/7 %), vermelho (radar `redLight` ou agente vendo a linha de retenção),
  faixa de pedestre ocupada (sempre), faixa de ônibus (≥ 3 s e só se radar `busLane` ou agente viu; `traffic.revealAgent`). Agentes
  também multam excesso > 20 % no campo de visão. Sem repetir mesmo código a < 150 m em 15 s. Sem `traffic.radars`, usa os radares
  declarados no mapa (`net.enforcementSpots` com `s`).
- **Colisão:** pedestre encerra sempre; ≥ `CONFIG.crashImpactKmh` encerra (`'bateu'`); abaixo disso é raspão (−pontos, +estresse/pânico).
- **Pontos:** zona de equilíbrio nas barras do Davi (20–55; carona: dono 0–12 e Davi ≤ 60) → 10 pt/s × multiplicador (sobe 0,12/s até
  4/3/6; base 1/1/1,5); estourar o teto corta o multiplicador pela metade. Fim: bônus de tempo (par = distância/45 km/h), −(pontos CNH×100
  + R$) por multa, batida mantém 35 %. `state.result.crash = { withWhat, excuse (causa impessoal), repairCost (só Cactus), repairItems,
  impactKmh, kind, cause, sinistroNo }`; `yearsLost` só no perigo.

## Trânsito (`src/systems/traffic.js`)

Lógica pura em `systems/traffic/sim.js` (sem three.js), elenco em `traffic/personas.js`, desenho em `traffic/render.js`.
Testes em Node: **`node src/systems/traffic/__tests__/traffic.test.js`** (`MINUTOS=10` para o teste longo; `VERBOSE=1` detalha).
Nada de id/nome/coordenada de via no código: tudo sai de `ctx.net` (tipos de via, faixas, conectores, balões, pontos, `fruitSpots`...).

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
- **Reação ao jogador:** `provoke(amount, radius)` → agressividade sobe por `temper`; > 0,55 vira revanche (buzina de volta, cola,
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
- **API** (`ctx.modules.traffic`, objetos reutilizados): `vehicles`, `pedestrians`, `hazards`, `radars`, `agents`, `leadInfo()`,
  `rearInfo()`, `freeAhead()`, `neighbors(r)`, `crosswalkAhead()`, `provoke(a, r)`, `flashLead()`, `revealAgent(id)`, `stats()`;
  depuração: `debug.spawn(modeloOuPersona, metrosÀFrente, faixa±, opts)`, `debug.clear()`, `debug.spawnPed(cw, atravessarJá)`,
  `debug.setAutoSpawn(bool)` (desliga spawn/despawn automáticos), `debug.repopulate()`, `debug.sim`. Campos completos no topo de `traffic.js`.
- **Desenho:** 1 `InstancedMesh` por modelo de `TRAFFIC_MODELS` + luzes (freio, setas, pisca-alerta, farol piscando, "!" de buzina,
  mão do pedestre, bloquinho) + sombras blob + 2 pedestres + bicicleta + agente + frutas + pardal: 9–14 draw calls e ~20–45 mil
  triângulos visíveis com o pool cheio (malhas vazias ficam invisíveis). Som: `audio.vehiclePass` para os ~5 mais próximos.
- **Custo** (passo de 1/60 s, frota cheia de 40 + 24 pedestres): ~0,05–0,1 ms em Node, ~0,05–0,25 ms no Chromium headless.

## Interface (src/ui/)

`ui.js` é um módulo comum (`name: 'ui'`) que só lê `ctx.state`, escuta eventos e emite `EV.REQ_*`. Arquivos:
`menu.js` (menu), `hud.js` + `minimap.js` (HUD; DOM só muda quando o valor muda, minimapa a ~10 Hz), `end.js` (chegou / boletim de
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
