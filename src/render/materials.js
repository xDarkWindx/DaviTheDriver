// Fábrica de materiais guiada pelo perfil de qualidade (QUALITY[*].materialKind).
import * as THREE from 'three';

/**
 * makeMaterial(quality, params) -> Material
 *  params: os mesmos de MeshLambertMaterial (color, map, vertexColors, transparent, ...).
 *  'lambert' (padrão) | 'basic' (sem luz) | 'standard' (hd/TODO: usa MeshStandardMaterial, roughness 0.9).
 */
export function makeMaterial(quality, params = {}) {
  const kind = (quality && quality.materialKind) || 'lambert';
  if (kind === 'basic') return new THREE.MeshBasicMaterial(params);
  if (kind === 'standard') return new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  return new THREE.MeshLambertMaterial(params);
}

/**
 * Estado vivo de sombra (lido por quem precisa trocar de sombra projetada para blob em tempo real,
 * ex.: sombra blob do carro do jogador). Mantido por render/renderer.js (ajuste automático).
 */
export const LIVE_SHADOW = { map: false };

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
  return mat;
}
