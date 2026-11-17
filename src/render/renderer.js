// Renderer WebGL, cena e iluminação (sem sombras dinâmicas, sem pós-processamento).
import * as THREE from 'three';

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
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TIME_OF_DAY.manha.sky);
  scene.matrixWorldAutoUpdate = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.2);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, sun, sun.target);

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
      sun.position.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).multiplyScalar(100);
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
  return view;
}
