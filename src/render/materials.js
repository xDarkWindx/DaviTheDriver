// Fábrica de materiais guiada pelo perfil de qualidade (QUALITY[*].materialKind).
import * as THREE from 'three';
import { hdStandard } from './hdMaterials.js';

/**
 * makeMaterial(quality, params) -> Material
 *  params: os mesmos de MeshLambertMaterial (color, map, vertexColors, transparent, ...).
 *  'lambert' (padrão) | 'basic' (sem luz) | 'standard' (HD: MeshStandardMaterial roughness 0.9 + sombra de nuvem;
 *  `hdOpts` = opções de render/hdMaterials.patchHD, ex.: { road: true }).
 */
export function makeMaterial(quality, params = {}, hdOpts = {}) {
  const kind = (quality && quality.materialKind) || 'lambert';
  if (kind === 'basic') return new THREE.MeshBasicMaterial(params);
  if (kind === 'standard') return hdStandard(params, hdOpts);
  return new THREE.MeshLambertMaterial(params);
}

/**
 * Estado vivo de sombra (lido por quem precisa trocar de sombra projetada para blob em tempo real,
 * ex.: sombra blob do carro do jogador). Mantido por render/renderer.js (ajuste automático).
 */
export const LIVE_SHADOW = { map: false, traffic: false }; // traffic: só HD (carros/pedestres no shadow map)

/**
 * RECORTE DE OCLUSÃO (prédios/marcos entre a câmera e o jogador): uniforms compartilhados por todos os materiais que
 * chamam addOcclusionCut. O núcleo atualiza `uFocus` (jogador) e `uCamDir` (do foco para a câmera) a cada frame; o
 * shader descarta, em padrão pontilhado ("screen-door", sem ordenar transparência), os fragmentos que estão À FRENTE
 * do foco (lado da câmera) e a menos de `uRadius` m da linha de visada. Custo: alguns ALUs por fragmento, 0 draw call.
 */
export const OCCLUSION = {
  uFocus: { value: new THREE.Vector3(0, -9999, 0) }, uCamDir: { value: new THREE.Vector3(0, 1, 0) },
  uRadius: { value: 5.5 }, uOn: { value: 1 }, // uRadius (m): só o "furo" em volta do carro (antes 9 m pontilhava área demais)
};
export function addOcclusionCut(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uFocus = OCCLUSION.uFocus; sh.uniforms.uCamDir = OCCLUSION.uCamDir; sh.uniforms.uRadius = OCCLUSION.uRadius; sh.uniforms.uOn = OCCLUSION.uOn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOccW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec4 ow = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      ow = instanceMatrix * ow;
    #endif
    vOccW = ( modelMatrix * ow ).xyz;
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOccW;\nuniform vec3 uFocus; uniform vec3 uCamDir; uniform float uRadius; uniform float uOn;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( uOn > 0.5 ) {
    vec3 od = vOccW - uFocus; float along = dot( od, uCamDir );
    if ( along > 1.0 ) {
      float rr = length( od - uCamDir * along );
      float k = 1.0 - smoothstep( uRadius * 0.55, uRadius, rr );
      vec2 pp = mod( floor( gl_FragCoord.xy ), 2.0 );
      if ( k > 0.0 && ( pp.x + pp.y * 2.0 + 0.5 ) / 4.0 < k * 0.85 ) discard;
    }
  }`);
  };
  const ck = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => ck() + '-occ' + (key || '');
  return mat;
}

/**
 * Material com MÁSCARA DE PINTURA para InstancedMesh: a cor da instância só tinge vértices com
 * atributo `paint` = 1 (copas de árvore, lataria); o resto (tronco, vidro, pneu) mantém a cor do vértice.
 * kind: 'lambert' | 'phong'. params: os do material three.
 */
export function makeMaskedMaterial(kind = 'lambert', params = {}) {
  const M = kind === 'phong' ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial;
  const mat = new M({ vertexColors: true, ...params });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;')
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, paint );'));
  };
  mat.customProgramCacheKey = () => 'masked-' + kind;
  return mat;
}

/**
 * Material de FACHADA para InstancedMesh de caixas unitárias (base em y=0): a textura (1 célula = tileW × tileH m)
 * é repetida em METROS a partir da escala de cada instância (sem esticar). Faces de cima/baixo usam o canto
 * liso da textura. Cor final = textura × cor da instância. Recebe/projeta sombra como qualquer Lambert.
 */
export function makeFacadeMaterial(texture, tileW = 6.4, tileH = 3) {
  const mat = new THREE.MeshLambertMaterial({ map: texture });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  {
    vec3 isc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
    vec2 fuv;
    if ( abs( normal.y ) > 0.5 ) fuv = vec2( 0.02 * ${tileW.toFixed(3)}, 0.02 * ${tileH.toFixed(3)} );
    else if ( abs( normal.x ) > 0.5 ) fuv = vec2( ( position.z + 0.5 ) * isc.z, position.y * isc.y );
    else fuv = vec2( ( position.x + 0.5 ) * isc.x, position.y * isc.y );
    vMapUv = fuv / vec2( ${tileW.toFixed(3)}, ${tileH.toFixed(3)} );
  }
#endif`);
  };
  mat.customProgramCacheKey = () => `facade-${tileW}-${tileH}`;
  return addOcclusionCut(mat, 'f');
}
