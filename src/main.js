// Ponto de entrada (empacotado por esbuild em dist/game.js, IIFE, carregado por <script> clássico).
import * as THREE from 'three';
import { CONFIG, QUALITY, VEHICLES, MODES, ROUTES, resolveQuality } from './config.js';
import { EventBus, EV } from './core/events.js';
import { createState } from './core/state.js';
import { Input } from './core/input.js';
import { Game } from './core/game.js';
import { startLoop } from './core/loop.js';
import * as collision from './core/collision.js';
import { createView } from './render/renderer.js';
import { hdSupport } from './render/hd.js';
import { loadSavedQuality } from './ui/storage.js';
import { CameraRig } from './render/cameraRig.js';
import { MAP } from './world/mapData.js';
import { RoadNetwork } from './world/roadNetwork.js';
import { buildWorld } from './world/world.js';
import { Player } from './player/player.js';
import { Trip } from './game/trip.js';
import traffic from './systems/traffic.js';
import rules from './systems/rules.js';
import mood from './systems/mood.js';
import fx from './systems/fx.js';
import audio from './systems/audio.js';
import ui from './ui/ui.js';
import { createAutopilot } from './debug/autopilot.js';

function boot() {
  const container = document.getElementById('game');
  const params = new URLSearchParams(location.search);
  const state = createState();
  // perfil: ?q=leve|hd (testes) > opção salva > padrão. HD sem WebGL2/extensões cai para o leve (motivo em state.hdSupport).
  const forced = params.get('q');
  const want = forced === 'leve' || forced === 'hd' ? forced : (loadSavedQuality() || CONFIG.defaultQuality);
  state.hdSupport = hdSupport();
  const quality = resolveQuality(want, state.hdSupport);
  state.quality = quality.id;
  state.qualityWanted = want;

  const events = new EventBus();
  const view = createView(container, quality);
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight, quality);
  if (view.autoQuality) view.autoQuality.onChange = (aq) => { const q = state.qualityAuto; q.step = aq.step; q.label = aq.label; q.fps = aq.fps; q.max = aq.steps.length - 1; };
  state.qualityAuto.max = view.autoQuality ? view.autoQuality.steps.length - 1 : 3;
  // ?aq=0 desliga o ajuste automático; ?aq=N trava no degrau N (medições/testes no headless)
  const aqp = params.get('aq');
  if (aqp !== null && view.autoQuality) { view.autoQuality.enabled = false; if (+aqp > 0) view.autoQuality.set(+aqp); }
  const net = new RoadNetwork(MAP);
  const world = buildWorld({ view, net, quality, events, cameraDir: cameraRig.dir });
  const input = new Input(events);
  input.attach(window);
  const player = new Player({ scene: view.scene, net, colliders: world.colliders, events, state, quality, blobTexture: world.blobTexture });
  player.setVehicle('kwid');
  const trip = new Trip({ scene: view.scene, net, state });

  /** Contexto compartilhado entregue a todos os módulos. */
  const ctx = {
    THREE, CONFIG, QUALITY, VEHICLES, MODES, ROUTES, EV, collision,
    quality, state, events, input, view, cameraRig, net, world, colliders: world.colliders,
    signals: world.signals, player, trip, modules: {}, game: null,
  };
  const game = new Game(ctx);
  // ordem de update: trânsito -> regras -> humor -> efeitos -> áudio -> UI
  for (const m of [traffic, rules, mood, fx, audio, ui]) game.register(m);
  game.init();

  const onResize = () => { view.resize(); cameraRig.setAspect(window.innerWidth / window.innerHeight); };
  window.addEventListener('resize', onResize);
  onResize();

  ctx.loop = startLoop({ step: (dt) => game.step(dt), frame: (dt, a) => game.frame(dt, a), hz: CONFIG.simHz, maxSubSteps: CONFIG.maxSubSteps });
  // piloto-robô (inerte até ser ligado; ?bot=cuidadoso|normal|apressado[&rota=parque] liga a cada viagem)
  ctx.autopilot = createAutopilot(ctx);
  const botProfile = params.get('bot');
  if (botProfile) events.on(EV.TRIP_START, () => ctx.autopilot.start({ profile: botProfile, corridor: params.get('rota') || 'eixo' }));
  // ---- troca de perfil gráfico (leve <-> hd): o renderer e o mundo são recriados recarregando a página com as opções salvas
  //      (state.settings é persistido pela UI). Na viagem, a troca fica pendente até voltar ao menu. Antes de recarregar,
  //      view.dispose() libera geometrias, texturas, render targets e o contexto WebGL do perfil anterior.
  let lastQ = state.settings.quality, pending = false; // a UI já carregou as opções salvas no init
  const switchProfile = () => {
    ctx.switching = true;
    if (ctx.loop && ctx.loop.stop) ctx.loop.stop();
    try { view.dispose(); } catch (e) { /* segue para o recarregamento */ }
    const u = new URL(location.href); u.searchParams.delete('q'); u.searchParams.delete('aq');
    if (!ctx.noReload) location.replace(u.toString());
  };
  const maybeSwitch = () => { if (pending && state.mode === 'MENU') switchProfile(); };
  events.on(EV.SETTINGS_CHANGE, (p) => {
    const q = p && p.quality;
    if (q && q !== lastQ && q !== state.quality) { pending = true; maybeSwitch(); }
    else if (q === state.quality) pending = false;
    lastQ = q;
  });
  events.on(EV.STATE_CHANGE, (p) => { if (p.to === 'MENU') maybeSwitch(); });
  if (view.hd) view.hd.onFallback = () => { // degrau final do ajuste automático do HD: volta para o leve (aviso pela UI)
    pending = true;
    events.emit(EV.QUALITY_FALLBACK, { from: 'hd', to: 'leve', fps: view.autoQuality ? view.autoQuality.fps : 0 });
    maybeSwitch();
  };
  ctx.switchProfile = switchProfile;
  // gancho de depuração/testes (tools/smoke.cjs) e para inspeção no console
  window.__davi = ctx;
  return ctx;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
