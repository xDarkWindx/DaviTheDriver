// Materiais do perfil HD (PBR). Nada daqui roda no perfil 'leve'.
//  - surf (atributo vec4 por vértice: rugosidade, metal, clearcoat, emissivo) derivado da COR do vértice por tabela
//    (vidro, lente de farol, lanterna, cromado, pneu, plástico, lataria...) — os modelos continuam sendo cor por vértice.
//  - sombra de nuvens: modula só a luz direcional (sol) por uma textura que desliza devagar em coordenadas de mundo.
//  - máscara de pintura (paint) igual à do leve, para InstancedMesh (cor da instância só onde paint = 1).
import * as THREE from 'three';
import { addOcclusionCut } from './materials.js';

/** Uniforms compartilhados por TODOS os materiais HD (atualizados por render/hd.js a cada frame/horário). */
export const HD = {
  uCloudTex: { value: null }, uCloudOff: { value: new THREE.Vector2() }, uCloudScale: { value: 1 / 300 }, uCloudAmt: { value: 0 },
  uLamp: { value: 0.3 },
  // reflexo do céu por material (envMapIntensity do material, que o three ignora com scene.environment): 1 = usa o fator do
  // material (manhã: asfalto/chão quase sem céu, lataria/vidro com bastante), 0 = só o do cenário (fim de tarde, como estava)
  uEnvTune: { value: 1 },
  uTime: { value: 0 }, uWind: { value: 1 },  // balanço das folhas (HD.uWind = 0 desliga)   // multiplicador dos emissivos dos modelos (faróis/lanternas/luminárias): sobe no fim de tarde
  headlights: false,       // fim de tarde: cones de farol no asfalto (trânsito e jogador)
};

// ------------------------------------------------------------------ classes de superfície [rugosidade, metal, clearcoat, emissivo]
export const SURF = {
  glass: [0.05, 0.1, 1, 0], lens: [0.12, 0, 1, 1], drl: [0.12, 0, 1, 0.8], lamp: [0.22, 0, 1, 0.4], chrome: [0.12, 1, 0, 0],
  tire: [0.93, 0, 0, 0], rubber: [0.8, 0, 0, 0], plastic: [0.6, 0, 0.15, 0], paint: [0.38, 0.1, 1, 0], metalPaint: [0.4, 0.3, 1, 0],
  plate: [0.45, 0, 0, 0], rim: [0.28, 0.85, 0.3, 0], metal: [0.36, 0.85, 0, 0], concrete: [0.8, 0, 0, 0], archGlass: [0.07, 0.35, 0, 0],
  water: [0.04, 0, 0, 0], foliage: [0.78, 0, 0, 0], bark: [0.9, 0, 0, 0], bulb: [0.3, 0, 0, 0.9], wood: [0.72, 0, 0, 0],
  orange: [0.4, 0, 1, 0],
};
const HEX = new Map();
const reg = (cls, ...hexes) => { for (const h of hexes) HEX.set(h, cls); };
reg('glass', 0x26333f, 0x2a3846, 0x26323d);
reg('lens', 0xf4f6f8, 0xf2f4f6, 0xeef1f4);
reg('drl', 0xe8f4ff, 0xe6f3ff);
reg('lamp', 0xc0141c, 0x8e0f15, 0xc8141e, 0xb8141b, 0xb81a20, 0xc81018, 0xd92a1c);
reg('chrome', 0xc9cdd2, 0xcdd1d6, 0xc4c8cd);
reg('tire', 0x1a1a1b, 0x252527, 0x202022, 0x161616, 0x1a1a1a);
reg('plastic', 0x161718, 0x1e1f21, 0x151618, 0x1b1c1e, 0x1d1e20, 0x111111, 0x101010, 0x0c0c0c, 0x2c2e31, 0x2a2a2a, 0x1f2022, 0x222222, 0x333333, 0x1c1c1c);
reg('plate', 0xf2f2ee, 0xf0f0ec);
reg('rim', 0x2b2e33, 0x3c4046, 0x55595f, 0x3a3e44, 0x1d1e21, 0xe2e5e9, 0xd9dce0, 0x2a2b2e, 0x9aa0a6, 0x8d9399, 0xb8bcc0);
reg('metal', 0x7d8288, 0x6a6e73, 0x55595e, 0x8d9297, 0x555a5f, 0x9aa0a7, 0x6d7075, 0x8e8c86, 0x6e6c66, 0x7a7872, 0x5f656c, 0xcccccc);
reg('archGlass', 0x3f6f7d, 0x2c4650, 0x4f8a7a, 0x6f9fc4, 0x5f8fb8, 0x86b2d2, 0x9fc4d6, 0x7d8f9a);
reg('water', 0x5f8fa8);
reg('bark', 0x5a4634, 0x46372a, 0x7a7064, 0x8a7a64, 0x6f6450);
reg('bulb', 0xf6f2dc, 0xfff6c8);
reg('wood', 0x9a7b55);
reg('orange', 0xff6a12);

const _c = new THREE.Color();
/**
 * Acrescenta o atributo `surf` (vec4) à geometria a partir da cor de cada vértice.
 * opts: { paintClass (vértices com paint = 1), body: { hex: classe } (cores de lataria do modelo), def (classe padrão) }.
 */
export function applySurface(geometry, opts = {}) {
  const C = geometry.attributes.color, P = geometry.attributes.paint, n = geometry.attributes.position.count;
  const out = new Float32Array(n * 4);
  const def = SURF[opts.def || 'plastic'], paintCls = SURF[opts.paintClass || 'paint'], body = opts.body || null;
  let lastHex = -1, last = def;
  for (let i = 0; i < n; i++) {
    let s;
    if (P && P.getX(i) > 0.5) s = paintCls;
    else if (C) {
      _c.setRGB(C.getX(i), C.getY(i), C.getZ(i));
      const hex = _c.getHex();
      if (hex === lastHex) s = last;
      else {
        const cls = (body && body[hex]) || HEX.get(hex);
        s = cls ? SURF[cls] : def; lastHex = hex; last = s;
      }
    } else s = def;
    out[i * 4] = s[0]; out[i * 4 + 1] = s[1]; out[i * 4 + 2] = s[2]; out[i * 4 + 3] = s[3];
  }
  geometry.setAttribute('surf', new THREE.BufferAttribute(out, 4));
  return geometry;
}

// ------------------------------------------------------------------ injeção de shader
/**
 * opts: { masked (atributo paint tinge com a cor da instância), surf (atributo surf), cloud (sombra de nuvem, padrão true),
 *         road (pintura de solo mais lisa/brilhante), facade: { tileW, tileH } (UV em metros por instância), key }
 */
export function patchHD(mat, opts = {}) {
  const cloud = opts.cloud !== false;
  const envK = mat.envMapIntensity ?? 1;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uCloudTex = HD.uCloudTex; sh.uniforms.uCloudOff = HD.uCloudOff; sh.uniforms.uCloudScale = HD.uCloudScale;
    sh.uniforms.uCloudAmt = HD.uCloudAmt; sh.uniforms.uLamp = HD.uLamp; sh.uniforms.uEnvTune = HD.uEnvTune;
    if (opts.wind) { sh.uniforms.uTime = HD.uTime; sh.uniforms.uWind = HD.uWind; }
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
varying vec3 vHdW;
${opts.masked ? 'attribute float paint;' : ''}
${opts.surf ? 'attribute vec4 surf; varying vec4 vSurf;' : ''}
${opts.wind ? 'attribute float wind; uniform float uTime; uniform float uWind;' : ''}`);
    if (opts.wind) { // balanço das folhas: fase pela posição da instância (cada árvore balança diferente)
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec2 wph = vec2( 0.0 );
    #ifdef USE_INSTANCING
      wph = instanceMatrix[ 3 ].xz;
    #endif
    float wt = uTime * 1.5 + dot( wph, vec2( 0.13, 0.17 ) ) + position.y * 0.35;
    float wa = wind * uWind;
    transformed.x += wa * ( sin( wt ) * 0.05 + sin( wt * 2.7 + position.z * 3.0 ) * 0.02 );
    transformed.z += wa * ( cos( wt * 0.8 ) * 0.04 + sin( wt * 3.1 + position.x * 3.0 ) * 0.02 );
  }`);
    }
    if (opts.masked) {
      vs = vs.replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, paint );'));
    }
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec4 hw = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      hw = instanceMatrix * hw;
    #endif
    vHdW = ( modelMatrix * hw ).xyz;
    ${opts.surf ? 'vSurf = surf;' : ''}
  }`);
    if (opts.facade) {
      const tw = opts.facade.tileW.toFixed(3), th = opts.facade.tileH.toFixed(3);
      vs = vs.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  {
    vec3 isc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
    vec2 fuv;
    if ( abs( normal.y ) > 0.5 ) fuv = vec2( 0.02 * ${tw}, 0.02 * ${th} );
    else if ( abs( normal.x ) > 0.5 ) fuv = vec2( ( position.z + 0.5 ) * isc.z, position.y * isc.y );
    else fuv = vec2( ( position.x + 0.5 ) * isc.x, position.y * isc.y );
    vMapUv = fuv / vec2( ${tw}, ${th} );
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv = vMapUv;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv = vMapUv;
    #endif
  }
#endif`);
    }
    fs = fs.replace('#include <common>', `#include <common>
varying vec3 vHdW;
uniform sampler2D uCloudTex; uniform vec2 uCloudOff; uniform float uCloudScale; uniform float uCloudAmt; uniform float uLamp; uniform float uEnvTune;
${opts.surf ? 'varying vec4 vSurf;' : ''}`);
    if (opts.foliage) { // cartões dupla-face com normal "esferizada": o verso não inverte a normal (sombreamento macio)
      fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    }
    if (envK !== 1 && fs.includes('#include <envmap_physical_pars_fragment>')) {
      fs = fs.replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment
        .replaceAll('* envMapIntensity', `* ( envMapIntensity * mix( 1.0, ${envK.toFixed(3)}, uEnvTune ) )`));
    }
    if (opts.surf) {
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = vSurf.x;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vSurf.y;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vSurf.w * uLamp;')
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
    material.clearcoat *= vSurf.z;
  #endif`);
    }
    if (opts.road) {
      // pintura de solo (cor por vértice clara) mais lisa: brilho "retrorrefletivo" discreto; asfalto segue a textura
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  {
    float hdL = dot( vColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    roughnessFactor = mix( roughnessFactor, 0.32, smoothstep( 0.35, 0.7, hdL ) );
  }`);
    }
    if (cloud) {
      const lfb = THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= hdCloud;');
      fs = fs.replace('#include <lights_fragment_begin>', `float hdCloud = 1.0 - uCloudAmt * smoothstep( 0.38, 0.78, texture2D( uCloudTex, vHdW.xz * uCloudScale + uCloudOff ).r );
${lfb}`);
    }
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  const ck = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const key = `hd${opts.masked ? 'm' : ''}${opts.surf ? 's' : ''}${cloud ? 'c' : ''}${opts.road ? 'r' : ''}${opts.wind ? 'w' : ''}${opts.foliage ? 'l' : ''}${opts.depthOnly ? 'd' : ''}${envK !== 1 ? 'e' + envK : ''}${opts.facade ? 'f' + opts.facade.tileW + 'x' + opts.facade.tileH : ''}${opts.key || ''}`;
  mat.customProgramCacheKey = () => ck() + '-' + key;
  return mat;
}

/** MeshStandardMaterial HD genérico (cenário). */
export function hdStandard(params = {}, opts = {}) {
  return patchHD(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params }), opts);
}

/** Props/árvores instanciados (máscara de pintura + surf da geometria). */
export function hdMaskedMaterial(params = {}) {
  return patchHD(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...params }), { masked: true, surf: true });
}

/** Lataria/vidros/pneus (jogador e trânsito): Physical com clearcoat (mascarado por surf.z). */
export function hdVehicleMaterial(params = {}) {
  return patchHD(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    envMapIntensity: 1.7, ...params }), { masked: true, surf: true, key: 'veh' });
}

/** Vidro do carro do jogador: escuro e espelhado (reflexo do céu). */
export function hdGlassMaterial() {
  return patchHD(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 2.2 }), { key: 'glass' });
}

/** Fachada HD: textura repetida em metros + roughness/normal map (vidro liso e espelhado, parede fosca). */
export function hdFacadeMaterial(texture, roughnessMap, normalMap, tileW = 6.4, tileH = 3) {
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughnessMap, normalMap, roughness: 1, metalness: 0, envMapIntensity: 0.7 });
  if (normalMap) mat.normalScale.set(0.6, 0.6);
  patchHD(mat, { facade: { tileW, tileH } });
  return addOcclusionCut(mat, 'fhd');
}
