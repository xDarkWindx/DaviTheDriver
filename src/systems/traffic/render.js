// Desenho do trânsito: InstancedMesh por modelo (sem alocação por frame). ~15 draw calls no total:
//   8 modelos de veículo + 1 luzes (freio/seta/farol/buzina/mão/bloquinho) + 1 sombras + 2 pedestres + 1 bicicleta
//   + 1 agente + 1 frutas + 1 pardal. Malhas sem instância visível ficam invisible (0 draw call).
import * as THREE from 'three';
import { TRAFFIC_MODELS, buildTrafficModel, buildPersonModel, makeVehicleMaterial, PartBuilder } from '../../player/vehicleModels.js';
import { LIVE_SHADOW } from '../../render/materials.js';
// Carros projetando sombra no shadow map: o pool inteiro entra na passada de sombra (instâncias sem culling), ~+50–100 mil
// triângulos com a frota cheia. Medido: estoura o orçamento do perfil leve no SCS/Sudoeste => desligado (sombra blob).
export const SHADOW_TRAFFIC = false;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const lerpAng = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return a + d * t; };

const C = { brake: new THREE.Color(0xff1a10), blink: new THREE.Color(0xffa010), flash: new THREE.Color(0xfffbe0), honk: new THREE.Color(0xffe23a),
  hand: new THREE.Color(0xc68e62), hat: new THREE.Color(0x6b4a2a), hatBrim: new THREE.Color(0x553a20), hatBand: new THREE.Color(0x1d1d1d), note: new THREE.Color(0xf4f4ee), hazardOff: new THREE.Color(0x000000) };
// altura das lanternas por modelo [y, meia-separação a partir da borda]
const MANGO = [0, 0, 0.34, 0.22, -0.22, 0.3];
const LAMP_Y = { onibus: 1.0, mudanca: 0.85, moto: 0.82, picape: 0.95, suv: 0.95 };

/**
 * Fábrica ÚNICA de geometria de tráfego (trocar aqui se os modelos mudarem).
 * Retorna { geometry, length, width, height, colors } para o modelo `kind`.
 */
export function makeTrafficGeometry(kind) {
  if (TRAFFIC_MODELS && TRAFFIC_MODELS[kind]) {
    const m = buildTrafficModel(kind);
    return { geometry: m.geometry, length: m.length, width: m.width, height: m.height, colors: m.colors, triangles: m.triangles };
  }
  // reserva: caixa (se o modelo ainda não existir)
  const b = new PartBuilder();
  b.box(1.75, 1.4, 4.4, 0xffffff, 0, 0.7, 0, 0, 0, 0, 1);
  return { geometry: b.build(), length: 4.4, width: 1.75, height: 1.4, colors: [0xcccccc], triangles: b.triangles };
}

function bikeGeometry() {
  // bicicleta de verdade (vista de cima e de lado): pneu + aro + cubo, quadro em diamante (cor da instância), pedivela, guidão e selim
  const b = new PartBuilder();
  for (const z of [-0.52, 0.52]) {
    b.cylX(0.34, 0.05, 14, 0x161616, 0, 0.34, z);          // pneu
    b.cylX(0.29, 0.055, 14, 0xb8bcc0, 0, 0.34, z);         // aro
    b.cylX(0.25, 0.06, 14, 0x2a2a2a, 0, 0.34, z);          // vão do aro (raios escuros)
    b.cylX(0.05, 0.08, 6, 0x9a9a9a, 0, 0.34, z);           // cubo
  }
  b.box(0.045, 0.045, 0.62, 0xffffff, 0, 0.78, 0.04, 0, -0.08, 0, 1);  // tubo superior
  b.box(0.05, 0.05, 0.7, 0xffffff, 0, 0.56, 0.18, 0, 0.62, 0, 1);      // tubo inferior (diagonal)
  b.box(0.045, 0.5, 0.045, 0xffffff, 0, 0.6, -0.2, 0, 0.3, 0, 1);      // tubo do selim
  b.box(0.04, 0.04, 0.5, 0xffffff, 0, 0.36, -0.3, 0, 0, 0, 1);         // pé de vela (até o eixo de trás)
  b.box(0.04, 0.42, 0.04, 0xffffff, 0, 0.56, -0.4, 0, -0.75, 0, 1);    // escora do selim
  b.box(0.045, 0.5, 0.045, 0xffffff, 0, 0.58, 0.47, 0, -0.32, 0, 1);   // garfo
  b.cylX(0.07, 0.12, 8, 0x3a3a3a, 0, 0.36, -0.05);                     // movimento central
  b.box(0.3, 0.035, 0.035, 0x3a3a3a, 0, 0.36, -0.05);                  // pedivela
  for (const x of [-0.17, 0.17]) b.box(0.08, 0.03, 0.1, 0x111111, x, 0.36, -0.05); // pedais
  b.box(0.54, 0.04, 0.04, 0x222222, 0, 0.92, 0.5);                     // guidão
  for (const x of [-0.26, 0.26]) b.box(0.06, 0.06, 0.1, 0x111111, x, 0.92, 0.5); // manoplas
  b.box(0.14, 0.05, 0.26, 0x111111, 0, 0.88, -0.36);                   // selim
  return b.build();
}

function pardalGeometry() {
  // poste à direita da via; braço sobre a pista (local +X = esquerda do sentido); câmera olha para -Z (quem chega)
  const b = new PartBuilder();
  b.cylY(0.13, 6.0, 8, 0x9aa0a7, 0, 3.0, 0);
  for (let k = 0; k < 4; k++) b.cylY(0.14, 0.35, 8, k % 2 ? 0x1c1c1c : 0xf2c200, 0, 0.6 + k * 0.35, 0); // faixas zebradas na base
  b.box(3.2, 0.16, 0.16, 0x9aa0a7, 1.6, 5.9, 0);
  b.box(0.8, 0.62, 1.15, 0xeceeef, 2.9, 5.45, 0);     // caixa da câmera (clara, bem visível de cima)
  b.box(0.82, 0.08, 1.2, 0x2a2d31, 2.9, 5.8, 0);      // tampa
  b.box(0.42, 0.42, 0.06, 0x050505, 2.9, 5.42, -0.6); // lente
  b.box(0.3, 0.14, 0.05, 0xfff6c8, 2.9, 5.74, -0.6);  // flash
  b.box(1.05, 1.25, 0.05, 0xf2c200, 0, 3.4, -0.16);   // placa amarela "fiscalização eletrônica"
  b.box(0.9, 0.3, 0.055, 0x1c1c1c, 0, 3.7, -0.17);
  b.box(0.5, 0.5, 0.055, 0xf4f4f0, 0, 3.15, -0.17);
  b.box(0.42, 0.6, 0.34, 0x5f656c, 0, 0.3, 0.3);       // caixa de controle
  b.box(0.9, 0.55, 0.08, 0x1a1a1a, 0, 4.55, -0.17);    // painel "sua velocidade"
  b.box(0.62, 0.3, 0.09, 0xd92a1c, 0, 4.55, -0.18);    // números (vermelho)
  b.box(3.2, 0.06, 0.06, 0xf2c200, 1.6, 5.98, 0);      // faixa amarela no braço (lê melhor de cima)
  return b.build();
}

function fruitGeometry() {
  const b = new PartBuilder();
  b.add(new THREE.IcosahedronGeometry(1, 1), 0xffffff, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1);
  return b.build();
}

export class TrafficRenderer {
  constructor(scene, { maxVehicles, maxPedestrians, blobMaterial, maxRadars = 64, maxHazards = 72, maxAgents = 8 }) {
    this.scene = scene; this.maxV = maxVehicles; this.maxP = maxPedestrians;
    this.group = new THREE.Group(); this.group.name = 'traffic';
    scene.add(this.group);
    const mat = makeVehicleMaterial({ shininess: 34 });
    this.mat = mat;
    this.models = {}; this.vmesh = {}; this.counts = {}; this.triangles = 0;
    this.colorTables = {};
    for (const kind of Object.keys(TRAFFIC_MODELS)) {
      const g = makeTrafficGeometry(kind);
      this.models[kind] = g;
      const mesh = new THREE.InstancedMesh(g.geometry, mat, maxVehicles);
      this._prep(mesh, 'traffic:' + kind);
      this.vmesh[kind] = mesh; this.counts[kind] = 0;
      this.colorTables[kind] = g.colors.map((c) => new THREE.Color(c));
    }
    // pedestres (2 variantes), agentes, bicicletas
    this.pedModels = [buildPersonModel('pedestre', 0), buildPersonModel('pedestre', 3)];
    this.pedMesh = this.pedModels.map((m, i) => this._prep(new THREE.InstancedMesh(m.geometry, mat, maxPedestrians), 'traffic:ped' + i));
    this.pedCount = [0, 0];
    this.shirts = this.pedModels[0].shirts.map((c) => new THREE.Color(c));
    this.agentMesh = this._prep(new THREE.InstancedMesh(buildPersonModel('agente', 0).geometry, mat, maxAgents), 'traffic:agents');
    this.bikeMesh = this._prep(new THREE.InstancedMesh(bikeGeometry(), mat, maxPedestrians), 'traffic:bikes');
    // luzes: caixa unitária sem iluminação, cor por instância
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.lampMesh = this._prep(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lampMat, maxVehicles * 9 + maxPedestrians + maxAgents), 'traffic:lamps');
    this.lampMesh.renderOrder = 3;
    // sombras blob
    if (blobMaterial) {
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      this.blobMesh = this._prep(new THREE.InstancedMesh(pg, blobMaterial, maxVehicles + maxPedestrians + maxAgents), 'traffic:shadows');
      this.blobMesh.renderOrder = 2;
    }
    this.fruitMesh = this._prep(new THREE.InstancedMesh(fruitGeometry(), mat, maxHazards), 'traffic:fruit');
    this.pardalMesh = this._prep(new THREE.InstancedMesh(pardalGeometry(), mat, maxRadars), 'traffic:pardal');
    this._static = { radars: null, hazardsVer: -1 };
    this.fruitColors = { manga: [new THREE.Color(0xffb21c), new THREE.Color(0xf5c832), new THREE.Color(0xe8722a)], jaca: [new THREE.Color(0x7f9b2c)],
      splatManga: new THREE.Color(0xe0a12a), splatJaca: new THREE.Color(0xd2c46a) };
    this.time = 0;
    // ônibus do STJ: pintura própria (cor da instância) + letreiro "STJ" nas duas laterais (1 malha, só visível no evento)
    this.stjColor = new THREE.Color(0x1d3d7a);
    this.stjPlate = this._makeStjPlate();
    this.group.add(this.stjPlate);
  }

  _makeStjPlate() {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let tex = null;
    if (cv) {
      cv.width = 256; cv.height = 64;
      const g = cv.getContext('2d');
      g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#c9a227'; g.fillRect(0, 50, 256, 8);
      g.fillStyle = '#1d3d7a'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('STJ', 128, 28);
      tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    }
    const geo = new THREE.BufferGeometry();
    // dois quadros 4,2 x 1,05 m nas laterais (x = ±1,27), altura 1,9 m; texto legível dos dois lados
    const L = 2.1, H = 0.4, Y = 1.2, X = 1.272;
    const pos = [], uv = [], idx = [];
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      const zA = side > 0 ? -L : L, zB = -zA;
      pos.push(side * X, Y - H, zA, side * X, Y - H, zB, side * X, Y + H, zB, side * X, Y + H, zA);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    // letreiro grande no TETO (o que a câmera isométrica vê): "STJ" ao longo do ônibus
    { const b = pos.length / 3, RY = 3.22, RL = 4.2, RW = 1.05;
      pos.push(-RW, RY, -RL, -RW, RY, RL, RW, RY, RL, RW, RY, -RL);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0xf4f2ec, side: THREE.DoubleSide }));
    mesh.name = 'traffic:stjPlate'; mesh.visible = false; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    return mesh;
  }

  _prep(mesh, name) {
    mesh.name = name; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _c.set(0xffffff);
    for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setColorAt(i, _c);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return mesh;
  }

  _set(mesh, i, x, y, z, h, sx = 1, sy = 1, sz = 1) {
    _p.set(x, y, z); _q.setFromAxisAngle(_up, h); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  _setE(mesh, i, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
    _p.set(x, y, z); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  /** Caixa de luz no referencial do veículo (lx: +X = esquerda do veículo, lz: +Z = frente). */
  _lamp(x, y, z, h, lx, lz, w, ht, d, color) {
    const i = this.nLamp; if (i >= this.lampMesh.instanceMatrix.count) return;
    const sh = Math.sin(h), ch = Math.cos(h);
    // local X do modelo em mundo = (cos h, -sin h); local Z = (sin h, cos h)
    this._set(this.lampMesh, i, x + ch * lx + sh * lz, y, z - sh * lx + ch * lz, h, w, ht, d);
    this.lampMesh.setColorAt(i, color);
    this.nLamp++;
  }
  _blob(x, y, z, h, w, l, op = 1) {
    if (!this.blobMesh) return;
    const i = this.nBlob; if (i >= this.blobMesh.instanceMatrix.count) return;
    this._set(this.blobMesh, i, x, y, z, h, w, 1, l);
    this.nBlob++;
    void op;
  }

  /** Atualiza todas as instâncias. alpha = interpolação entre passos. cx,cz = foco (jogador) p/ visibilidade de estáticos. */
  sync(sim, alpha, dt, cx, cz, net) {
    this.time += dt;
    const blinkOn = (this.time % 0.7) < 0.38;
    for (const k in this.counts) this.counts[k] = 0;
    this.nLamp = 0; this.nBlob = 0;
    // ---------- veículos
    const vs = sim.vehicles;
    this.stjPlate.visible = false;
    // sombra: com shadow map ligado os carros projetam sombra de verdade (igual ao resto do mundo); no degrau sem
    // sombra projetada (ajuste automático) voltam as sombras blob
    const live = LIVE_SHADOW.map && SHADOW_TRAFFIC;
    if (live !== this._liveShadow) {
      this._liveShadow = live;
      for (const k in this.vmesh) this.vmesh[k].castShadow = live;
      this.agentMesh.castShadow = live; this.pedMesh[0].castShadow = this.pedMesh[1].castShadow = live;
    }
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v.active) continue;
      const mesh = this.vmesh[v.kind]; if (!mesh) continue;
      const n = this.counts[v.kind]++;
      const x = v.px + (v.x - v.px) * alpha, z = v.pz + (v.z - v.pz) * alpha, h = lerpAng(v.ph, v.heading, alpha);
      const y = (v.w.lane.layer || 0) * 0.09;
      this._set(mesh, n, x, y, z, h);
      const tbl = this.colorTables[v.kind];
      mesh.setColorAt(n, v.stjBus ? this.stjColor : tbl[v.color % tbl.length]);
      if (v.stjBus) {
        _p.set(x, y, z); _q.setFromAxisAngle(_up, h); _s.set(1, 1, 1);
        this.stjPlate.matrix.compose(_p, _q, _s); this.stjPlate.matrixWorldNeedsUpdate = true; this.stjPlate.visible = true;
      }
      const L = v.length, W = v.width, half = L * 0.5;
      if (!live) this._blob(x, y + 0.11, z, h, W * 1.55, L * 1.2);
      const ly = LAMP_Y[v.kind] || 0.86;
      const moto = v.kind === 'moto';
      if (v.braking) {
        if (moto) this._lamp(x, y + ly, z, h, 0, -half - 0.02, 0.16, 0.08, 0.05, C.brake);
        else for (let s = -1; s <= 1; s += 2) this._lamp(x, y + ly, z, h, s * (W * 0.5 - 0.22), -half - 0.03, 0.3, 0.14, 0.06, C.brake);
      }
      if (v.blink !== 0 && blinkOn) {
        for (let s = -1; s <= 1; s += 2) {
          if (v.blink !== 2 && (v.blink < 0 ? 1 : -1) !== s) continue; // seta esquerda = local +X
          const ox = s * (W * 0.5 - 0.06);
          this._lamp(x, y + ly - 0.08, z, h, ox, half + 0.02, 0.14, 0.1, 0.06, C.blink);
          this._lamp(x, y + ly - 0.08, z, h, ox, -half - 0.03, 0.14, 0.1, 0.06, C.blink);
        }
      }
      if (v.flashing) for (let s = -1; s <= 1; s += 2) this._lamp(x, y + 0.72, z, h, moto ? 0 : s * (W * 0.5 - 0.28), half + 0.05, 0.42, 0.22, 0.08, C.flash);
      if (v.persona === 'tio') { // o chapéu do tio (exagerado o bastante para aparecer de cima, sobre o lado do motorista)
        const hy = y + (this.models[v.kind].height || 1.45) + 0.04;
        this._lamp(x, hy, z, h, 0.36, 0.05, 0.78, 0.05, 0.78, C.hatBrim);
        this._lamp(x, hy + 0.15, z, h, 0.36, 0.05, 0.44, 0.24, 0.44, C.hat);
        this._lamp(x, hy + 0.08, z, h, 0.36, 0.05, 0.46, 0.06, 0.46, C.hatBand);
      }
      if (v.honking) { // "!" sobre o veículo
        const hh = (this.models[v.kind].height || 1.5) + 0.9;
        this._lamp(x, y + hh + 0.35, z, h, 0, 0, 0.22, 0.6, 0.22, C.honk);
        this._lamp(x, y + hh - 0.15, z, h, 0, 0, 0.22, 0.2, 0.22, C.honk);
      }
    }
    for (const k in this.vmesh) this._finish(this.vmesh[k], this.counts[k]);
    // ---------- pedestres / corredores / ciclistas
    this.pedCount[0] = 0; this.pedCount[1] = 0; let nb = 0;
    const ps = sim.pedestrians;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      const vi = p.variant ? 1 : 0, mesh = this.pedMesh[vi], n = this.pedCount[vi]++;
      const x = p.px + (p.x - p.px) * alpha, z = p.pz + (p.z - p.pz) * alpha, h = lerpAng(p.ph, p.heading, alpha);
      const moving = p.state === 'crossing' || p.state === 'walking' || (p.state === 'waiting' && p.approach);
      if (p.state === 'down') {
        this._setE(mesh, n, x, 0.18, z, -Math.PI / 2, h, 0);
      } else if (p.kind === 'ciclista') {
        this._setE(mesh, n, x, 0.42, z, 0.28, h, 0, 1, 0.82, 1);
        const b = nb++; this._set(this.bikeMesh, b, x, 0, z, h); this.bikeMesh.setColorAt(b, this.shirts[(p.color + 2) % this.shirts.length]);
      } else {
        const bob = moving ? Math.abs(Math.sin(p.phase)) * (p.kind === 'corredor' || p.runner ? 0.09 : 0.04) : 0;
        const lean = p.kind === 'corredor' || (p.runner && p.state === 'crossing') ? 0.18 : 0;
        this._setE(mesh, n, x, bob, z, lean, h, moving ? Math.sin(p.phase) * 0.05 : 0);
      }
      mesh.setColorAt(n, this.shirts[p.color % this.shirts.length]);
      if (!live) this._blob(x, 0.1, z, h, 0.8, p.kind === 'ciclista' ? 1.6 : 0.8);
      if (p.signaling || p.scaredT > 0) { // braço levantado (pedindo passagem, ou reclamando do susto) (mão) pedindo passagem
        const sh = Math.sin(h), ch = Math.cos(h);
        this._lamp(x - ch * 0.3, 1.78, z + sh * 0.3, h, 0, 0, 0.1, 0.42, 0.1, C.hand);
      }
    }
    this._finish(this.pedMesh[0], this.pedCount[0]); this._finish(this.pedMesh[1], this.pedCount[1]); this._finish(this.bikeMesh, nb);
    // ---------- agentes (meio escondidos; revelados com o bloquinho)
    let na = 0, nearA = false;
    for (const a of sim.agents) {
      if (na >= this.agentMesh.instanceMatrix.count) break;
      const dx = a.x - cx, dz = a.z - cz; if (dx * dx + dz * dz < 200 * 200) nearA = true;
      const x = a.px + (a.x - a.px) * alpha, z = a.pz + (a.z - a.pz) * alpha;
      if (a.revealed) {
        this._setE(this.agentMesh, na, x, 0, z, 0, a.heading, 0);
        const sh = Math.sin(a.heading), ch = Math.cos(a.heading);
        this._lamp(x + sh * 0.3, 1.18, z + ch * 0.3, a.heading, 0, 0, 0.2, 0.26, 0.04, C.note);
      } else this._setE(this.agentMesh, na, x, -0.05, z, 0.32, a.heading, 0, 1, 0.78, 1); // agachado, espiando
      if (!live) this._blob(x, 0.1, z, a.heading, 0.8, 0.8);
      na++;
    }
    this._finish(this.agentMesh, nearA ? na : 0);
    // ---------- frutas
    let nf = 0, nearF = false;
    for (const hz of sim.hazards) {
      if (nf >= this.fruitMesh.instanceMatrix.count) break;
      const dx = hz.x - cx, dz = hz.z - cz; if (dx * dx + dz * dz < 160 * 160) nearF = true;
      const jaca = hz.kind === 'jaca', y = (net && hz.laneId != null ? (net.lanes[hz.laneId].layer || 0) * 0.09 : 0) + 0.06;
      if (hz.squashed) {
        this._set(this.fruitMesh, nf, hz.x, y + 0.02, hz.z, hz.rot, jaca ? 1.0 : 0.6, 0.035, jaca ? 1.3 : 0.75);
        this.fruitMesh.setColorAt(nf, jaca ? this.fruitColors.splatJaca : this.fruitColors.splatManga);
      } else if (jaca) {
        this._set(this.fruitMesh, nf, hz.x, y + 0.38, hz.z, hz.rot, 0.46, 0.4, 0.64);
        this.fruitMesh.setColorAt(nf, this.fruitColors.jaca[0]);
      } else { // manga: cacho de 3 caídas do pé
        const sr = Math.sin(hz.rot), cr = Math.cos(hz.rot), tbl = this.fruitColors.manga;
        for (let k = 0; k < 3 && nf < this.fruitMesh.instanceMatrix.count; k++) {
          const ox = MANGO[k * 2], oz = MANGO[k * 2 + 1];
          this._set(this.fruitMesh, nf, hz.x + cr * ox + sr * oz, y + 0.17, hz.z - sr * ox + cr * oz, hz.rot + k * 1.9, 0.2, 0.16, 0.29);
          this.fruitMesh.setColorAt(nf, tbl[(hz.id + k) % tbl.length]);
          if (k < 2) nf++;
        }
      }
      nf++;
    }
    this._finish(this.fruitMesh, nearF ? nf : 0);
    // ---------- pardais (reconstruídos só quando a lista muda)
    if (this._static.radars !== sim.radars || this._static.nR !== sim.radars.length) {
      this._static.radars = sim.radars; this._static.nR = sim.radars.length;
      let n = 0;
      for (const r of sim.radars) {
        if (n >= this.pardalMesh.instanceMatrix.count) break;
        let x = r.poleX, z = r.poleZ;
        if (r.type === 'redLight') { x -= Math.sin(r.heading) * 3; z -= Math.cos(r.heading) * 3; } // atrás do poste do semáforo
        this._set(this.pardalMesh, n++, x, 0, z, r.heading);
      }
      this._static.nPardal = n;
      this.pardalMesh.instanceMatrix.needsUpdate = true;
    }
    let nearR = false;
    for (const r of sim.radars) { const dx = r.poleX - cx, dz = r.poleZ - cz; if (dx * dx + dz * dz < 220 * 220) { nearR = true; break; } }
    this.pardalMesh.count = this._static.nPardal || 0; this.pardalMesh.visible = nearR && this.pardalMesh.count > 0;
    // ---------- luzes e sombras
    this._finish(this.lampMesh, this.nLamp);
    if (this.blobMesh) this._finish(this.blobMesh, this.nBlob);
  }

  _finish(mesh, n) {
    mesh.count = n; mesh.visible = n > 0;
    if (n > 0) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  stats() {
    let calls = 0, tris = 0;
    this.group.traverse((o) => { if (o.isInstancedMesh && o.visible && o.count > 0) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * o.count; } });
    return { drawCalls: calls, triangles: Math.round(tris) };
  }
}
