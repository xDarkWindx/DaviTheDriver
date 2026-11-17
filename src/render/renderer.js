// Renderer WebGL, cena e iluminação. Sem pós-processamento.
// Sombra: UM shadow map direcional (PCF), frustum pequeno que acompanha o ponto focado pela câmera
// (perfil quality.shadows === 'shadowmap'); alternativa barata = sombras "blob" instanciadas.
// Ajuste automático de qualidade (view.autoQuality): mede o FPS e desce degraus se ficar abaixo do alvo.
import * as THREE from 'three';
import { LIVE_SHADOW } from './materials.js';

// Paletas por período do dia. fx.js pode ler/alterar via ctx.view.setTimeOfDay / ctx.view.lights.
export const TIME_OF_DAY = {
  manha: {
    sky: 0x9cc8ec, hemiSky: 0xdfeeff, hemiGround: 0xb59a6a, hemiIntensity: 1.45,
    sun: 0xfff3dc, sunIntensity: 1.9, sunDir: [0.55, 1.0, 0.45],
    groundTint: 0xffffff,
  },
  tarde: {
    sky: 0xf2a066, hemiSky: 0xffe2c4, hemiGround: 0x9a6a58, hemiIntensity: 1.5,
    sun: 0xffb070, sunIntensity: 2.0, sunDir: [-0.9, 0.6, 0.25],
    groundTint: 0xffe6cc,
  },
};

/** Cria renderer/cena a partir do perfil de qualidade (antialias e postprocess exigem recriar). */
export function createView(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: !!quality.antialias, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioMax));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  const wantShadow = quality.shadows === 'shadowmap';
  renderer.shadowMap.enabled = wantShadow;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  LIVE_SHADOW.map = wantShadow;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TIME_OF_DAY.manha.sky);
  scene.matrixWorldAutoUpdate = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.2);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, sun, sun.target);
  const range = quality.shadowRange || 48;
  if (wantShadow) {
    sun.castShadow = true;
    const sz = quality.shadowMapSize || 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -range; sc.right = range; sc.top = range; sc.bottom = -range; sc.near = 10; sc.far = 420;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  }
  const sunDir = new THREE.Vector3(0.5, 1, 0.4).normalize();

  // Materiais compartilhados que mudam de tom com o período (ex.: chão).
  const tintables = [];

  const view = {
    renderer, scene, lights: { hemi, sun }, timeOfDay: 'manha', tintables, quality,
    /** Muda só o que vale em tempo real (pixelRatio). Demais chaves: ver README (recriar). */
    applyLiveQuality(q) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioMax));
    },
    setTimeOfDay(name) {
      const p = TIME_OF_DAY[name] || TIME_OF_DAY.manha;
      view.timeOfDay = name;
      scene.background.set(p.sky);
      hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGround); hemi.intensity = p.hemiIntensity;
      sun.color.set(p.sun); sun.intensity = p.sunIntensity;
      sunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
      sun.position.copy(sunDir).multiplyScalar(100);
      sun.target.position.set(0, 0, 0);
      for (const m of tintables) m.color.set(p.groundTint);
    },
    resize() {
      const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      return { w, h };
    },
  };
  view.setTimeOfDay('manha');

  // ---------- sombra que acompanha a câmera + ajuste automático (gancho no render da cena: sem alocação)
  const _dir = new THREE.Vector3(), _focus = new THREE.Vector3();
  const texel = (range * 2) / (quality.shadowMapSize || 1024);
  const aq = createAutoQuality(view, quality);
  view.autoQuality = aq;
  scene.onBeforeRender = (r, sc, cam) => {
    aq.tick(cam);
    if (!sun.castShadow) return;
    // ponto do chão no centro da tela
    cam.getWorldDirection(_dir);
    const t = _dir.y < -1e-3 ? -cam.position.y / _dir.y : 0;
    _focus.copy(cam.position).addScaledVector(_dir, t);
    // estabiliza (encaixa no texel) para a sombra não "tremer"
    _focus.x = Math.round(_focus.x / texel) * texel; _focus.z = Math.round(_focus.z / texel) * texel; _focus.y = 0;
    sun.target.position.copy(_focus);
    sun.position.copy(_focus).addScaledVector(sunDir, 200);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  };
  return view;
}

/**
 * Ajuste automático de qualidade. Degraus:
 *   0 'completo' → 1 'sem sombra projetada' (sombra blob) → 2 'resolução reduzida' → 3 'cenário reduzido'.
 * Mede o tempo entre renders; após `warmupSec`, média de `windowSec` < minFps => desce um degrau.
 * Histerese: só sobe (um degrau) se ficar acima de upFps por upHoldSec e nunca volta a um degrau
 * do qual já caiu duas vezes. Estado público: { step, label, fps, steps, enabled, history }.
 * Quem quiser mostrar: ctx.view.autoQuality (e state.qualityAuto, espelho escrito por main.js via aq.onChange).
 * view.lod.optional: malhas que somem no degrau 3 (registradas pelo mundo); view.lod.blobs: sombras blob.
 */
function createAutoQuality(view, quality) {
  const cfg = quality.autoQuality || { enabled: false };
  const STEPS = ['completo', 'sem sombra projetada', 'resolução reduzida', 'cenário reduzido'];
  const hasMap = quality.shadows === 'shadowmap';
  view.lod = { optional: [], blobs: [], baseFar: null };
  const aq = {
    enabled: !!cfg.enabled, step: 0, label: STEPS[0], fps: 0, steps: STEPS, history: [], onChange: null,
    _last: 0, _since: 0, _acc: 0, _frames: 0, _upT: 0, _drops: [0, 0, 0, 0], _farDirty: false, _prevStep: 0,
    /** Força um degrau (debug/UI). */
    set(step) { applyStep(Math.max(0, Math.min(STEPS.length - 1, step | 0))); },
    tick(cam) {
      const now = performance.now();
      const dt = aq._last ? (now - aq._last) / 1000 : 0;
      aq._last = now;
      if (!aq.enabled || dt <= 0 || dt > 0.5 || (typeof document !== 'undefined' && document.hidden)) return;
      if (view.lod.baseFar === null) view.lod.baseFar = cam.far;
      if (aq._farDirty) { // só mexe no far quando o degrau 3 entra/sai (não briga com quem ajusta a câmera)
        cam.far = aq.step >= 3 ? view.lod.baseFar * 0.7 : view.lod.baseFar; cam.updateProjectionMatrix(); aq._farDirty = false;
      }
      aq._since += dt;
      if (aq._since < (cfg.warmupSec || 2.5)) return;
      aq._acc += dt; aq._frames++;
      if (aq._acc >= (cfg.windowSec || 3)) {
        aq.fps = aq._frames / aq._acc;
        aq._acc = 0; aq._frames = 0;
        if (aq.fps < (cfg.minFps || 50) && aq.step < STEPS.length - 1) { aq._drops[aq.step]++; applyStep(aq.step + 1); }
        else if (aq.fps > (cfg.upFps || 75) && aq.step > 0 && aq._drops[aq.step - 1] < 2) {
          aq._upT += cfg.windowSec || 3;
          if (aq._upT >= (cfg.upHoldSec || 10)) applyStep(aq.step - 1);
        } else aq._upT = 0;
      }
    },
  };
  function applyStep(step) {
    if (step === aq.step) return;
    aq.history.push({ from: aq.step, to: step, fps: +aq.fps.toFixed(1), t: +(performance.now() / 1000).toFixed(1) });
    aq.step = step; aq.label = STEPS[step]; aq._since = 0; aq._acc = 0; aq._frames = 0; aq._upT = 0;
    const shadowOn = hasMap && step < 1;
    view.lights.sun.castShadow = shadowOn;
    view.renderer.shadowMap.enabled = shadowOn;
    LIVE_SHADOW.map = shadowOn;
    for (const m of view.lod.blobs) m.visible = !shadowOn;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const pr = Math.min(dpr, quality.pixelRatioMax);
    view.renderer.setPixelRatio(step >= 2 ? Math.max(0.75, pr * 0.75) : pr);
    for (const m of view.lod.optional) m.visible = step < 3;
    if ((step >= 3) !== (aq._prevStep >= 3)) aq._farDirty = true;
    aq._prevStep = step;
    if (aq.onChange) aq.onChange(aq); // main.js espelha em state.qualityAuto (para a UI)
  }
  return aq;
}
