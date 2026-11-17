// Colisão 2D no plano XZ: OBB (caixa orientada) e círculos + grade espacial de estáticos.
// Puro JS (sem three.js). Nenhuma função aloca: resultados vão para objetos "out".
//
// OBB = { x, z, hx, hz, angle }  hx = meia-largura (eixo local X), hz = meio-comprimento (eixo local Z = frente)
//   eixo U (local X / direita do modelo) = (cos a, -sin a); eixo V (frente) = (sin a, cos a)
// Contato (out) = { hit, nx, nz, depth }: normal aponta de B para A (empurre A por n*depth).

export function makeOBB(x = 0, z = 0, hx = 1, hz = 1, angle = 0) {
  return { type: 'obb', x, z, hx, hz, angle };
}
export function makeCircle(x = 0, z = 0, r = 1) {
  return { type: 'circle', x, z, r };
}
export function makeContact() { return { hit: false, nx: 0, nz: 0, depth: 0 }; }

function proj(o, ax, az) {
  // raio projetado da OBB no eixo (ax,az)
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  const ux = c, uz = -s, vx = s, vz = c;
  return o.hx * Math.abs(ux * ax + uz * az) + o.hz * Math.abs(vx * ax + vz * az);
}

/** SAT OBB×OBB. */
export function obbVsObb(a, b, out) {
  out.hit = false;
  const dx = a.x - b.x, dz = a.z - b.z;
  let best = Infinity, bnx = 0, bnz = 0;
  for (let i = 0; i < 4; i++) {
    const o = i < 2 ? a : b;
    const c = Math.cos(o.angle), s = Math.sin(o.angle);
    const ax = (i & 1) ? s : c, az = (i & 1) ? c : -s;
    const dist = dx * ax + dz * az;
    const overlap = proj(a, ax, az) + proj(b, ax, az) - Math.abs(dist);
    if (overlap <= 0) return false;
    if (overlap < best) { best = overlap; const sg = dist < 0 ? -1 : 1; bnx = ax * sg; bnz = az * sg; }
  }
  out.hit = true; out.nx = bnx; out.nz = bnz; out.depth = best;
  return true;
}

/** Círculo (A) × OBB (B). */
export function circleVsObb(cx, cz, r, b, out) {
  out.hit = false;
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const dx = cx - b.x, dz = cz - b.z;
  const lu = dx * c - dz * s;          // coord local X
  const lv = dx * s + dz * c;          // coord local Z
  const qu = lu < -b.hx ? -b.hx : lu > b.hx ? b.hx : lu;
  const qv = lv < -b.hz ? -b.hz : lv > b.hz ? b.hz : lv;
  let nu = lu - qu, nv = lv - qv;
  let d2 = nu * nu + nv * nv;
  if (d2 > r * r) return false;
  let depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2); nu /= d; nv /= d; depth = r - d;
  } else { // centro dentro da caixa: sai pelo lado mais próximo
    const pu = b.hx - Math.abs(lu), pv = b.hz - Math.abs(lv);
    if (pu < pv) { nu = lu < 0 ? -1 : 1; nv = 0; depth = pu + r; }
    else { nv = lv < 0 ? -1 : 1; nu = 0; depth = pv + r; }
  }
  // volta para o mundo: mundo = u*U + v*V
  out.nx = nu * c + nv * s;
  out.nz = -nu * s + nv * c;
  out.depth = depth; out.hit = true;
  return true;
}

/** OBB (A) × círculo (B): normal de B para A. */
export function obbVsCircle(a, cx, cz, r, out) {
  if (!circleVsObb(cx, cz, r, a, out)) return false;
  out.nx = -out.nx; out.nz = -out.nz;
  return true;
}

export function circleVsCircle(ax, az, ar, bx, bz, br, out) {
  out.hit = false;
  const dx = ax - bx, dz = az - bz, rr = ar + br;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-6;
  out.nx = dx / d; out.nz = dz / d; out.depth = rr - d; out.hit = true;
  return true;
}

/** Testa A (obb|circle) contra B (obb|circle). */
export function collide(a, b, out) {
  if (a.type === 'obb') {
    if (b.type === 'obb') return obbVsObb(a, b, out);
    return obbVsCircle(a, b.x, b.z, b.r, out);
  }
  if (b.type === 'obb') return circleVsObb(a.x, a.z, a.r, b, out);
  return circleVsCircle(a.x, a.z, a.r, b.x, b.z, b.r, out);
}

/** Raio do círculo envolvente. */
export function boundRadius(o) { return o.type === 'circle' ? o.r : Math.hypot(o.hx, o.hz); }

/**
 * Grade espacial para colisores estáticos (prédios, árvores, postes...).
 * Cada colisor: makeOBB/makeCircle + { kind: 'building'|'tree'|'pole'|'landmark'|'wall', id }
 */
export class StaticColliders {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.all = [];
    this._stamp = 0;
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(c) {
    c._stamp = 0;
    this.all.push(c);
    const r = boundRadius(c);
    const x0 = Math.floor((c.x - r) / this.cell), x1 = Math.floor((c.x + r) / this.cell);
    const z0 = Math.floor((c.z - r) / this.cell), z1 = Math.floor((c.z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz);
      let l = this.map.get(k);
      if (!l) { l = []; this.map.set(k, l); }
      l.push(c);
    }
    return c;
  }
  /** Preenche `out` (array reutilizável) com colisores perto de (x,z,r). Retorna a contagem. */
  query(x, z, r, out) {
    out.length = 0;
    const st = ++this._stamp;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const l = this.map.get(this._key(ix, iz));
      if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c._stamp === st) continue;
        c._stamp = st; out.push(c);
      }
    }
    return out.length;
  }
}
