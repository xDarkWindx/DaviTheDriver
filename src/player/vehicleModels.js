// Modelos low-poly dos carros do jogador (tabela MODELS; chave = VEHICLES[*].model).
// Convenção do modelo: frente para +Z, largura em X, chão em y=0; dimensões reais da ficha (m).
// Cada carro = 1 malha de carroceria (cores por vértice) + rodas (InstancedMesh, 4) + luz de freio + sombra blob.
import * as THREE from 'three';
import { GeoBuilder } from '../render/geo.js';
import { makeMaterial } from '../render/materials.js';

const BLACK = 0x17181a, GLASS = 0x1b2228, TIRE = 0x161616;

// ----------------------------------------------------------------- Renault Kwid (facelift), branco
function kwidBody(b, v) {
  const L = v.length, W = v.width, H = v.height;
  const WHITE = 0xf7f7f4, z0 = -L / 2, z1 = L / 2;
  const yb = 0.30, yBelt = 0.92;                                  // base da carroceria / linha de cintura
  // corpo inferior (portas) e capô curto
  b.box(W - 0.06, yBelt - yb, L - 0.2, WHITE, 0, (yb + yBelt) / 2, 0);
  b.box(W - 0.12, 0.10, 0.80, WHITE, 0, yBelt + 0.02, z1 - 0.52, 0, -0.10); // capô levemente inclinado
  // cabine alta: colunas/vidros escuros, teto branco
  const cz0 = z0 + 0.12, cz1 = z1 - 0.95, cl = cz1 - cz0, cm = (cz0 + cz1) / 2;
  b.box(W - 0.20, H - 0.07 - yBelt, cl, GLASS, 0, (yBelt + H - 0.07) / 2, cm);
  b.box(W - 0.16, 0.08, cl - 0.12, WHITE, 0, H - 0.04, cm - 0.02);       // teto branco
  b.box(W - 0.34, 0.06, 0.20, WHITE, 0, H - 0.05, cz0 + 0.02);            // aerofólio branco
  b.box(W - 0.22, 0.42, 0.06, GLASS, 0, yBelt + 0.25, cz1 + 0.10, 0, -0.55); // para-brisa inclinado
  // molduras pretas grossas nas caixas de roda + soleira
  for (const zw of [v.wheelbase / 2, -v.wheelbase / 2]) for (const s of [-1, 1]) {
    b.box(0.10, 0.36, 0.92, BLACK, s * (W / 2 - 0.02), 0.56, zw);
    b.box(0.10, 0.12, 0.92, BLACK, s * (W / 2 - 0.02), 0.78, zw);
  }
  for (const s of [-1, 1]) b.box(0.08, 0.12, v.wheelbase - 0.9, BLACK, s * (W / 2 - 0.02), 0.36, 0);
  // frente: para-choque inferior preto, grade preta com emblema, DRL fino em cima, farol baixo em nicho preto
  b.box(W - 0.04, 0.26, 0.20, BLACK, 0, 0.42, z1 - 0.12);
  b.box(W - 0.30, 0.14, 0.06, BLACK, 0, 0.80, z1 - 0.07);
  b.box(0.16, 0.10, 0.04, 0xd8d8d8, 0, 0.80, z1 - 0.04);                   // emblema
  for (const s of [-1, 1]) {
    b.box(0.34, 0.035, 0.04, 0xeaf4ff, s * (W / 2 - 0.28), 0.86, z1 - 0.06); // DRL
    b.box(0.30, 0.20, 0.06, BLACK, s * (W / 2 - 0.22), 0.62, z1 - 0.07);     // nicho
    b.box(0.20, 0.12, 0.04, 0xf2f2ea, s * (W / 2 - 0.22), 0.62, z1 - 0.04);  // farol
    b.box(0.14, 0.08, 0.05, 0x222222, s * (W / 2 - 0.20), 0.43, z1 - 0.01);  // nicho neblina
  }
  // traseira: para-choque inferior preto, lanternas grandes arredondadas nos cantos invadindo a lateral
  b.box(W - 0.04, 0.30, 0.20, BLACK, 0, 0.44, z0 + 0.10);
  for (const s of [-1, 1]) {
    b.box(0.30, 0.26, 0.06, 0xc8202a, s * (W / 2 - 0.18), 0.98, z0 + 0.07);
    b.box(0.05, 0.24, 0.26, 0xc8202a, s * (W / 2 - 0.03), 0.98, z0 + 0.17);
    b.box(0.08, 0.06, 0.12, BLACK, s * (W / 2 + 0.02), yBelt + 0.04, cz1 - 0.08); // retrovisor
    b.box(0.03, 0.03, 0.10, BLACK, s * (W / 2 - 0.01), 0.80, 0.05);            // maçaneta
  }
  b.box(0.12, 0.08, 0.04, 0xd8d8d8, 0, 0.80, z0 + 0.02);                      // emblema traseiro
  // antena no teto, na frente
  b.box(0.02, 0.36, 0.02, BLACK, 0.18, H + 0.16, cz1 - 0.22, 0, -0.5);
}
function kwidWheel(b, r, w) {
  b.cyl(r, r, w, 10, TIRE, 0, 0, 0, 0, 0, Math.PI / 2);
  b.cyl(r * 0.62, r * 0.62, 0.02, 10, 0x3c3f45, w / 2 + 0.005, 0, 0, 0, 0, Math.PI / 2);     // calota grafite
  for (let i = 0; i < 6; i++) b.box(0.012, r * 1.05, 0.05, 0x2a2c30, w / 2 + 0.018, 0, 0, 0, i * Math.PI / 3);
}

// ----------------------------------------------------------------- Citroën C4 Cactus THP, cinza grafite
function cactusBody(b, v) {
  const L = v.length, W = v.width, H = v.height;
  const GRAY = 0x6d7279, ROOF = 0x111214, ORANGE = 0xff6a1a, z0 = -L / 2, z1 = L / 2;
  const yb = 0.34, yBelt = 0.98;
  b.box(W - 0.06, yBelt - yb, L - 0.22, GRAY, 0, (yb + yBelt) / 2, 0);
  b.box(W - 0.10, 0.10, 1.05, GRAY, 0, yBelt + 0.02, z1 - 0.62, 0, -0.07);   // capô longo
  // "cabine flutuante" preta: colunas e vidros escuros + teto preto, barras de teto
  const cz0 = z0 + 0.18, cz1 = z1 - 1.18, cl = cz1 - cz0, cm = (cz0 + cz1) / 2;
  b.box(W - 0.18, H - 0.08 - yBelt, cl, 0x14171a, 0, (yBelt + H - 0.08) / 2, cm);
  b.box(W - 0.16, 0.08, cl - 0.08, ROOF, 0, H - 0.04, cm);
  b.box(W - 0.22, 0.46, 0.06, GLASS, 0, yBelt + 0.26, cz1 + 0.13, 0, -0.62);    // para-brisa
  for (const s of [-1, 1]) {
    b.box(0.06, 0.07, cl - 0.1, 0x0c0c0d, s * (W / 2 - 0.22), H + 0.05, cm);  // barras de teto
    for (const zz of [cz0 + 0.15, cz1 - 0.15]) b.box(0.07, 0.07, 0.10, 0x0c0c0d, s * (W / 2 - 0.22), H + 0.01, zz);
  }
  b.box(0.06, 0.07, 0.16, ROOF, 0, H + 0.03, cz0 + 0.30);                      // antena
  // molduras pretas nas caixas de roda e soleiras
  for (const zw of [v.wheelbase / 2, -v.wheelbase / 2]) for (const s of [-1, 1]) {
    b.box(0.10, 0.40, 1.00, BLACK, s * (W / 2 - 0.02), 0.62, zw);
    b.box(0.10, 0.10, 1.00, BLACK, s * (W / 2 - 0.02), 0.86, zw);
  }
  for (const s of [-1, 1]) {
    b.box(0.09, 0.16, v.wheelbase - 1.0, BLACK, s * (W / 2 - 0.02), 0.42, 0);
    b.box(0.05, 0.10, 0.28, BLACK, s * (W / 2 + 0.01), 0.52, 0.55);            // airbump discreta baixa
    b.box(0.06, 0.06, 0.14, ORANGE, s * (W / 2 + 0.03), 0.52, 0.55);           // aro laranja
  }
  // frente em dois andares: DRL fino em cima ligado ao emblema; farol abaixo em nicho preto; grade inferior larga
  b.box(W - 0.20, 0.035, 0.04, 0xdfe8ee, 0, 0.92, z1 - 0.06);
  b.box(0.22, 0.08, 0.05, 0xd0d0d0, 0, 0.90, z1 - 0.05);                         // chevrons
  b.box(W - 0.10, 0.30, 0.20, BLACK, 0, 0.42, z1 - 0.12);                          // para-choque/grade inferior
  for (const s of [-1, 1]) {
    b.box(0.40, 0.18, 0.06, BLACK, s * (W / 2 - 0.26), 0.72, z1 - 0.07);
    b.box(0.30, 0.10, 0.04, 0xf2f2ea, s * (W / 2 - 0.26), 0.72, z1 - 0.04);       // farol
    b.box(0.22, 0.14, 0.05, ORANGE, s * (W / 2 - 0.22), 0.44, z1 - 0.01);          // moldura laranja neblina
    b.box(0.12, 0.07, 0.05, 0xdedede, s * (W / 2 - 0.22), 0.44, z1 + 0.005);
  }
  // traseira: para-choque inferior preto grosso, lanternas horizontais largas e finas
  b.box(W - 0.04, 0.40, 0.22, BLACK, 0, 0.50, z0 + 0.11);
  for (const s of [-1, 1]) {
    b.box(0.52, 0.11, 0.06, 0xd0212b, s * (W / 2 - 0.32), 1.00, z0 + 0.08);
    b.box(0.05, 0.10, 0.18, 0xd0212b, s * (W / 2 - 0.03), 1.00, z0 + 0.16);
    b.box(0.10, 0.08, 0.14, BLACK, s * (W / 2 + 0.03), yBelt + 0.06, cz1 - 0.10); // retrovisores pretos
  }
  b.box(0.18, 0.08, 0.04, 0xd0d0d0, 0, 0.85, z0 + 0.02);
}
function cactusWheel(b, r, w) {
  b.cyl(r, r, w, 12, TIRE, 0, 0, 0, 0, 0, Math.PI / 2);
  b.cyl(r * 0.68, r * 0.68, 0.02, 12, 0x1f2023, w / 2 + 0.005, 0, 0, 0, 0, Math.PI / 2);   // aro preto
  for (let i = 0; i < 5; i++) b.box(0.014, r * 1.2, 0.08, 0xd6d8dc, w / 2 + 0.02, 0, 0, 0, i * Math.PI * 2 / 5); // raios diamantados
}

export const MODELS = {
  kwid: { body: kwidBody, wheel: kwidWheel, wheelR: 0.29, wheelW: 0.18, brake: [[0.30, 0.26], 0.98] },
  cactus: { body: cactusBody, wheel: cactusWheel, wheelR: 0.33, wheelW: 0.21, brake: [[0.52, 0.11], 1.00] },
};

/** Geometria mesclada da carroceria (útil para instanciar cópias, ex.: tráfego). */
export function buildBodyGeometry(vehicle) {
  const b = new GeoBuilder();
  MODELS[vehicle.model].body(b, vehicle);
  return b.build();
}

/**
 * Constrói o modelo completo do veículo do jogador.
 * Retorna { root, body, wheels, wheelSlots, brake, shadow, wheelR }.
 *  root: Object3D posicionado pelo player (x,z,heading); body: Group com rolagem.
 */
export function buildVehicleModel(vehicle, quality, blobTexture) {
  const M = MODELS[vehicle.model];
  const root = new THREE.Group(); root.name = 'vehicle:' + vehicle.id;
  const body = new THREE.Group(); root.add(body);
  const mat = makeMaterial(quality, { vertexColors: true });
  const bodyMesh = new THREE.Mesh(buildBodyGeometry(vehicle), mat);
  bodyMesh.name = 'body';
  body.add(bodyMesh);
  // rodas instanciadas
  const wb = new GeoBuilder(); M.wheel(wb, M.wheelR, M.wheelW);
  const wheels = new THREE.InstancedMesh(wb.build(), mat, 4);
  wheels.frustumCulled = false;
  root.add(wheels);
  const tx = vehicle.width / 2 - M.wheelW / 2 - 0.04;
  const wheelSlots = [
    { x: -tx, z: vehicle.wheelbase / 2, front: true, side: -1 }, { x: tx, z: vehicle.wheelbase / 2, front: true, side: 1 },
    { x: -tx, z: -vehicle.wheelbase / 2, front: false, side: -1 }, { x: tx, z: -vehicle.wheelbase / 2, front: false, side: 1 },
  ];
  // luzes de freio (malha separada, só visível freando)
  const bb = new GeoBuilder();
  const [[bw, bh], by] = M.brake;
  for (const s of [-1, 1]) bb.box(bw + 0.03, bh + 0.03, 0.04, 0xff2a2a, s * (vehicle.width / 2 - 0.05 - bw / 2), by, -vehicle.length / 2 + 0.04);
  const brake = new THREE.Mesh(bb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  brake.visible = false; brake.name = 'brake';
  body.add(brake);
  // sombra blob (sem shadow map)
  let shadow = null;
  if (quality.shadows !== 'none') {
    const sg = new THREE.PlaneGeometry(vehicle.width * 1.9, vehicle.length * 1.45); sg.rotateX(-Math.PI / 2);
    shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture, transparent: true, opacity: 0.55, depthWrite: false }));
    shadow.position.set(0.15, 0.1, 0.2); shadow.renderOrder = 2; shadow.name = 'shadow';
    root.add(shadow);
  }
  return { root, body, wheels, wheelSlots, brake, shadow, wheelR: M.wheelR };
}
