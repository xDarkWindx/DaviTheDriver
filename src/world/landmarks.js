// Marcos low-poly de Brasília. Cada marco = UMA geometria mesclada (GeoBuilder) => 1 draw call.
// Também registra colisores estáticos e devolve posições (para HUD/minimapa).
import * as THREE from 'three';
import { GeoBuilder } from '../render/geo.js';
import { makeOBB, makeCircle } from '../core/collision.js';

const WHITE = 0xf2f0ea, CONCRETE = 0xd8d3c6, GLASS = 0x3f6f7d, DARKGLASS = 0x2c4650, GREEN_GLASS = 0x4f8a7a;

function torreTV(b) {
  // base em tripé, torre treliçada afinando, mirante e antena
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    b.box(1.6, 26, 1.6, CONCRETE, Math.cos(a) * 6, 12, Math.sin(a) * 6, -a, 0, 0);
  }
  b.cyl(5.5, 7.5, 6, 6, CONCRETE, 0, 24, 0);
  b.cyl(2.2, 4.8, 40, 4, 0x9a9890, 0, 47, 0, 0, Math.PI / 4, 0);
  for (let y = 30; y < 66; y += 6) b.cyl(4.2 - (y - 30) * 0.06, 4.4 - (y - 30) * 0.06, 0.5, 4, 0x6e6c66, 0, y, 0, 0, Math.PI / 4, 0);
  b.cyl(6.5, 5, 3, 8, WHITE, 0, 68, 0);              // mirante
  b.cyl(6.6, 6.6, 1.2, 8, DARKGLASS, 0, 69.6, 0);
  b.cyl(1.2, 1.6, 22, 6, 0xb33a2a, 0, 81, 0);         // antena vermelha/branca
  b.cyl(0.6, 1.0, 10, 6, WHITE, 0, 97, 0);
}

function estadio(b) {
  // anel oval de colunas brancas + cobertura + gramado
  const rx = 78, rz = 62, N = 44;
  b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 0x5fa046, 0, 0.3, 0, 0, 0, 0, rx - 14, 0.6, rz - 14); // campo
  b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 0x9c9a94, 0, 6, 0, 0, 0, 0, rx - 4, 12, rz - 4);      // arquibancada (miolo)
  b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 0x5fa046, 0, 12.2, 0, 0, 0, 0, rx - 24, 0.4, rz - 24);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    b.box(1.6, 24, 1.6, WHITE, Math.cos(a) * rx, 12, Math.sin(a) * rz);
  }
  // cobertura: anel de placas
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, a2 = ((i + 0.5) / N) * Math.PI * 2;
    const x = Math.cos(a2) * (rx - 8), z = Math.sin(a2) * (rz - 8);
    b.box(12.5, 0.8, 18, 0xe9e7e0, x, 24.4, z, -a2 + Math.PI / 2);
    void a;
  }
}

function catedral(b) {
  // 16 pilares curvos (hiperboloide) aproximados por 2 segmentos inclinados cada + vitral
  const N = 16, R0 = 16, Rw = 6, H = 32;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    // segmento inferior: de R0 (chão) até Rw (cintura, y=H*0.55)
    const x0 = ca * R0, z0 = sa * R0, x1 = ca * Rw, z1 = sa * Rw, y1 = H * 0.55;
    const len1 = Math.hypot(R0 - Rw, y1), tilt1 = Math.atan2(R0 - Rw, y1);
    b.box(1.3, len1, 1.8, WHITE, (x0 + x1) / 2, y1 / 2, (z0 + z1) / 2, -a + Math.PI / 2, tilt1, 0);
    const x2 = ca * (Rw + 7), z2 = sa * (Rw + 7);
    const len2 = Math.hypot(7, H - y1), tilt2 = -Math.atan2(7, H - y1);
    b.box(1.1, len2, 1.5, WHITE, (x1 + x2) / 2, (y1 + H) / 2, (z1 + z2) / 2, -a + Math.PI / 2, tilt2, 0);
  }
  b.cyl(Rw + 6, R0 - 1, H * 0.55, 16, 0x5f8fb0, 0, H * 0.275, 0);   // vitral azul
  b.cyl(Rw + 6.5, Rw + 0.5, H * 0.4, 16, 0x6f9fc0, 0, H * 0.55 + H * 0.2, 0);
  b.cyl(R0 + 3, R0 + 3, 0.6, 24, CONCRETE, 0, 0.3, 0);
  // campanário
  b.box(1.2, 18, 1.2, CONCRETE, 26, 9, -6); b.box(1.2, 18, 1.2, CONCRETE, 26, 9, 6);
  b.box(1.4, 0.8, 13, CONCRETE, 26, 18, 0);
  // cruz no topo
  b.box(0.5, 7, 0.5, 0xc9a85a, 0, H + 3, 0); b.box(3, 0.5, 0.5, 0xc9a85a, 0, H + 4.5, 0);
}

function museu(b) {
  const g = new THREE.SphereGeometry(18, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(g, WHITE, 0, 0, 0, 0, 0, 0, 1, 0.75, 1); g.dispose();
  b.box(30, 0.6, 3, WHITE, 8, 7, 20, 0.3, 0, -0.25); // rampa
}

function teatro(b) {
  // pirâmide truncada (Teatro Nacional)
  b.cyl(22, 40, 26, 4, 0xbfb7a6, 0, 13, 0, 0, Math.PI / 4, 0);
  b.cyl(22.2, 22.2, 0.6, 4, 0x8f8778, 0, 26.2, 0, 0, Math.PI / 4, 0);
}

function rodoviaria(b) {
  b.box(66, 1.2, 40, CONCRETE, 0, 7, 0);
  for (let i = -3; i <= 3; i++) for (const zz of [-16, 0, 16]) b.box(1.4, 7, 1.4, 0xbdb7aa, i * 10, 3.5, zz);
  b.box(60, 3.2, 34, 0x7d8f9a, 0, 9.4, 0);   // pavilhão
  b.box(62, 0.6, 36, 0xe8e4da, 0, 11.3, 0);
}

function congresso(b) {
  // plataforma baixa
  b.box(150, 6, 60, WHITE, 0, 3, 0);
  b.box(150.4, 1.2, 60.4, DARKGLASS, 0, 4, 0);
  // torres gêmeas (H) com passarela
  for (const zz of [-6, 6]) {
    b.box(18, 70, 8, 0xe8e6de, 20, 41, zz);
    for (let y = 9; y < 76; y += 3.2) b.box(18.2, 1.2, 8.2, DARKGLASS, 20, y, zz);
  }
  b.box(18, 3, 4.5, 0xe8e6de, 20, 50, 0);
  // Senado: cúpula para baixo (côncava para baixo) | Câmara: cuia para cima
  const dome = new THREE.SphereGeometry(16, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(dome, WHITE, -30, 6, -14, 0, 0, 0, 1, 0.55, 1);
  const bowl = new THREE.SphereGeometry(24, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(bowl, WHITE, -32, 6 + 13, 18, 0, 0, 0, 1, 0.55, 1);
  b.cyl(24, 24, 0.4, 16, 0xd3d0c6, -32, 19, 18);
  dome.dispose(); bowl.dispose();
  // espelho d'água
  b.box(60, 0.2, 20, 0x5f8fa8, 50, 0.1, 0);
}

function stj(b) {
  // STJ (SAFS): bloco horizontal branco com colunata de arcos e faixa de vidro escuro + bloco alto atrás
  b.box(170, 3, 46, CONCRETE, 0, 1.5, 0);                // embasamento
  b.box(160, 12, 34, WHITE, 0, 9, 0);                    // corpo principal
  b.box(160.4, 4, 34.4, DARKGLASS, 0, 9.5, 0);           // faixa de vidro
  for (let i = -15; i <= 15; i++) {                      // colunata frontal (lado norte, rua)
    b.box(1.2, 14, 1.2, WHITE, i * 5.2, 8, -20);
    const arc = new THREE.TorusGeometry(2.6, 0.5, 4, 8, Math.PI);
    b.add(arc, WHITE, i * 5.2 + 2.6, 15, -20);
    arc.dispose();
  }
  b.box(165, 1.5, 44, WHITE, 0, 16.5, 0);                // marquise
  b.box(60, 30, 20, 0xebe8e0, 40, 15, 14);               // torre administrativa
  for (let y = 4; y < 30; y += 3.4) b.box(60.2, 1.3, 20.2, GLASS, 40, y, 14);
  // mastro com bandeira
  b.box(0.3, 18, 0.3, 0xcccccc, -70, 9, -32);
  b.box(4, 2.6, 0.1, 0x1f9a3e, -68, 16.4, -32);
  b.box(1.6, 1.0, 0.12, 0xf2d21a, -68, 16.4, -32);
}

function casa(b) {
  // bloco residencial do Davi: 6 andares sobre pilotis, com sacadas e caixa d'água
  const W = 48, D = 12, P = 3.2, F = 3;
  for (let i = -3; i <= 3; i++) for (const zz of [-4, 4]) b.box(0.8, P, 0.8, CONCRETE, i * 7.5, P / 2, zz);
  b.box(W, 6 * F, D, 0xf3e9d7, 0, P + 3 * F, 0);
  for (let f = 0; f < 6; f++) {
    b.box(W + 0.2, 1.1, D + 0.2, 0x3e5560, 0, P + f * F + 1.7, 0);
    b.box(W - 4, 0.25, 1.4, WHITE, 0, P + f * F + 1.05, D / 2 + 0.6);
  }
  b.box(W + 1, 0.6, D + 1, 0xd6c9b0, 0, P + 6 * F + 0.3, 0);
  b.box(6, 3, 5, CONCRETE, 10, P + 6 * F + 2, 0);
}

function memorialJK(b) {
  // pedestal branco + coluna curva com a estátua de JK no topo
  b.box(40, 4, 26, WHITE, 0, 2, 0);
  b.box(36, 0.6, 22, 0xd8d3c6, 0, 4.3, 0);
  b.cyl(1.4, 2.2, 22, 6, WHITE, 12, 15, 0, 0, 0, -0.12);
  b.cyl(1.6, 1.6, 4, 6, 0x6f6a5e, 13.3, 27, 0, 0, 0, -0.12);    // estátua (bronze escurecido)
  const half = new THREE.SphereGeometry(7, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(half, WHITE, -8, 4.5, 0, 0, 0, 0, 1, 0.6, 1); half.dispose();
}

function catedralMilitar(b) {
  // Catedral Militar Rainha da Paz: "tenda" branca triangular
  b.add(new THREE.CylinderGeometry(0, 16, 20, 3, 1), WHITE, 0, 10, 0, 0, Math.PI / 6, 0);
  b.box(2, 8, 2, CONCRETE, 18, 4, 8);
  b.box(0.4, 4, 0.4, 0xc9a85a, 0, 22, 0); b.box(2, 0.4, 0.4, 0xc9a85a, 0, 23, 0);
}

/**
 * Constrói marcos. Retorna { list: [{ id, name, x, z }], meshes }.
 */
export function buildLandmarks(scene, colliders, material) {
  const list = [], meshes = [];
  const place = (id, name, x, z, rotY, fn, colliderSpecs) => {
    const b = new GeoBuilder();
    fn(b);
    const mesh = new THREE.Mesh(b.build(), material);
    mesh.position.set(x, 0, z); mesh.rotation.y = rotY;
    mesh.name = 'landmark:' + id;
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    scene.add(mesh); meshes.push(mesh);
    list.push({ id, name, x, z });
    for (const c of colliderSpecs) {
      const col = c.r ? makeCircle(x + c.x, z + c.z, c.r) : makeOBB(x + c.x, z + c.z, c.hx, c.hz, rotY + (c.a || 0));
      col.kind = 'landmark'; col.id = id;
      colliders.add(col);
    }
  };
  place('torre', 'Torre de TV', -330, 0, 0.3, torreTV, [{ x: 0, z: 0, r: 8.5 }]);
  place('estadio', 'Estádio Mané Garrincha', -620, -240, 0, estadio, [{ x: 0, z: 0, hx: 80, hz: 64 }]);
  place('rodoviaria', 'Rodoviária do Plano Piloto', 62, 0, 0, rodoviaria, [{ x: 0, z: 0, hx: 33, hz: 20 }]);
  place('catedral', 'Catedral de Brasília', 300, 108, 0, catedral, [{ x: 0, z: 0, r: 18 }, { x: 26, z: 0, hx: 1.5, hz: 7 }]);
  place('museu', 'Museu Nacional', 205, 112, 0, museu, [{ x: 0, z: 0, r: 18 }]);
  place('teatro', 'Teatro Nacional', 200, -112, 0, teatro, [{ x: 0, z: 0, hx: 28, hz: 28 }]);
  place('congresso', 'Congresso Nacional', 960, 0, Math.PI / 2, congresso, [{ x: 0, z: 0, hx: 75, hz: 30 }]);
  place('stj', 'Superior Tribunal de Justiça', 650, 330, 0, stj, [{ x: 0, z: 0, hx: 85, hz: 23 }, { x: 40, z: 14, hx: 30, hz: 10 }]);
  place('memorial', 'Memorial JK', -1130, -110, 0, memorialJK, [{ x: 0, z: 0, hx: 20, hz: 13 }]);
  place('catedralMilitar', 'Catedral Militar Rainha da Paz', -1600, -100, 0, catedralMilitar, [{ x: 0, z: 0, r: 13 }]);
  place('casa', 'QRSW 2 — Sudoeste', -1390, 166, 0, casa, [{ x: 0, z: 0, hx: 24.5, hz: 6.5 }]);
  return { list, meshes };
}
