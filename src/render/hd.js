// Pipeline do perfil HD (placa de vídeo dedicada). Só é chamado quando o perfil tem `postprocess`/`envMap`.
//  - cena -> render target HalfFloat com MSAA -> bloom (UnrealBloomPass) -> passe final (tone mapping ACES + exposição
//    por horário, saturação/tom, névoa seca no alto da tela, vinheta, dither) -> tela.
//  - environment map PMREM de um céu procedural (um por horário, gerado em código), luz hemisférica + sol por horário.
//  - shadow map 4096 com PCF suave, frustum de ±80 m encaixado no texel NO ESPAÇO DA LUZ (sombra não "nada").
//  - sombra de nuvens (uniforms em hdMaterials.HD), emissivos por horário.
//  - degraus próprios do ajuste automático (applyStep) e dispose de tudo que cria.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HD } from './hdMaterials.js';
import { makeCloudTexture } from './textures.js';
import { LIVE_SHADOW } from './materials.js';
import { setLeafFraction } from '../world/hdTrees.js';

/** Paleta HD por período (luzes, céu do environment map, exposição, cor e emissivos). */
export const TIME_OF_DAY_HD = {
  manha: { // manhã clara e fria (ida)
    hemiSky: 0xf1f0ea, hemiGround: 0xb08a5e, hemiIntensity: 0.62,
    sun: 0xfff1dc, sunIntensity: 2.8, sunDir: [0.55, 1.0, 0.45],
    envTop: 0x3f86d8, envHorizon: 0xd2e6f6, envGround: 0x7a5a40, envSun: 0xfff0d8, envIntensity: 0.5, envTune: 1,
    exposure: 0.88, saturation: 1.2, tint: [1.02, 1.0, 0.97], haze: 0xe8ecec, hazeAmt: 0.07,
    clouds: 0.38, lamps: 0.1, fogSky: 0x9cc8ec,
  },
  tarde: { // fim de tarde dourado, sol baixo e sombras longas (volta)
    hemiSky: 0xffd7b0, hemiGround: 0x8a5a44, hemiIntensity: 0.62,
    sun: 0xffa95c, sunIntensity: 3.0, sunDir: [-0.9, 0.42, 0.3],
    envTop: 0x5b78b8, envHorizon: 0xffc58a, envGround: 0x6e4430, envSun: 0xffa050, envIntensity: 0.62, envTune: 0,
    exposure: 0.98, saturation: 1.16, tint: [1.06, 0.99, 0.9], haze: 0xf2bf8c, hazeAmt: 0.08,
    clouds: 0.3, lamps: 2.4, fogSky: 0xf2a066,
  },
};

/**
 * Suporte ao HD: WebGL2 + render target de cor HalfFloat (EXT_color_buffer_half_float/float) + texturas de 4096.
 * Não escreve no console. Retorna { ok, reason, samples, maxTexture }.
 */
let _support = null;
export function hdSupport() {
  if (_support) return _support;
  let r = { ok: false, reason: 'WebGL2 indisponível neste navegador.', samples: 0, maxTexture: 0 };
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (gl) {
      const half = gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float');
      const samples = gl.getParameter(gl.MAX_SAMPLES) | 0, maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0;
      if (!half) r = { ok: false, reason: 'A placa não renderiza em ponto flutuante (EXT_color_buffer_half_float).', samples, maxTexture };
      else if (maxTexture < 4096) r = { ok: false, reason: 'A placa não aceita texturas de 4096 px.', samples, maxTexture };
      else r = { ok: true, reason: '', samples, maxTexture };
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch (e) { r = { ok: false, reason: 'Não foi possível testar o WebGL2.', samples: 0, maxTexture: 0 }; }
  _support = r;
  return r;
}

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uSat: { value: 1.1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uHaze: { value: new THREE.Vector3(0.9, 0.9, 0.9) }, uHazeAmt: { value: 0.1 }, uVig: { value: 0.24 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse; uniform float uExposure; uniform float uSat; uniform vec3 uTint; uniform vec3 uHaze; uniform float uHazeAmt; uniform float uVig;
varying vec2 vUv;
vec3 hdRRTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
vec3 hdAces( vec3 color ) {
  const mat3 IM = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
  const mat3 OM = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
  color *= 1.0 / 0.6; color = IM * color; color = hdRRTFit( color ); color = OM * color; return clamp( color, 0.0, 1.0 );
}
vec3 hdToSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  c = hdAces( c * uExposure );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = max( mix( vec3( l ), c, uSat ), 0.0 ) * uTint;
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.22 );                            // curva S leve (contraste)
  c = mix( c, uHaze, uHazeAmt * smoothstep( 0.55, 1.0, vUv.y ) );           // ar seco/poeira ao longe (alto da tela)
  vec2 q = vUv - 0.5; c *= 1.0 - uVig * smoothstep( 0.1, 0.8, dot( q, q ) * 2.0 );
  c = hdToSRGB( clamp( c, 0.0, 1.0 ) );
  c += ( fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) / 255.0; // dither (sem degraus no céu/vinheta)
  gl_FragColor = vec4( c, 1.0 );
}`,
};

// céu procedural para o environment map (gradiente + sol), só para o PMREM
function skyScene(p) {
  const scene = new THREE.Scene();
  const col = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: col(p.envTop) }, hor: { value: col(p.envHorizon) }, gnd: { value: col(p.envGround) }, sunC: { value: col(p.envSun) },
      sunD: { value: new THREE.Vector3(...p.sunDir).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 gnd; uniform vec3 sunC; uniform vec3 sunD; varying vec3 vD;
void main(){ vec3 d = normalize(vD); float h = d.y;
  vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor * 0.8, gnd, pow(min(1.0, -h * 3.0), 0.6));
  float s = max(dot(d, sunD), 0.0);
  c += sunC * (pow(s, 900.0) * 60.0 + pow(s, 12.0) * 0.5);
  gl_FragColor = vec4(c, 1.0); }`,
  });
  const geo = new THREE.SphereGeometry(50, 48, 24);
  scene.add(new THREE.Mesh(geo, mat));
  return { scene, dispose() { geo.dispose(); mat.dispose(); } };
}

/** Monta o pipeline HD sobre a view já criada (renderer, cena, luzes). */
export function setupHD(view, quality) {
  const { renderer, scene } = view, { sun, hemi } = view.lights;
  const pp = quality.postprocess || {};
  renderer.info.autoReset = false;               // conta todas as passadas (sombra + cena + pós) do frame
  renderer.toneMapping = THREE.NoToneMapping;    // o passe final faz o tone mapping (degrau sem pós: ACES no material)
  // --- sombra
  const range = quality.shadowRange || 80;
  sun.shadow.radius = quality.shadowRadius || 2;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -range; sc.right = range; sc.top = range; sc.bottom = -range; sc.near = 20; sc.far = 700; sc.updateProjectionMatrix();
  LIVE_SHADOW.traffic = !!quality.shadowTraffic;
  // --- pós
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaaSamples || 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, null);
  const b = pp.bloom || { strength: 0.35, radius: 0.5, threshold: 1.2 };
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), b.strength, b.radius, b.threshold);
  const final = new ShaderPass(FINAL_SHADER);
  final.uniforms.uVig.value = pp.vignette ?? 0.24;
  final.material.toneMapped = false; // o próprio passe faz o ACES (sem o tone mapping do renderer por cima)
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(final);
  // --- environment maps (um por horário, gerados sob demanda)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envs = {};
  const envFor = (name) => {
    if (!envs[name]) { const s = skyScene(TIME_OF_DAY_HD[name]); envs[name] = pmrem.fromScene(s.scene, 0.02, 0.1, 200); s.dispose(); }
    return envs[name].texture;
  };
  // --- nuvens
  const cloudTex = quality.cloudShadows ? makeCloudTexture(256) : null;
  HD.uCloudTex.value = cloudTex;
  const hd = {
    composer, bloom, final, pmrem, envs, rt, post: true, step: 0, cloudsOn: !!cloudTex, onFallback: null, _fell: false,
    tod: TIME_OF_DAY_HD.manha,
    render(cam) {
      renderer.info.reset();
      const now = performance.now() / 1000;
      HD.uTime.value = now;                                                       // vento nas folhas
      HD.uCloudOff.value.set(now * 2.2 * HD.uCloudScale.value, now * 0.9 * HD.uCloudScale.value); // nuvens a ~2,4 m/s
      if (hd.post) { renderPass.camera = cam; composer.render(); }
      else renderer.render(scene, cam);
    },
    resize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    setPixelRatio(pr) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); const s = renderer.getSize(new THREE.Vector2()); composer.setSize(s.x, s.y); },
    setTimeOfDay(name) {
      const p = TIME_OF_DAY_HD[name] || TIME_OF_DAY_HD.manha;
      hd.tod = p;
      hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGround); hemi.intensity = p.hemiIntensity;
      sun.color.set(p.sun); sun.intensity = p.sunIntensity;
      view.sunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
      scene.environment = envFor(name);
      scene.environmentIntensity = p.envIntensity;
      final.uniforms.uExposure.value = p.exposure; final.uniforms.uSat.value = pp.grade === false ? 1 : p.saturation;
      final.uniforms.uTint.value.set(...(pp.grade === false ? [1, 1, 1] : p.tint));
      const hz = new THREE.Color(p.haze); final.uniforms.uHaze.value.set(hz.r, hz.g, hz.b); final.uniforms.uHazeAmt.value = pp.haze === false ? 0 : p.hazeAmt;
      renderer.toneMappingExposure = p.exposure * 1.0;
      HD.uCloudAmt.value = hd.cloudsOn ? p.clouds : 0;
      HD.uLamp.value = p.lamps; HD.uEnvTune.value = p.envTune ?? 0;
      HD.headlights = name === 'tarde' && !!quality.headlightDecals;
    },
    /** Degraus do ajuste automático do HD. 0 completo · 1 sem pós · 2 sombra reduzida · 3 resolução reduzida · 4 modo leve. */
    applyStep(step) {
      hd.step = step;
      hd.post = step < 1;
      renderer.toneMapping = hd.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      const sz = step >= 4 ? 1024 : step >= 2 ? 2048 : (quality.shadowMapSize || 4096);
      if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      sun.shadow.radius = step >= 2 ? 1.2 : (quality.shadowRadius || 2);
      const r = step >= 4 ? 48 : range;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
      hd.texel = (r * 2) / sz;
      LIVE_SHADOW.traffic = !!quality.shadowTraffic && step < 2;
      setLeafFraction(step >= 2 ? 0.55 : 1);
      hd.cloudsOn = !!cloudTex && step < 4;
      HD.uCloudAmt.value = hd.cloudsOn ? hd.tod.clouds : 0;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const pr = Math.min(dpr, quality.pixelRatioMax);
      hd.setPixelRatio(step >= 3 ? Math.max(0.75, pr * 0.75) : pr);
      if (step >= 4 && !hd._fell) { hd._fell = true; if (hd.onFallback) hd.onFallback(); }
    },
    stats() {
      const bl = bloom.renderTargetsHorizontal.length + bloom.renderTargetsVertical.length + 1;
      return { renderTargets: 1 + bl + (sun.shadow.map ? 1 : 0) + Object.keys(envs).length, shadowMapSize: sun.shadow.mapSize.x, post: hd.post,
        pixelRatio: renderer.getPixelRatio(), msaa: rt.samples, envMaps: Object.keys(envs).length };
    },
    dispose() {
      composer.dispose(); rt.dispose(); bloom.dispose(); final.material.dispose(); if (final.fsQuad) final.fsQuad.dispose();
      for (const k in envs) envs[k].dispose();
      pmrem.dispose();
      if (cloudTex) cloudTex.dispose();
      HD.uCloudTex.value = null;
      scene.environment = null;
    },
  };
  hd.texel = (range * 2) / (quality.shadowMapSize || 4096);
  return hd;
}

// encaixe do foco da sombra no texel, no espaço da luz (evita "nadar" com a câmera andando)
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function snapToLightTexel(focus, sunDir, texel) {
  _z.copy(sunDir).normalize();
  _x.crossVectors(_up, _z).normalize(); _y.crossVectors(_z, _x);
  const a = Math.round(focus.dot(_x) / texel) * texel, b = Math.round(focus.dot(_y) / texel) * texel, c = focus.dot(_z);
  focus.set(0, 0, 0).addScaledVector(_x, a).addScaledVector(_y, b).addScaledVector(_z, c);
  return focus;
}
