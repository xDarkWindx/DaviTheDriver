// Montagem do mundo: chão, vias, cenário, marcos, semáforos, placas, colisores e dados de minimapa.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { StaticColliders, makeOBB } from '../core/collision.js';
import { ChunkedInstancer, ChunkedMeshBuilder } from '../render/instancer.js';
import { makeMaterial } from '../render/materials.js';
import { makeGroundTexture, makeAsphaltTexture, makeSignAtlas, makeBlobTexture } from '../render/textures.js';
import { buildRoadMeshes } from './roadMesh.js';
import { samplePts } from './roadNetwork.js';
import { SceneryBuilder, buildScenery } from './scenery.js';
import { buildLandmarks } from './landmarks.js';
import { SignalController } from './signals.js';
import { VEHICLES } from '../config.js';
import { buildVehicleModel, buildTrafficModel, buildPersonModel, makeVehicleMaterial, TRAFFIC_MODELS } from '../player/vehicleModels.js';

// Placas verdes de via (texto pt-BR) e letreiros. Atlas único => 1 draw call.
const SIGN_ENTRIES = [
  { key: 'eixo', text: 'EIXO MONUMENTAL', sub: 'Via S1 · Esplanada', bg: '#1f6b3a', fg: '#ffffff', w: 360, h: 110 },
  { key: 'epig', text: 'EPIG', sub: 'Sudoeste · Parque da Cidade', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'jaqueiras', text: 'AV. DAS JAQUEIRAS', sub: 'Eixo Monumental', bg: '#1f6b3a', fg: '#ffffff', w: 360, h: 110 },
  { key: 'w3', text: 'W3 SUL', sub: 'Pátio Brasil', bg: '#1f6b3a', fg: '#ffffff', w: 280, h: 110 },
  { key: 'l2', text: 'L2 SUL', sub: 'SAFS · STJ', bg: '#1f6b3a', fg: '#ffffff', w: 280, h: 110 },
  { key: 'eixao', text: 'EIXÃO SUL', sub: 'Eixo Rodoviário', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'tesourinha', text: 'TESOURINHA', sub: 'Acesso ao Eixão', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 's2', text: 'VIA S2', sub: 'SAUS · SAFS · STJ', bg: '#1f3f8a', fg: '#ffffff', w: 320, h: 110 },
  { key: 's3', text: 'VIA S3', sub: 'SCS · Pátio Brasil', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'safs', text: 'SAFS', sub: 'STJ · TST · TSE', bg: '#1f3f8a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'sudoeste', text: 'SUDOESTE', sub: 'QRSW 2', bg: '#1f6b3a', fg: '#ffffff', w: 280, h: 110 },
  { key: 'parque', text: 'PARQUE DA CIDADE', sub: 'Sarah Kubitschek', bg: '#7a4b22', fg: '#ffffff', w: 360, h: 110 },
  { key: 'esplanada', text: 'ESPLANADA', sub: 'dos Ministérios', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'rodo', text: 'RODOVIÁRIA', sub: 'Plano Piloto', bg: '#1f6b3a', fg: '#ffffff', w: 300, h: 110 },
  { key: 'bus', text: 'ÔNIBUS', bg: 'rgba(0,0,0,0)', fg: '#f3ead8', w: 300, h: 90, noBorder: true },
  { key: 'busstop', text: 'PONTO', sub: 'ônibus', bg: '#1d4f8f', fg: '#ffffff', w: 160, h: 110 },
  { key: 'roof_stj', text: 'STJ', sub: 'SUPERIOR TRIBUNAL DE JUSTIÇA', bg: '#f4f2ec', fg: '#1d3d7a', w: 520, h: 150 },
  { key: 'roof_casa', text: 'QRSW 2', sub: 'SUDOESTE', bg: '#f3e9d7', fg: '#b4322a', w: 360, h: 120 },
];
// [chave, x, z] — placas em pé, viradas para a câmera (sempre legíveis na isométrica)
const SIGN_SPOTS = [
  ['sudoeste', -1460, 214], ['jaqueiras', -1484, 150], ['eixo', -1380, 58], ['epig', -985, 70], ['parque', -470, 214],
  ['w3', -414, 70], ['eixao', 22, 420], ['tesourinha', -40, 718], ['l2', 516, 640], ['s2', 120, 60], ['s3', 260, 276],
  ['safs', 818, 200], ['esplanada', 360, 58], ['rodo', 120, -28], ['eixo', -700, 58], ['s3', -170, 252], ['epig', -1050, 640],
];

export function buildWorld({ view, net, quality, events, cameraDir }) {
  const scene = view.scene;
  const rng = makeRng(1234);
  const chunk = quality.chunkSize;
  const colliders = new StaticColliders(32);
  const inst = new ChunkedInstancer(scene, chunk);
  const mb = new ChunkedMeshBuilder(chunk);       // asfalto + marcações (com textura de desgaste)
  const plain = new ChunkedMeshBuilder(chunk);    // gramados, calçadas, canteiros (cor lisa)

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
  buildRoadMeshes(net, mb, inst, plain);

  // ---------- cenário
  const sb = new SceneryBuilder({ net, inst, mb: plain, colliders, quality, rng });
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
  buildBusStops(net, inst, colliders);
  const signGeo = buildSigns(atlas, cameraDir, inst, colliders, net);
  const signMesh = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: atlas.texture, alphaTest: 0.35 }));
  signMesh.name = 'signs'; signMesh.matrixAutoUpdate = false; scene.add(signMesh);

  const groundMeshes = [...mb.build(scene, roadMat, 'roads', 12), ...plain.build(scene, lambertVC, 'lawns', 12)];
  const instMeshes = inst.build();

  return {
    net, colliders, signals, landmarks: landmarks.list,
    stats: { ...sb.stats, instances: inst.count(), instancedMeshes: instMeshes.length, groundMeshes: groundMeshes.length, colliders: colliders.all.length },
    materials: { lambertVC, instMat, roadMat, groundMat, blobMat },
    blobTexture: blobTex,
    chunkSize: chunk,
    /** Vitrine de depuração (tools/shots.cjs): carros do jogador, modelos de tráfego e pessoas lado a lado em (x, z). */
    debugShowcase(x, z) {
      const g = new THREE.Group(); g.name = 'showcase';
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
      ['kwid', 'cactus'].forEach((id, i) => {
        const m = buildVehicleModel(VEHICLES[id], quality, blobTex);
        m.root.position.set(x + i * 2.6 - 12, 0, z); m.root.rotation.y = 0.6;
        m.wheelSlots.forEach((w, k) => { _p.set(w.x, m.wheelR, w.z); _e.set(0, w.side < 0 ? Math.PI : 0, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p, _q, _s); m.wheels.setMatrixAt(k, _m); });
        m.wheels.instanceMatrix.needsUpdate = true;
        g.add(m.root);
      });
      const mat = makeVehicleMaterial();
      let ox = 0;
      for (const kind of Object.keys(TRAFFIC_MODELS)) {
        const t = buildTrafficModel(kind);
        const im = new THREE.InstancedMesh(t.geometry, mat, 2);
        for (let k = 0; k < 2; k++) {
          _p.set(x + ox, 0, z + 8 + k * (t.length + 1.5)); _e.set(0, 0.6, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p, _q, _s);
          im.setMatrixAt(k, _m); im.setColorAt(k, new THREE.Color(t.colors[k % t.colors.length]));
        }
        g.add(im); ox += t.width + 1.6;
      }
      ['pedestre', 'pedestre', 'agente'].forEach((kind, i) => {
        const pm = buildPersonModel(kind, i);
        const im = new THREE.InstancedMesh(pm.geometry, mat, 1);
        _p.set(x - 4 + i * 1.2, 0, z - 1); _e.set(0, 0.6, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p, _q, _s);
        im.setMatrixAt(0, _m); im.setColorAt(0, new THREE.Color(pm.shirts[i % pm.shirts.length])); g.add(im);
      });
      scene.add(g);
      return g;
    },
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

/** Abrigos de ponto de ônibus (instâncias + colisor). Posição nos dados: net.busStops. */
function buildBusStops(net, inst, colliders) {
  for (const b of net.busStops) {
    const h = b.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    const x = b.shelterX, z = b.shelterZ;
    inst.add('box', x + rx * 0.9, 0, z + rz * 0.9, h, 0.15, 2.6, 4.5, 0x8fb4c8);    // painel de fundo
    inst.add('box', x - fx * 2.1, 0, z - fz * 2.1, h, 1.8, 2.6, 0.1, 0x8fb4c8);
    inst.add('box', x + fx * 2.1, 0, z + fz * 2.1, h, 1.8, 2.6, 0.1, 0x8fb4c8);
    inst.add('box', x, 2.6, z, h, 2.2, 0.15, 4.9, 0x2a5d9f);                          // cobertura azul
    inst.add('box', x + rx * 0.5, 0.45, z + rz * 0.5, h, 0.45, 0.08, 3.6, 0x9a7b55);  // banco
    const c = makeOBB(x, z, 1.1, 2.4, h); c.kind = 'busStop'; c.id = 'ponto' + b.id; colliders.add(c);
  }
}

/** Placas em pé (face para a câmera) + letreiros de telhado. Uma geometria com UV do atlas. */
function buildSigns(atlas, camDir, inst, colliders, net) {
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
  // "ÔNIBUS" pintado no chão das faixas exclusivas (texto ao longo da faixa, de baixo p/ cima no sentido do fluxo)
  const T = { x: 0, z: 0, tx: 0, tz: 0 };
  for (const lane of net.lanes) {
    if (lane.kind !== 'bus') continue;
    const seg = net.getSegment(lane.segId), y = seg.layer * 0.09 + 0.085;
    for (let s = 20; s < lane.length - 15; s += 45) {
      samplePts(lane.pts, lane.cum, s, T);
      const len = 5.2, wid = seg.laneW * 0.62;
      // texto ao longo da faixa; virado para ler da esquerda para a direita na tela
      const flip = T.tx * rx + T.tz * rz < 0 ? -1 : 1; // sempre legível da câmera
      const tx = T.tx * flip, tz = T.tz * flip;
      const ex = tx * len / 2, ez = tz * len / 2, ux = tz * wid / 2, uz = -tx * wid / 2;
      const u = atlas.uv.bus;
      quad([T.x - ex - ux, y, T.z - ez - uz], [T.x + ex - ux, y, T.z + ez - uz], [T.x + ex + ux, y, T.z + ez + uz], [T.x - ex + ux, y, T.z - ez + uz], u, [0, 1, 0]);
    }
  }
  // placas dos pontos de ônibus
  for (const b of net.busStops) {
    const u = atlas.uv.busstop, h = 0.9, w = h * atlas.aspect.busstop, y0 = 2.5;
    const cx = b.shelterX + Math.sin(b.heading) * 2.2, cz = b.shelterZ + Math.cos(b.heading) * 2.2;
    quad([cx - rx * w / 2, y0, cz - rz * w / 2], [cx + rx * w / 2, y0, cz + rz * w / 2], [cx + rx * w / 2, y0 + h, cz + rz * w / 2], [cx - rx * w / 2, y0 + h, cz - rz * w / 2], u, [dx, 0, dz]);
    inst.add('box', cx - dx * 0.05, 0, cz - dz * 0.05, 0, 0.1, y0, 0.1, 0x6d7075);
  }
  roof('roof_stj', 628, 17.35, 330, 44);
  roof('roof_casa', -1390, 3.2 + 18 + 0.65, 166, 20);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

