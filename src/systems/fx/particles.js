// Partículas 3D (um único THREE.Points com pool fixo) + marcas de pneu (um único InstancedMesh com anel fixo).
// Sem alocação por frame. Tamanho do pool: quality.maxParticles / quality.fxSkidMax.

const VERT = `
attribute float aSize; attribute vec4 aColor;
uniform float uPx; varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uPx, 160.0);
}`;
const FRAG = `
precision mediump float; varying vec4 vColor;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, d) * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

export class Particles {
  constructor(THREE, scene, max) {
    this.THREE = THREE; this.max = max; this.head = 0; this.alive = 0;
    const N = max;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.age = new Float32Array(N); this.life = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.col = new Float32Array(N * 3); this.a0 = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N);
    this.size = new Float32Array(N); this.rgba = new Float32Array(N * 4);
    this.life.fill(0); this.age.fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uPx: { value: 20 } },
      transparent: true, depthWrite: false, depthTest: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5; this.points.visible = false;
    scene.add(this.points);
  }

  /** Emite 1 partícula (cores 0..1 sRGB). Sobrescreve a mais antiga se o pool encheu. */
  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha, drag = 1.5, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const p = this.pos, v = this.vel, i3 = i * 3;
    p[i3] = x; p[i3 + 1] = y; p[i3 + 2] = z; v[i3] = vx; v[i3 + 1] = vy; v[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = size0; this.s1[i] = size1;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b; this.a0[i] = alpha; this.drag[i] = drag; this.grav[i] = grav;
  }

  /** pxPerMeter = altura do drawing buffer / altura visível em metros. */
  update(dt, pxPerMeter) {
    const N = this.max, p = this.pos, v = this.vel, age = this.age, life = this.life;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (age[i] >= life[i]) { this.size[i] = 0; this.rgba[i4 + 3] = 0; continue; }
      age[i] += dt; alive++;
      const t = age[i] / life[i];
      if (t >= 1) { this.size[i] = 0; this.rgba[i4 + 3] = 0; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      v[i3] *= k; v[i3 + 1] = v[i3 + 1] * k - this.grav[i] * dt; v[i3 + 2] *= k;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < 0.05) { p[i3 + 1] = 0.05; v[i3 + 1] = 0; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = t < 0.12 ? t / 0.12 : (1 - t) / 0.88;
      this.rgba[i4] = this.col[i3]; this.rgba[i4 + 1] = this.col[i3 + 1]; this.rgba[i4 + 2] = this.col[i3 + 2];
      this.rgba[i4 + 3] = this.a0[i] * fade;
    }
    this.alive = alive;
    this.points.visible = alive > 0;
    if (alive > 0 || this._wasAlive) {
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true;
    }
    this._wasAlive = alive > 0;
    this.mat.uniforms.uPx.value = pxPerMeter;
  }

  clear() { this.age.fill(1); this.life.fill(0); this.alive = 0; this.points.visible = false; this.size.fill(0); this.rgba.fill(0); this._wasAlive = true; }
}

export class SkidMarks {
  constructor(THREE, scene, max) {
    this.THREE = THREE; this.max = max; this.head = 0; this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x121212, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  add(x, y, z, heading, width, length) {
    this._q.setFromAxisAngle(this._up, heading);
    this._p.set(x, y, z); this._s.set(width, 1, length);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(this.head, this._m);
    this.head = (this.head + 1) % this.max; if (this.n < this.max) this.n++;
    this.mesh.count = this.n; this.mesh.visible = true; this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.head = 0; this.n = 0; this.mesh.count = 0; this.mesh.visible = false; }
}
