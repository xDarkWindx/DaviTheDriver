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
  state.quality = params.get('q') || CONFIG.defaultQuality;
  const quality = resolveQuality(state.quality);
  state.quality = quality.id;

  const events = new EventBus();
  const view = createView(container, quality);
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight, quality);
  if (view.autoQuality) view.autoQuality.onChange = (aq) => { const q = state.qualityAuto; q.step = aq.step; q.label = aq.label; q.fps = aq.fps; };
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
  // gancho de depuração/testes (tools/smoke.cjs) e para inspeção no console
  window.__davi = ctx;
  return ctx;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
