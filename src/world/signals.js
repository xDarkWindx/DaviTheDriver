// Controlador de semáforos (ciclo verde/amarelo/vermelho) + visual (postes e lâmpadas instanciadas).
// A REGRA de multa por avanço de sinal NÃO está aqui (é de systems/rules.js).
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { makeRng } from '../core/math.js';

export const SIGNAL_TIMING = { green: 15, yellow: 3, allRed: 1.0, pedWalk: 9 };

const LAMP_ON = [new THREE.Color(0xff2a1a), new THREE.Color(0xffc21a), new THREE.Color(0x2bff6a)];
const LAMP_OFF = [new THREE.Color(0x3a1310), new THREE.Color(0x3a2e10), new THREE.Color(0x113a1c)];

/**
 * Fases por semáforo (groups = 1 ou 2):
 *   2 grupos: G0, Y0, AR, G1, Y1, AR
 *   1 grupo (semáforo de pedestre): G0, Y0, AR(travessia de pedestres = pedWalk)
 */
export class SignalController {
  constructor(net, events) {
    this.net = net; this.events = events;
    const rng = makeRng(2024);
    this.sigs = net.signals.map((s) => {
      const phases = s.groups === 2
        ? [['g', 0, SIGNAL_TIMING.green], ['y', 0, SIGNAL_TIMING.yellow], ['r', -1, SIGNAL_TIMING.allRed],
          ['g', 1, SIGNAL_TIMING.green], ['y', 1, SIGNAL_TIMING.yellow], ['r', -1, SIGNAL_TIMING.allRed]]
        : [['g', 0, SIGNAL_TIMING.green + 4], ['y', 0, SIGNAL_TIMING.yellow], ['r', -1, SIGNAL_TIMING.pedWalk]];
      return { def: s, phases, phase: 0, t: rng() * 10, groupState: new Array(s.groups).fill('red') };
    });
    for (const s of this.sigs) this._refresh(s, false);
    this.visual = null;
  }

  _refresh(s, emit) {
    const [kind, g] = s.phases[s.phase];
    for (let i = 0; i < s.groupState.length; i++) {
      const st = i === g ? (kind === 'g' ? 'green' : kind === 'y' ? 'yellow' : 'red') : 'red';
      if (st !== s.groupState[i]) {
        s.groupState[i] = st;
        if (emit) this.events.emit(EV.SIGNAL_CHANGE, { signalId: s.def.id, group: i, state: st });
      }
    }
  }

  reset() { const rng = makeRng(77); for (const s of this.sigs) { s.phase = 0; s.t = rng() * 10; this._refresh(s, false); } this._dirty = true; }

  update(dt) {
    for (const s of this.sigs) {
      s.t += dt;
      const dur = s.phases[s.phase][2];
      if (s.t >= dur) {
        s.t -= dur; s.phase = (s.phase + 1) % s.phases.length;
        this._refresh(s, true);
        this._dirty = true;
      }
    }
  }

  /** 'green' | 'yellow' | 'red' para (semáforo, grupo). */
  getState(signalId, group) { return this.sigs[signalId].groupState[group]; }
  /** Estado para uma faixa (null se a faixa não termina em semáforo). */
  stateForLane(lane) { return lane.signal ? this.getState(lane.signal.signalId, lane.signal.group) : null; }
  /** Segundos até a próxima troca de fase do semáforo. */
  timeToChange(signalId) { const s = this.sigs[signalId]; return s.phases[s.phase][2] - s.t; }
  /** Pedestres podem atravessar a via do grupo `group`? (grupo no vermelho e sem amarelo em curso) */
  isPedWalk(signalId, group) {
    const s = this.sigs[signalId];
    const [kind] = s.phases[s.phase];
    return s.groupState[group] === 'red' && kind !== 'y';
  }

  // ------------------------------------------------------------- visual
  buildVisual(scene, inst, quality) {
    // postes/caixas: instâncias estáticas ('box'); lâmpadas: um InstancedMesh global (cores mudam)
    const lamps = [];
    for (const s of this.sigs) {
      for (const ap of s.def.approaches) {
        const h = ap.heading; // sentido do tráfego que chega; a cara do semáforo olha para ele (heading + PI)
        const fx = Math.sin(h), fz = Math.cos(h);
        const px = ap.poleX, pz = ap.poleZ;
        inst.add('box', px, 0, pz, h, 0.18, 4.2, 0.18, 0x2b2d30);           // poste
        const bx = px - fx * 0.15, bz = pz - fz * 0.15;
        inst.add('box', bx, 3.2, bz, h, 0.5, 1.45, 0.38, 0x1c1d1f);          // caixa
        inst.add('box', bx - fx * 0.2, 3.15, bz - fz * 0.2, h, 0.7, 1.6, 0.04, 0xe8c628); // placa amarela de fundo
        for (let k = 0; k < 3; k++) {
          lamps.push({ sig: s, group: ap.group, k, x: bx - fx * 0.21, y: 3.72 - k * 0.45, z: bz - fz * 0.21 });
        }
        // braço sobre a via (amarelo/escuro) só para vias largas
        const seg = this.net.getSegment(ap.segId);
        if (Math.max(seg.edgeR, -seg.edgeL) > 6) {
          const rx = -fz, rz = fx; // direita do fluxo; braço vai para a esquerda (sobre a via)
          const len = Math.min(9, seg.lanesF * seg.laneW + 1);
          inst.add('box', px - rx * len / 2, 4.6, pz - rz * len / 2, h + Math.PI / 2, 0.16, 0.16, len, 0x2b2d30);
          const ex = px - rx * (len - 0.5) - fx * 0.15, ez = pz - rz * (len - 0.5) - fz * 0.15;
          inst.add('box', ex, 3.6, ez, h, 0.5, 1.45, 0.38, 0x1c1d1f);
          for (let k = 0; k < 3; k++) lamps.push({ sig: s, group: ap.group, k, x: ex - fx * 0.21, y: 4.12 - k * 0.45, z: ez - fz * 0.21 });
        }
      }
    }
    const geo = new THREE.SphereGeometry(0.17, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => { m.makeTranslation(l.x, l.y, l.z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, LAMP_OFF[l.k]); });
    mesh.computeBoundingSphere();
    mesh.name = 'signal-lamps';
    scene.add(mesh);
    this.visual = { mesh, lamps };
    this._dirty = true;
    void quality; // reservado: LOD de semáforos por perfil
  }

  /** Atualiza cores das lâmpadas (só quando alguma fase mudou). */
  frame() {
    if (!this.visual || !this._dirty) return;
    this._dirty = false;
    const { mesh, lamps } = this.visual;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      const st = l.sig.groupState[l.group];
      const on = (st === 'red' && l.k === 0) || (st === 'yellow' && l.k === 1) || (st === 'green' && l.k === 2);
      mesh.setColorAt(i, on ? LAMP_ON[l.k] : LAMP_OFF[l.k]);
    }
    mesh.instanceColor.needsUpdate = true;
  }
}

