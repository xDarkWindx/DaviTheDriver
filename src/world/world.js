// Montagem do mundo: chão, vias, cenário, marcos, semáforos, placas, colisores e dados de minimapa.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeRng } from '../core/math.js';
import { StaticColliders, makeOBB } from '../core/collision.js';
import { ChunkedInstancer, ChunkedMeshBuilder } from '../render/instancer.js';
import { makeMaterial } from '../render/materials.js';
import { makeGroundTexture, makeAsphaltTexture, makeSignAtlas, makeBlobTexture } from '../render/textures.js';
import { buildRoadMeshes } from './roadMesh.js';
import { SceneryBuilder, buildScenery } from './scenery.js';
import { buildLandmarks } from './landmarks.js';
import { SignalController } from './signals.js';

// Placas verdes de via (texto pt-BR) e letreiros. Atlas único => 1 draw call.
const SIGN_ENTRIES = [
  { key: 'eixo', text: 'EIXO MONUMENTAL', sub: 'Esplanada · Congresso', bg: '#1f6b3a', fg: '#ffffff', w: 360, h: 110 },
  { key: 'epig', text: 'EPIG', sub: 'Sudoeste · Eixo Monumental', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'w3', text: 'W3 SUL', sub: 'Superquadras 500/700', bg: '#1f6b3a', fg: '#ffffff', w: 280, h: 110 },
  { key: 'l2', text: 'L2 SUL', sub: 'SAFS · STJ', bg: '#1f6b3a', fg: '#ffffff', w: 280, h: 110 },
  { key: 'eixao', text: 'EIXÃO SUL', sub: 'Eixo Rodoviário', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'tesourinha', text: 'TESOURINHA', sub: 'Acesso ao Eixão', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'safs', text: 'SAFS', sub: 'Superior Tribunal de Justiça', bg: '#1f3f8a', fg: '#ffffff', w: 340, h: 110 },
  { key: 'sudoeste', text: 'SUDOESTE', sub: 'Quadras residenciais', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'parque', text: 'PARQUE DA CIDADE', sub: 'Sarah Kubitschek', bg: '#7a4b22', fg: '#ffffff', w: 360, h: 110 },
  { key: 'esplanada', text: 'ESPLANADA', sub: 'dos Ministérios', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'rodo', text: 'RODOVIÁRIA', sub: 'Plano Piloto', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'roof_stj', text: 'STJ', sub: 'SUPERIOR TRIBUNAL DE JUSTIÇA', bg: '#f4f2ec', fg: '#1d3d7a', w: 520, h: 150 },
  { key: 'roof_casa', text: 'CASA DO DAVI', bg: '#f3e9d7', fg: '#b4322a', w: 420, h: 90 },
];
// [chave, x, z] — placas em pé, viradas para a câmera (sempre legíveis na isométrica)
const SIGN_SPOTS = [
  ['sudoeste', -1450, 362], ['epig', -1238, 280], ['eixo', -900, 58], ['parque', -1060, 340],
  ['w3', -585, 300], ['eixao', 22, 380], ['tesourinha', -40, 718], ['l2', 516, 640], ['safs', 818, 120],
  ['esplanada', 360, 58], ['rodo', 120, -28], ['eixo', -560, 58], ['safs', 516, 300],
];

export function buildWorld({ view, net, quality, events, cameraDir }) {
  const scene = view.scene;
  const rng = makeRng(1234);
  const chunk = quality.chunkSize;
  const colliders = new StaticColliders(32);
  const inst = new ChunkedInstancer(scene, chunk);
  const mb = new ChunkedMeshBuilder(chunk);

  // ---------- materiais
  const lambertVC = makeMaterial(quality, { vertexColors: true });
  const instMat = makeMaterial(quality, {});
  const blobTex = makeBlobTexture(64);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, opacity: 0.32, depthWrite: false });

  // ---------- tipos instanciados (base em y=0)
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 5, 1); trunk.translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const tuft = new THREE.ConeGeometry(0.6, 1, 5, 1); tuft.translate(0, 0.5, 0);
  const blob = new THREE.PlaneGeometry(1, 1); blob.rotateX(-Math.PI / 2);
  inst.registerType('box', box, instMat);
  inst.registerType('trunk', trunk, instMat);
  inst.registerType('crown', crown, makeMaterial(quality, { flatShading: true }));
  inst.registerType('tuft', tuft, instMat);
  inst.registerType('blob', blob, blobMat, { renderOrder: 1 });

  // ---------- chão (cerrado)
  const B = net.bounds;
  const gTex = makeGroundTexture(quality.textureSize, quality.anisotropy);
  const gw = B.maxX - B.minX + 1600, gh = B.maxZ - B.minZ + 1600;
  gTex.repeat.set(gw / 48, gh / 48);
  const groundMat = makeMaterial(quality, { map: gTex, color: 0xffffff });
  view.tintables.push(groundMat);
  const groundGeo = new THREE.PlaneGeometry(gw, gh); groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
  ground.name = 'ground'; ground.updateMatrix(); ground.matrixAutoUpdate = false;
  scene.add(ground);

  // ---------- vias (asfalto com textura de detalhe em UV de mundo)
  const aTex = makeAsphaltTexture(quality.textureSize, quality.anisotropy);
  const roadMat = makeMaterial(quality, { vertexColors: true, map: aTex });
  buildRoadMeshes(net, mb, inst);

  // ---------- cenário
  const sb = new SceneryBuilder({ net, inst, mb, colliders, quality, rng });
  // colisores dos marcos primeiro (cenário evita sobrepor)
  const landmarkMat = makeMaterial(quality, { vertexColors: true });
  const landmarks = buildLandmarks(scene, colliders, landmarkMat);
  // semáforos
  const signals = new SignalController(net, events);
  signals.buildVisual(scene, inst, quality);
  for (const s of net.signals) for (const ap of s.approaches) {
    const c = makeOBB(ap.poleX, ap.poleZ, 0.2, 0.2, 0); c.kind = 'pole'; colliders.add(c);
  }
  buildScenery(sb);

  // limites do mapa (muros invisíveis)
  const W = 20;
  for (const [x, z, hx, hz] of [
    [(B.minX + B.maxX) / 2, B.minZ - W, (B.maxX - B.minX) / 2 + W * 2, W], [(B.minX + B.maxX) / 2, B.maxZ + W, (B.maxX - B.minX) / 2 + W * 2, W],
    [B.minX - W, (B.minZ + B.maxZ) / 2, W, (B.maxZ - B.minZ) / 2 + W * 2], [B.maxX + W, (B.minZ + B.maxZ) / 2, W, (B.maxZ - B.minZ) / 2 + W * 2]]) {
    const c = makeOBB(x, z, hx, hz, 0); c.kind = 'wall'; colliders.add(c);
  }

  // ---------- placas (atlas)
  const atlas = makeSignAtlas(SIGN_ENTRIES, quality.signTextureWidth, quality.anisotropy);
  const signGeo = buildSigns(atlas, cameraDir, inst, colliders);
  const signMesh = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: atlas.texture }));
  signMesh.name = 'signs'; signMesh.matrixAutoUpdate = false; scene.add(signMesh);

  const groundMeshes = mb.build(scene, roadMat, 'roads', 8);
  const instMeshes = inst.build();

  return {
    net, colliders, signals, landmarks: landmarks.list,
    stats: { ...sb.stats, instances: inst.count(), instancedMeshes: instMeshes.length, groundMeshes: groundMeshes.length, colliders: colliders.all.length },
    materials: { lambertVC, instMat, roadMat, groundMat, blobMat },
    blobTexture: blobTex,
    chunkSize: chunk,
    /** Dados para o minimapa (o desenho é da UI). Coordenadas de mundo (x leste, z sul). */
    getMinimapData() {
      const roads = [];
      for (const s of net.segments.values()) {
        const pts = new Float32Array(s.pts);
        roads.push({ id: s.id, name: s.name, kind: s.kind, width: s.edgeR - s.edgeL, oneWay: s.oneWay, pts });
      }
      return {
        bounds: { ...B },
        roads,
        roundabouts: net.roundabouts.map((r) => ({ id: r.id, x: r.x, z: r.z, r: r.radius })),
        landmarks: landmarks.list.slice(),
        zones: { ...net.zones },
        signals: net.signals.map((s) => ({ id: s.id, x: s.x, z: s.z })),
      };
    },
  };
}

/** Placas em pé (face para a câmera) + letreiros de telhado. Uma geometria com UV do atlas. */
function buildSigns(atlas, camDir, inst, colliders) {
  const pos = [], uv = [], nor = [];
  // direção câmera no chão: d; "direita da tela" no chão = (dz, -dx)
  const dl = Math.hypot(camDir.x, camDir.z) || 1, dx = camDir.x / dl, dz = camDir.z / dl;
  const rx = dz, rz = -dx;
  const quad = (p0, p1, p2, p3, u, n) => {
    // p0 = baixo-esq, p1 = baixo-dir, p2 = cima-dir, p3 = cima-esq
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    uv.push(u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[1], u[2], u[3], u[0], u[3]);
    for (let i = 0; i < 6; i++) nor.push(...n);
  };
  for (const [key, x, z] of SIGN_SPOTS) {
    const u = atlas.uv[key], a = atlas.aspect[key];
    const h = 1.9, w = h * a, y0 = 3.2;
    const cx = x, cz = z;
    const hx = rx * w / 2, hz = rz * w / 2;
    const n = [dx, 0, dz];
    quad([cx - hx, y0, cz - hz], [cx + hx, y0, cz + hz], [cx + hx, y0 + h, cz + hz], [cx - hx, y0 + h, cz - hz], u, n);
    const heading = Math.atan2(dx, dz);
    for (const k of [-0.38, 0.38]) inst.add('box', cx + rx * w * k - dx * 0.12, 0, cz + rz * w * k - dz * 0.12, heading, 0.14, y0 + 0.2, 0.14, 0x6d7075);
    inst.add('box', cx - dx * 0.08, y0 - 0.05, cz - dz * 0.08, heading, w + 0.1, h + 0.1, 0.06, 0x2a3a30); // costas
    const c = makeOBB(cx, cz, 0.3, 0.3, 0); c.kind = 'pole'; colliders.add(c);
  }
  // letreiros de telhado (deitados; "cima" do texto = para longe da câmera)
  const roof = (key, x, y, z, w) => {
    const u = atlas.uv[key], a = atlas.aspect[key], h = w / a;
    const ux = -dx, uz = -dz; // cima na tela
    const hx = rx * w / 2, hz = rz * w / 2, vx = ux * h / 2, vz = uz * h / 2;
    quad([x - hx - vx, y, z - hz - vz], [x + hx - vx, y, z + hz - vz], [x + hx + vx, y, z + hz + vz], [x - hx + vx, y, z - hz + vz], u, [0, 1, 0]);
  };
  roof('roof_stj', 598, 17.35, 328, 58);
  roof('roof_casa', -1560, 3.2 + 18 + 0.65, 318, 24);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

void CONFIG;
