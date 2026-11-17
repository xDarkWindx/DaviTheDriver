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
