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
