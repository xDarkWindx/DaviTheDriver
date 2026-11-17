// Viagem: largada, cronômetro, GPS (rota sugerida pela malha), seta de direção 3D e detecção de chegada.
import * as THREE from 'three';
import { ROUTES } from '../config.js';
import { samplePts } from '../world/roadNetwork.js';

const GPS_INTERVAL = 0.5;   // s entre recálculos de rota
const GUIDE_AHEAD = 45;     // m à frente no caminho sugerido

export class Trip {
  constructor({ scene, net, state }) {
    Object.assign(this, { scene, net, state });
    this.route = [];          // laneIds da rota sugerida (GPS)
    this._routeS = 0;
    this._gpsT = 0;
    this._near = {}; this._T = { x: 0, z: 0, tx: 0, tz: 0 };
    this.def = null;
    this._buildVisuals();
  }

  _buildVisuals() {
    // seta (deitada, aponta para +Z no espaço local)
    const sh = new THREE.Shape();
    sh.moveTo(0, 1.6); sh.lineTo(1.1, 0.2); sh.lineTo(0.42, 0.2); sh.lineTo(0.42, -1.2);
    sh.lineTo(-0.42, -1.2); sh.lineTo(-0.42, 0.2); sh.lineTo(-1.1, 0.2); sh.closePath();
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); // XY -> deitada; ponta (+Y) passa a apontar +Z
    this.arrow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd21f, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthTest: false }));
    this.arrow.renderOrder = 10; this.arrow.name = 'guide-arrow'; this.arrow.visible = false;
    this.scene.add(this.arrow);
    // marcador do destino: anel no chão + coluna de luz
    const ringG = new THREE.RingGeometry(0.86, 1, 40); ringG.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.8, depthWrite: false }));
    const beamG = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); beamG.translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.name = 'dest-ring'; this.beam.name = 'dest-beam';
    this.ring.visible = this.beam.visible = false;
    this.ring.renderOrder = 3; this.beam.renderOrder = 4;
    this.scene.add(this.ring, this.beam);
    this._t = 0;
  }

  /** Configura a viagem (rota) e retorna a pose de largada {x,z,heading}. */
  setup(routeId, parking = null, via = null) {
    const def = ROUTES[routeId];
    if (!def) throw new Error('rota desconhecida: ' + routeId);
    this.def = def;
    // STJ: o destino/largada é o estacionamento da viagem (state.trip.parking): zones/starts 'stj_<parking>'
    const pk = (id) => (id === 'stj' && parking && this.net.zones['stj_' + parking] ? 'stj_' + parking : id);
    this.destZoneId = pk(def.destZone); this.startId = pk(def.start);
    const zone = this.net.zones[this.destZoneId];
    this.state.trip.destLabel = zone.label || '';
    const tr = this.state.trip;
    tr.destX = zone.x; tr.destZ = zone.z; tr.destRadius = zone.r; tr.arrived = false; tr.elapsed = 0;
    this._dest = this.net.laneForZone(this.destZoneId);
    this.ring.position.set(zone.x, 0.12, zone.z); this.ring.scale.setScalar(zone.r);
    this.beam.position.set(zone.x, 0, zone.z); this.beam.scale.set(zone.r * 0.35, 60, zone.r * 0.35);
    this.ring.visible = this.beam.visible = true;
    this.arrow.visible = true;
    this._gpsT = 0; this.route.length = 0;
    // caminho de chegada/saída do STJ (ex.: carona pela Via L4): waypoints que o GPS respeita até passar por eles
    this.via = via && via.length ? via.slice() : null; this.viaIdx = 0;
    return this.net.snapStart(this.net.starts[this.startId]);
  }

  hide() { this.ring.visible = this.beam.visible = this.arrow.visible = false; }

  /** Passo de simulação (só em PLAYING). Retorna true se chegou neste passo. */
  update(dt) {
    const tr = this.state.trip, p = this.state.player;
    tr.elapsed += dt;
    const ddx = tr.destX - p.x, ddz = tr.destZ - p.z; tr.distToDest = Math.sqrt(ddx * ddx + ddz * ddz);
    this._gpsT -= dt;
    if (this._gpsT <= 0) { this._gpsT = GPS_INTERVAL; this._gps(); }
    if (!tr.arrived && tr.distToDest < tr.destRadius) { tr.arrived = true; return true; }
    return false;
  }

  _gps() {
    const tr = this.state.trip, p = this.state.player, net = this.net;
    let near = net.nearestLane(p.x, p.z, this._near, p.heading, 1.3);
    if (!near || near.dist > 25) near = net.nearestLane(p.x, p.z, this._near);
    if (!near) { tr.guideX = tr.destX; tr.guideZ = tr.destZ; tr.routeDistLeft = tr.distToDest; this._bearing(); return; }
    let r = null;
    if (this.via) {
      const seg = near.lane.segId;
      for (let i = this.viaIdx; i < this.via.length; i++) if (this.via[i] === seg) { this.viaIdx = i + 1; break; }
      if (this.viaIdx < this.via.length) { try { r = net.planRouteVia(near.laneId, near.s, this.via.slice(this.viaIdx), this._dest.targets, this.route); } catch (e) { r = null; } }
    }
    if (!r) r = net.planRoute(near.laneId, near.s, this._dest.targets, this.route);
    if (!r) { tr.guideX = tr.destX; tr.guideZ = tr.destZ; tr.routeDistLeft = tr.distToDest; this._bearing(); return; }
    // ponto GUIDE_AHEAD m à frente na rota
    let left = GUIDE_AHEAD, s = near.s, T = this._T;
    const first = net.getLane(r[0]);
    if (first.id !== near.laneId) s = net.projectOnLane(first, p.x, p.z);
    let gx = tr.destX, gz = tr.destZ;
    for (let i = 0; i < r.length; i++) {
      const lane = net.getLane(r[i]);
      const s0 = i === 0 ? s : 0;
      const avail = lane.length - s0;
      if (avail >= left || i === r.length - 1) {
        samplePts(lane.pts, lane.cum, Math.min(lane.length, s0 + left), T);
        gx = T.x; gz = T.z; break;
      }
      left -= avail;
    }
    // perto do destino: aponta para o centro da zona
    if (tr.distToDest < GUIDE_AHEAD) { gx = tr.destX; gz = tr.destZ; }
    tr.guideX = gx; tr.guideZ = gz;
    tr.routeDistLeft = net.routeLength(r, s);
    this._bearing();
  }
  _bearing() {
    const tr = this.state.trip, p = this.state.player;
    tr.guideBearing = Math.atan2(tr.guideX - p.x, tr.guideZ - p.z);
  }

  /** Render: seta acima do carro apontando para o ponto-guia; pulso do destino. */
  frame(dt, carX, carZ) {
    this._t += dt;
    if (this.arrow.visible) {
      const tr = this.state.trip;
      const b = Math.atan2(tr.guideX - carX, tr.guideZ - carZ);
      this.arrow.position.set(carX + Math.sin(b) * 4.2, 2.6 + Math.sin(this._t * 4) * 0.15, carZ + Math.cos(b) * 4.2);
      this.arrow.rotation.y = b;
    }
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(this._t * 3) * 0.25;
  }
}
