# Davi, the Driver

Jogo de direção isométrico (three.js/WebGL) ambientado numa Brasília estilizada. Davi é ansioso, estressado,
agressivo, dirige um Renault Kwid branco e já bateu 4 vezes no ano — *a culpa é sempre dos outros*.
Objetivo: ir da **QRSW 2 — Sudoeste** (casa) ao **STJ** (SAFS) ou o inverso, sem bater, sem multa, no menor tempo.

## Como jogar

Abra `index.html` com duplo clique (funciona em `file://`) ou sirva a pasta com qualquer servidor estático.

| Tecla | Ação |
|---|---|
| W / ↑ | acelerar |
| S / ↓ | frear / ré |
| A D / ← → | direção |
| Espaço | freio de mão |
| H | buzinar · R respirar fundo · X xingar (só eventos; efeitos vêm depois) |
| P / Esc | pausa |

**Modos:** `davi` (Davi no Kwid), `carona` (você dirige seu C4 Cactus THP, Davi de passageiro),
`perigo` (o dono emprestou o Cactus para o Davi). **Rotas:** Casa → STJ (manhã) e STJ → Casa (fim de tarde).
Duas rotas principais no mapa, ambas nos dois sentidos: **Eixo Monumental** (rápida, pardais) e
**Via S3 + Parque da Cidade** (lenta, semáforos, faixa de ônibus). A seta amarela segue o GPS (rota mais rápida).

Qualidade gráfica: `index.html?q=leve` (padrão). `?q=hd` está declarado mas cai para `leve` (TODO).

## Build e ferramentas

```bash
npm install          # esbuild + three (devDependencies; three é empacotado no bundle)
npm run build        # src/ -> dist/game.js (IIFE único, minificado). dist/ ENTRA no git.
npm run watch        # rebuild contínuo (não minificado, sourcemap inline)
npm test             # testes da malha viária em Node puro (tools/test-roads.js)
npm run smoke        # Playwright: abre via file://, joga os 3 modos, mede draw calls, screenshots em .shots/
node tools/smoke.cjs /tmp/minha-pasta   # idem, salvando screenshots em outra pasta
node tools/tune-cars.js                 # mede 0-100, retomada, final e frenagem de cada carro
```

Sem CDN, sem downloads em runtime: texturas são geradas em canvas e toda geometria é procedural.

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
src/render/textures.js   texturas em canvas (chão, asfalto, atlas de placas, blob)
src/render/materials.js  makeMaterial(quality, params)
src/world/mapData.js     O MAPA COMO DADOS (nós, vias, balões, semáforos, faixas, ônibus, fiscalização...)
src/world/roadNetwork.js RoadNetwork (grafo de faixas + consultas) e LaneWalker — sem three.js
src/world/roadMesh.js    malha das vias
src/world/signals.js     SignalController (ciclo + visual)
src/world/scenery.js     cenário procedural (prédios, ipês, cerrado, postes, guard-rails)
src/world/landmarks.js   marcos (Torre de TV, Estádio, Catedral, Congresso, STJ, Memorial JK...)
src/world/world.js       monta o mundo; colisores; placas; getMinimapData()
src/player/physics.js    física arcade pura (stepVehicle, engineAccel, defaultMods)
src/player/vehicleModels.js  modelos Kwid e Cactus (MODELS, buildVehicleModel, buildBodyGeometry)
src/player/player.js     Player (física + colisão estática + state.player)
src/game/trip.js         viagem: largada, cronômetro, GPS, seta, chegada
src/systems/traffic.js   STUB  trânsito (IA + pedestres)
src/systems/rules.js     STUB  multas/colisões (tem 1 regra provisória: batida forte => 'bateu')
src/systems/mood.js      STUB  ansiedade/estresse
src/systems/fx.js        STUB  efeitos visuais
src/systems/audio.js     STUB  áudio
src/ui/ui.js             UI: menu, HUD, pausa, fim, recordes, toque (módulos auxiliares em src/ui/*; CSS em index.html)
assets/                  arquivos do usuário (ex.: davi.png, a foto do menu)
tools/                   smoke.cjs, test-roads.js, tune-cars.js
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
  actions?: { horn, breathe, curse }  // opcional, cada { cooldown (s restantes), max (s) }; a UI desenha o recarregamento se existir
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
| `COLLISION` | núcleo (estáticos) / traffic (veículos, pedestres) | `{ a:'player', b:'static'|'vehicle'|'pedestrian', kind, impactKmh, x, z, nx, nz, otherId }` |
| `SIGNAL_CHANGE` | núcleo | `{ signalId, group, state }` |
| `FINE` | rules | `{ code, label, amount, points, x, z }` |
| `NEAR_MISS`, `OVERTAKEN`, `CUT_OFF` ("fechado"), `HONKED_AT`, `PEDESTRIAN_CROSSING` | traffic | `{ otherId, ... }` |
| `MOOD_CHANGE`, `MOOD_PEAK`, `PASSENGER_SAY` | mood | `{ who, ... }` / `{ text, intensity }` |
| `CAMERA_SHAKE` | qualquer um | `{ amount, duration }` (o núcleo aplica no `cameraRig`) |
| `SETTINGS_CHANGE` | **ui** (única que escreve `state.settings`) | `{ volume, muted, retro, quality }` — emitido no boot e a cada mudança |
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

Funções puras exportadas: `samplePts`, `offsetPolyline`, `smoothPolyline`. Teste: `npm test`.

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
| `shadows` | `none`/`blob`/`shadowmap`(TODO) | **reconstruir mundo** |
| `textureSize`, `anisotropy`, `signTextureWidth` | resolução das texturas de canvas | **reconstruir mundo** |
| `chunkSize` | chunk de culling | **reconstruir mundo** |
| `density.{trees,scrub,lamps,buildings,guardrails}` | densidade do cenário | **reconstruir mundo** |
| `vehicleLOD`, `landmarkLOD` | detalhe (só `low` existe; TODO) | **reconstruir mundo** |
| `cameraFar`, `viewMul` | distância de visão / abertura do zoom | recriar `CameraRig` / tempo real |
| `maxTrafficVehicles`, `maxPedestrians`, `maxParticles` | tetos para traffic/fx | tempo real (respeitados pelos módulos) |
| `fxSkidMax` | pool de marcas de pneu (fx.js) | ao (re)criar o módulo |
| `fxGrain` | granulação do filtro retrô (fx.js) | ao (re)criar o módulo |

Hoje a troca de perfil é por `?q=` na URL (recarrega tudo). `hd` está declarado com `implemented: false`.

### Orçamento de performance (perfil leve)
Sem sombras dinâmicas (sombra "blob" instanciada), sem pós-processamento, Lambert, InstancedMesh por chunk,
pixelRatio ≤ 1,5, sem alocação por passo no caminho quente. Cena típica: ~35–45 draw calls, ~60–90 mil triângulos.

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
