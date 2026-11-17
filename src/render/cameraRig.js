// Câmera isométrica ortográfica que segue um alvo com suavização + antecipação.
// Ganchos externos: shake(amount, duration), zoomMul (multiplicador), offsetX/offsetZ (deslocamento extra).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../core/math.js';

export class CameraRig {
  constructor(aspect = 16 / 9, quality = null) {
    const c = CONFIG.camera;
    this.cfg = c;
    this.quality = quality;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, c.distance + (quality ? quality.cameraFar : 900));
    const el = c.elevationDeg * Math.PI / 180, az = c.azimuthDeg * Math.PI / 180;
    // direção alvo -> câmera
    this.dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.aspect = aspect;
    this.view = c.baseView;          // altura visível atual (m)
    this.zoomMul = 1;                // gancho externo (fx/mood): >1 abre, <1 fecha
    this.offsetX = 0; this.offsetZ = 0; // gancho externo
    this.tx = 0; this.tz = 0;        // alvo suavizado
    this.lookX = 0; this.lookZ = 0;  // antecipação suavizada
    this._shakeAmt = 0; this._shakeT = 0; this._shakeDur = 0; this._time = 0;
    this.mode = 'follow';            // 'follow' | 'orbit' (menu) | 'free' (posição/zoom fixos: lookAt())
    this.freeView = 120;
    this._orbitAngle = 0;
    this.camera.up.set(0, 1, 0);
  }

  setAspect(a) { this.aspect = a; this._applyFrustum(); }

  /** Tremida: amount em metros, duração em s. Soma com tremidas em curso (pega o maior). */
  shake(amount, duration = 0.4) {
    if (amount > this._shakeAmt * (this._shakeDur > 0 ? 1 - this._shakeT / this._shakeDur : 0)) {
      this._shakeAmt = amount; this._shakeDur = duration; this._shakeT = 0;
    }
  }

  /** Modo livre: centraliza em (x,z) com altura visível `view` m (debug, cutscenes, telas). */
  lookAt(x, z, view = 120) { this.mode = 'free'; this.tx = x; this.tz = z; this.freeView = view; }

  /** Teleporta (sem suavização). */
  snap(x, z) { this.tx = x; this.tz = z; this.lookX = 0; this.lookZ = 0; this.view = this.cfg.baseView; }

  _applyFrustum() {
    const h = this.view * this.zoomMul * (this.quality ? this.quality.viewMul : 1) / 2, w = h * this.aspect;
    const cam = this.camera;
    cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h;
    cam.updateProjectionMatrix();
  }

  /**
   * Atualiza por frame. (x,z) = posição do alvo; (vx,vz) velocidade em m/s.
   */
  update(dt, x, z, vx, vz) {
    const c = this.cfg;
    this._time += dt;
    if (this.mode === 'free') {
      this.view = this.freeView; this.lookX = 0; this.lookZ = 0;
    } else if (this.mode === 'orbit') {
      // passeio lento pelo mapa no menu
      this._orbitAngle += dt * 0.05;
      this.tx = x + Math.cos(this._orbitAngle) * 40; this.tz = z + Math.sin(this._orbitAngle) * 40;
      this.view = damp(this.view, c.maxView * 1.25, 1, dt);
    } else {
      const speed = Math.hypot(vx, vz);
      let ax = vx * c.lookAheadSec, az = vz * c.lookAheadSec;
      const al = Math.hypot(ax, az);
      if (al > c.lookAheadMax) { ax *= c.lookAheadMax / al; az *= c.lookAheadMax / al; }
      this.lookX = damp(this.lookX, ax, 2.2, dt); this.lookZ = damp(this.lookZ, az, 2.2, dt);
      this.tx = damp(this.tx, x, c.followRate, dt); this.tz = damp(this.tz, z, c.followRate, dt);
      const targetView = clamp(c.baseView + speed * c.viewPerMps, c.baseView, c.maxView);
      this.view = damp(this.view, targetView, c.zoomRate, dt);
    }
    let sx = 0, sz = 0, sy = 0;
    if (this._shakeDur > 0) {
      this._shakeT += dt;
      const k = Math.max(0, 1 - this._shakeT / this._shakeDur);
      const a = this._shakeAmt * k * k, t = this._time * 40;
      sx = Math.sin(t * 1.3) * a; sz = Math.cos(t * 1.7) * a; sy = Math.sin(t * 2.1) * a * 0.5;
      if (k <= 0) { this._shakeDur = 0; this._shakeAmt = 0; }
    }
    const fx = this.tx + this.lookX + this.offsetX + sx, fz = this.tz + this.lookZ + this.offsetZ + sz;
    const d = c.distance;
    this.camera.position.set(fx + this.dir.x * d, this.dir.y * d + sy, fz + this.dir.z * d);
    this.camera.lookAt(fx, sy, fz);
    this._applyFrustum();
  }

  /** Ponto do chão no centro da tela (útil p/ HUD). */
  get focusX() { return this.tx + this.lookX + this.offsetX; }
  get focusZ() { return this.tz + this.lookZ + this.offsetZ; }
}
