// Agrupamento por "chunk" para culling por frustum barato:
//  - ChunkedInstancer: InstancedMesh por (tipo, chunk) — prédios, árvores, postes, sombras...
//  - ChunkedMeshBuilder: triângulos com cor por vértice (chão, asfalto, faixas) => 1 Mesh por chunk.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

export class ChunkedInstancer {
  constructor(scene, chunkSize = 400) {
    this.scene = scene; this.size = chunkSize;
    this.types = new Map();   // name -> { geometry, material, buckets: Map(chunkKey -> arrays) }
    this.meshes = [];
  }
  /** Registra um tipo. A geometria deve ter a BASE em y=0 se for escalada em altura. */
  registerType(name, geometry, material, opts = {}) {
    this.types.set(name, { geometry, material, buckets: new Map(), opts });
  }
  /** Adiciona uma instância. rotY em rad; escala sx,sy,sz; cor hex/Color. Retorna a contagem do tipo. */
  add(name, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff) {
    const t = this.types.get(name);
    if (!t) throw new Error('tipo de instância desconhecido: ' + name);
    const key = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = t.buckets.get(key);
    if (!b) { b = { m: [], c: [] }; t.buckets.set(key, b); }
    _p.set(x, y, z); _q.setFromAxisAngle(_up, rotY); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    b.m.push(..._m.elements);
    _c.set(color); b.c.push(_c.r, _c.g, _c.b);
  }
  /** Variante com rotação completa (Euler YXZ). */
  addEuler(name, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1, color = 0xffffff) {
    const t = this.types.get(name);
    const key = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = t.buckets.get(key);
    if (!b) { b = { m: [], c: [] }; t.buckets.set(key, b); }
    _p.set(x, y, z); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    b.m.push(..._m.elements);
    _c.set(color); b.c.push(_c.r, _c.g, _c.b);
  }
  build() {
    for (const [name, t] of this.types) {
      for (const [key, b] of t.buckets) {
        const n = b.m.length / 16;
        const mesh = new THREE.InstancedMesh(t.geometry, t.material, n);
        mesh.instanceMatrix.array.set(b.m);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.c), 3);
        mesh.computeBoundingSphere();
        mesh.matrixAutoUpdate = false;
        mesh.name = `inst:${name}:${key}`;
        if (t.opts.renderOrder) mesh.renderOrder = t.opts.renderOrder;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
      t.buckets.clear();
    }
    return this.meshes;
  }
  count() { let n = 0; for (const m of this.meshes) n += m.count; return n; }
}

/** Triângulos com cor por vértice, agrupados por chunk (centroide). Normal sempre +Y (chão). */
export class ChunkedMeshBuilder {
  constructor(chunkSize = 400) { this.size = chunkSize; this.buckets = new Map(); }
  _b(x, z) {
    const key = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = this.buckets.get(key);
    if (!b) { b = { p: [], c: [] }; this.buckets.set(key, b); }
    return b;
  }
  tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, color) {
    const b = this._b((x0 + x1 + x2) / 3, (z0 + z1 + z2) / 3);
    // garante face para cima (sentido anti-horário visto de +Y)
    const cr = (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
    if (cr > 0) b.p.push(x0, y0, z0, x2, y2, z2, x1, y1, z1);
    else b.p.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
    _c.set(color);
    b.c.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }
  /** Quadrilátero a-b-c-d (ordem em volta). */
  quad(ax, az, bx, bz, cx, cz, dx, dz, y, color) {
    this.tri(ax, y, az, bx, y, bz, cx, y, cz, color);
    this.tri(ax, y, az, cx, y, cz, dx, y, dz, color);
  }
  /** Retângulo orientado: centro, heading (rad), meio-comprimento ao longo, meia-largura. */
  rect(x, z, heading, halfLen, halfWid, y, color) {
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = -fz, rz = fx;
    this.quad(
      x - fx * halfLen - rx * halfWid, z - fz * halfLen - rz * halfWid,
      x + fx * halfLen - rx * halfWid, z + fz * halfLen - rz * halfWid,
      x + fx * halfLen + rx * halfWid, z + fz * halfLen + rz * halfWid,
      x - fx * halfLen + rx * halfWid, z - fz * halfLen + rz * halfWid, y, color);
  }
  disc(x, z, r, y, color, seg = 24) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri(x, y, z, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, color);
    }
  }
  ring(x, z, r0, r1, y, color, seg = 48) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad(x + c0 * r0, z + s0 * r0, x + c0 * r1, z + s0 * r1, x + c1 * r1, z + s1 * r1, x + c1 * r0, z + s1 * r0, y, color);
    }
  }
  /** Faixa entre duas polilinhas paralelas (Float64Array xz). */
  strip(left, right, y, color) {
    const n = left.length / 2;
    for (let i = 0; i < n - 1; i++) {
      this.quad(left[i * 2], left[i * 2 + 1], left[i * 2 + 2], left[i * 2 + 3], right[i * 2 + 2], right[i * 2 + 3], right[i * 2], right[i * 2 + 1], y, color);
    }
  }
  build(scene, material, name = 'ground') {
    const meshes = [];
    for (const [key, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      const nrm = new Float32Array(b.p.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.matrixAutoUpdate = false;
      mesh.name = `${name}:${key}`;
      scene.add(mesh); meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}
