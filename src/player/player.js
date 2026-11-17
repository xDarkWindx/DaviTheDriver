// Veículo do jogador: física (physics.js), modelo (vehicleModels.js), colisão com estáticos,
// dados da via sob o carro e espelho em state.player. Parametrizado por VEHICLES[trip.vehicleId].
import * as THREE from 'three';
import { VEHICLES } from '../config.js';
import { EV } from '../core/events.js';
import { makeOBB, makeContact, collide } from '../core/collision.js';
import { stepVehicle, createVehicleState, defaultMods } from './physics.js';
import { buildVehicleModel } from './vehicleModels.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

export class Player {
  constructor({ scene, net, colliders, events, state, quality, blobTexture }) {
    Object.assign(this, { scene, net, colliders, events, state, quality, blobTexture });
    this.vehicle = VEHICLES.kwid;
    this.phys = createVehicleState();
    /** Ganchos de modificadores externos (ansiedade/estresse etc.). Ver physics.defaultMods(). */
    this.mods = defaultMods();
    /** Caixa de colisão (OBB) atualizada a cada passo: { x, z, hx, hz, angle } */
    this.obb = makeOBB(0, 0, 0.8, 1.85, 0);
    this.radius = 2;                 // raio envolvente (círculo) — colisão grosseira com veículos
    this.model = null;
    this.prev = { x: 0, z: 0, heading: 0 };
    this._contact = makeContact(); this._near = []; this._info = {}; this._lane = {};
    this._hitCooldown = 0; this._wheelSpin = 0; this._roll = 0; this._pitch = 0;
    this.time = 0;
    this.frozen = false;             // true = não simula (ex.: após chegada)
  }

  /** Troca o veículo (reconstrói o modelo). id = chave de VEHICLES. */
  setVehicle(id) {
    const v = VEHICLES[id];
    if (!v) throw new Error('veículo desconhecido: ' + id);
    if (this.model && this.vehicle === v) return;
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.vehicle = v;
    this.model = buildVehicleModel(v, this.quality, this.blobTexture);
    this.scene.add(this.model.root);
    this.obb.hx = v.width / 2; this.obb.hz = v.length / 2;
    this.radius = Math.hypot(v.width, v.length) / 2;
  }

  /** Posiciona parado na pose dada. */
  reset(pose) {
    const p = this.phys;
    Object.assign(p, createVehicleState());
    p.x = pose.x; p.z = pose.z; p.heading = pose.heading;
    this.prev.x = p.x; this.prev.z = p.z; this.prev.heading = p.heading;
    Object.assign(this.mods, defaultMods());
    this.frozen = false; this._hitCooldown = 0; this.time = 0;
    this.state.player.collisions = 0;
    this._sync();
    this.frame(1);
  }

  /** Preenche `out` com a OBB atual (cópia). */
  getOBB(out = makeOBB()) { Object.assign(out, this.obb); return out; }

  update(dt, input) {
    const p = this.phys;
    this.prev.x = p.x; this.prev.z = p.z; this.prev.heading = p.heading;
    if (this.frozen) { p.vx *= 0.9; p.vz *= 0.9; this._sync(); return; }
    this.time += dt;
    const info = this.net.roadInfoAt(p.x, p.z, this._info);
    const inp = this._inp || (this._inp = { throttle: 0, brake: 0, steer: 0, handbrake: false });
    inp.throttle = input.axes.throttle; inp.brake = input.axes.brake; inp.steer = input.axes.steer; inp.handbrake = input.handbrake;
    const sp = this.state.player; sp.throttle = inp.throttle; sp.brake = inp.brake; sp.handbrake = inp.handbrake;
    const wasOff = p.offroad;
    stepVehicle(p, this.vehicle, inp, this.mods, dt, { offroad: !info.onRoad, t: this.time });
    if (wasOff !== p.offroad) this.events.emit(EV.OFFROAD, { on: p.offroad, x: p.x, z: p.z });
    this._collideStatic(dt);
    this._sync(info);
  }

  _collideStatic(dt) {
    const p = this.phys, o = this.obb, c = this._contact;
    o.x = p.x; o.z = p.z; o.angle = p.heading;
    this._hitCooldown = Math.max(0, this._hitCooldown - dt);
    const n = this.colliders.query(p.x, p.z, this.radius + 1, this._near);
    let worst = null, worstImpact = 0, wnx = 0, wnz = 0;
    for (let i = 0; i < n; i++) {
      const col = this._near[i];
      if (!collide(o, col, c)) continue;
      // empurra para fora
      p.x += c.nx * c.depth; p.z += c.nz * c.depth;
      o.x = p.x; o.z = p.z;
      const vn = p.vx * c.nx + p.vz * c.nz; // <0 = indo contra
      if (vn < 0) {
        const impact = -vn;
        // remove componente normal (restituição 0.25) e aplica atrito tangencial
        p.vx -= (1.25) * vn * c.nx; p.vz -= (1.25) * vn * c.nz;
        p.vx *= 0.82; p.vz *= 0.82;
        if (impact > worstImpact) { worstImpact = impact; worst = col; wnx = c.nx; wnz = c.nz; }
      }
    }
    if (worst) {
      const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
      p.speed = p.vx * sh + p.vz * ch;
      const impactKmh = worstImpact * 3.6;
      if (this._hitCooldown <= 0 && impactKmh > 3) {
        this._hitCooldown = 0.6;
        this.state.player.collisions++;
        this.events.emit(EV.COLLISION, { a: 'player', b: 'static', kind: worst.kind, otherId: worst.id || null,
          impactKmh, x: p.x, z: p.z, nx: wnx, nz: wnz });
      }
    }
  }

  _sync(info) {
    const p = this.phys, sp = this.state.player;
    sp.x = p.x; sp.z = p.z; sp.heading = p.heading; sp.vx = p.vx; sp.vz = p.vz;
    sp.speed = p.speed; sp.speedKmh = Math.abs(p.speed) * 3.6; sp.steer = p.steer;
    sp.offroad = p.offroad; sp.braking = p.braking; sp.reversing = p.reversing; sp.turbo = p.spool;
    sp.vehicleId = this.vehicle.id;
    if (info) {
      const lane = this.net.laneAt(p.x, p.z, p.heading, this._lane);
      sp.laneId = lane && lane.dist < 6 ? lane.laneId : -1;
      sp.roadName = info.onRoad || info.segDist < 25 ? (lane && lane.dist < 8 ? lane.lane.name : info.name) || info.name : '';
      sp.speedLimitKmh = lane && lane.dist < 8 ? lane.lane.limitKmh : info.onRoad ? info.limitKmh : 0;
      sp.inJunction = info.inJunction;
    }
  }

  /** Render: interpola pose entre passos (alpha 0..1) e anima rodas/rolagem/luz de freio. */
  frame(alpha, realDt = 0) {
    if (!this.model) return;
    const p = this.phys, pv = this.prev, m = this.model;
    const x = pv.x + (p.x - pv.x) * alpha, z = pv.z + (p.z - pv.z) * alpha;
    let dh = p.heading - pv.heading;
    if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
    const h = pv.heading + dh * alpha;
    m.root.position.set(x, 0, z);
    m.root.rotation.y = h;
    // rolagem/arfagem visuais
    const v = this.vehicle;
    const targetRoll = Math.max(-0.09, Math.min(0.09, -p.latAccel * 0.006 * v.bodyRoll));
    const targetPitch = Math.max(-0.05, Math.min(0.05, -p.longAccel * 0.0035 * v.bodyRoll));
    const k = Math.min(1, realDt * 8);
    this._roll += (targetRoll - this._roll) * k; this._pitch += (targetPitch - this._pitch) * k;
    m.body.rotation.z = this._roll; m.body.rotation.x = this._pitch;
    m.body.position.y = 0;
    m.brake.visible = p.braking || (this.state.player.brake > 0 && p.speed > 0.3);
    // rodas
    this._wheelSpin += (p.speed * realDt) / m.wheelR;
    const steerAng = p.steer * 0.5;
    for (let i = 0; i < 4; i++) {
      const s = m.wheelSlots[i];
      _p.set(s.x, m.wheelR, s.z);
      _e.set(this._wheelSpin, (s.front ? steerAng : 0) + (s.side < 0 ? Math.PI : 0), 0, 'YXZ');
      if (s.side < 0) _e.x = -this._wheelSpin;
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      m.wheels.setMatrixAt(i, _m);
    }
    m.wheels.instanceMatrix.needsUpdate = true;
  }
}
