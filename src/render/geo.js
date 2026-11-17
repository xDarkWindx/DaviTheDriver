// GeoBuilder: junta primitivas low-poly (com cor por vértice) numa ÚNICA BufferGeometry
// => um draw call por objeto composto (carro, marco, etc.). Usar com material vertexColors.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _n3 = new THREE.Matrix3();

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }

  /** Adiciona geometria com transformação (x,y,z, rx,ry,rz, sx,sy,sz) e cor (hex|Color). */
  add(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _p.set(x, y, z); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    return this.addMatrix(geom, color, _m);
  }
  addMatrix(geom, color, matrix) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const P = g.attributes.position, N = g.attributes.normal;
    _n3.getNormalMatrix(matrix);
    _c.set(color);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      if (N) { n.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); this.nor.push(n.x, n.y, n.z); }
      else this.nor.push(0, 1, 0);
      this.col.push(_c.r, _c.g, _c.b);
    }
    if (g !== geom) g.dispose();
    return this;
  }
  box(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0) {
    return this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
  /** Cilindro/cone. y = centro. */
  cyl(rTop, rBot, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
    this.add(g, color, x, y, z, rx, ry, rz); g.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get vertexCount() { return this.pos.length / 3; }
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);
