// Piloto-robô (playtest/balanceamento). INERTE até ser ligado: `ctx.autopilot.start({ profile, corridor })`
// ou `index.html?bot=normal[&rota=parque]`. Dirige SÓ pelos controles reais (input.setVirtual: up/down/left/right
// e as ações H/R/F), com a física real, então sente os efeitos de humor no volante igual a um jogador.
//   - segue a rota (GPS = Eixo, ou o corredor do Parque com planRouteVia), troca de faixa para cumprir a rota;
//   - respeita limite, curva, semáforo, faixa de pedestre e quem está no caminho (corredor + previsão de cruzamento);
//   - perfis: 'cuidadoso' | 'normal' | 'apressado' (corre, cola, ultrapassa, usa faixa de ônibus, passa no amarelo).
// Volante/pedais binários (teclado) por modulação sigma-delta: a média em poucos passos dá o valor contínuo.
import { engineAccel } from '../player/physics.js';

export const BOT_PROFILES = {
  cuidadoso: { speedMul: 0.95, speedAdd: 0, T: 1.8, s0: 3.5, a: 2.2, b: 2.8, latA: 3.4, yellowDecel: 6, busLane: false,
    overtake: 0.7, overtakeFree: 55, breatheAt: 58, hornBlocked: 0, flashBlocked: 0, waitPed: true },
  normal: { speedMul: 1.0, speedAdd: 6, T: 1.2, s0: 2.5, a: 3.0, b: 3.4, latA: 4.6, yellowDecel: 4.5, busLane: false,
    overtake: 0.8, overtakeFree: 40, breatheAt: 72, hornBlocked: 8, flashBlocked: 5, waitPed: true },
  apressado: { speedMul: 1.35, speedAdd: 6, T: 0.7, s0: 1.5, a: 4.5, b: 5.0, latA: 6.2, yellowDecel: 2.2, busLane: true,
    overtake: 0.95, overtakeFree: 26, breatheAt: 95, hornBlocked: 2.5, flashBlocked: 1.5, waitPed: false },
};

const PATH_N = 64, PATH_DS = 2.5; // amostras do caminho à frente (160 m)

export function createAutopilot(ctx) {
  const net = ctx.net, input = ctx.input, st = ctx.state;
  const P = { x: new Float64Array(PATH_N), z: new Float64Array(PATH_N), h: new Float64Array(PATH_N), lim: new Float64Array(PATH_N),
    lane: new Int32Array(PATH_N), n: 0 };
  const tmpS = { x: 0, z: 0, tx: 0, tz: 0, heading: 0 }, tmpO = { x: 0, z: 0, tx: 0, tz: 0, heading: 0 }, near = {};
  const bot = {
    on: false, prof: BOT_PROFILES.normal, profile: 'normal', corridor: 'eixo',
    route: [], ri: 0, track: -1, s: 0, laneT: 0, e: { st: 0, th: 0, br: 0 }, debug: {}, blockedT: 0, stuckT: 0, reverseT: 0,
    replanT: 0, lastLC: -9, t: 0,
    start(opts = {}) {
      this.profile = opts.profile || 'normal'; this.prof = BOT_PROFILES[this.profile] || BOT_PROFILES.normal;
      this.corridor = opts.corridor || 'eixo'; this.on = true; this._viaDone = false; this._offRouteT = 0; this.route.length = 0; this.ri = 0; this.track = -1;
      this.blockedT = 0; this.stuckT = 0; this.reverseT = 0; this.replanT = 0; this.t = 0; this.lastLC = -9;
      this.e.st = this.e.th = this.e.br = 0;
      ctx.game.preStep = (dt) => this.step(dt);
    },
    stop() { this.on = false; for (const k of ['up', 'down', 'left', 'right', 'horn']) input.setVirtual(k, false); ctx.game.preStep = null; },

    _plan() {
      const p = st.player, tr = st.trip;
      const r = net.nearestLane(p.x, p.z, near, p.heading, 1.2);
      if (!r) return false;
      const dest = (ctx.trip._dest || net.laneForZone(ctx.ROUTES[tr.routeId].destZone)).targets;
      let route = null;
      const tv = ctx.trip.via ? ctx.trip.via.slice(ctx.trip.viaIdx) : [];
      if ((this.corridor === 'parque' || tv.length) && !this._viaDone) {
        const pq = this.corridor === 'parque' && net.routeCorridors.parque ? net.routeCorridors.parque[tr.routeId] : [];
        const tvUse = pq.length && tr.parking === 'norte' ? [] : tv; // pelo Parque a chegada ao Norte vem da Rotatória 1
        const via = tr.routeId === 'casa-stj' ? pq.concat(tvUse) : tvUse.concat(pq);
        if (via) { try { route = net.planRouteVia(r.laneId, r.s, via, dest, []); } catch (e) { route = null; } }
        this._viaDone = !!route; // depois de planejado uma vez segue a lista (replanos só se sair dela)
      }
      if (!route) route = net.planRoute(r.laneId, r.s, dest, []);
      if (!route) return false;
      this.route = route.slice(); this.ri = 0; this.track = r.laneId; this.s = r.s;
      return true;
    },

    _routeIdxOf(lane) {
      const R = this.route;
      for (let i = Math.max(0, this.ri - 1); i < Math.min(R.length, this.ri + 6); i++) {
        const L = net.lanes[R[i]];
        if (L.id === lane.id) return i;
        if (!L.isConnector && !lane.isConnector && L.segId === lane.segId && L.dir === lane.dir) return i;
      }
      return -1;
    },

    /** Próxima faixa depois de `lane` seguindo a rota (ou a reta, fora dela). */
    _nextLane(lane, idx) {
      const R = this.route, nx = lane.next;
      if (!nx.length) return -1;
      if (idx >= 0 && idx + 1 < R.length) {
        const want = R[idx + 1];
        if (nx.indexOf(want) >= 0) return want;
        // faixa paralela à da rota: conector que leva ao mesmo segmento seguinte da rota
        let tgt = null;
        for (let k = idx + 1; k < Math.min(R.length, idx + 4); k++) { const L = net.lanes[R[k]]; if (!L.isConnector) { tgt = L.segId; break; } }
        if (tgt) for (const id of nx) { const c = net.lanes[id]; if (c.isConnector && c.toLane != null && net.lanes[c.toLane].segId === tgt) return id; }
      }
      for (const id of nx) { const t = net.lanes[id].turn; if (t === 'straight' || t === 'merge' || t == null) return id; }
      return nx[0];
    },

    /** Amostra o caminho à frente a partir de (faixa track, s). */
    _samplePath() {
      let lane = net.lanes[this.track], s = this.s, idx = this._routeIdxOf(lane);
      let n = 0;
      while (n < PATH_N) {
        if (s > lane.length) {
          const nid = this._nextLane(lane, idx);
          if (nid < 0) break;
          s -= lane.length; lane = net.lanes[nid];
          idx = idx >= 0 && this.route[idx + 1] === nid ? idx + 1 : this._routeIdxOfFrom(lane, idx);
          continue;
        }
        net.sampleLane(lane, s, tmpS);
        P.x[n] = tmpS.x; P.z[n] = tmpS.z; P.h[n] = tmpS.heading; P.lim[n] = lane.limitKmh; P.lane[n] = lane.id; n++;
        s += PATH_DS;
      }
      P.n = n;
    },
    _routeIdxOfFrom(lane, from) {
      const R = this.route;
      for (let i = Math.max(0, from); i < Math.min(R.length, from + 4); i++) {
        const L = net.lanes[R[i]];
        if (L.id === lane.id || (!L.isConnector && !lane.isConnector && L.segId === lane.segId && L.dir === lane.dir)) return i;
      }
      return -1;
    },

    /** Faixa livre em [s-back, s+fwd]? (veículos do trânsito naquela faixa) */
    _laneFree(laneId, s, back, fwd) {
      const vs = ctx.modules.traffic.vehicles, L = net.lanes[laneId];
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v.laneId !== laneId) continue;
        const vs_ = v.w ? v.w.s : net.projectOnLane(L, v.x, v.z);
        const d = vs_ - s;
        const relV = v.speed - Math.abs(st.player.speed);
        if (d > -back - Math.max(0, relV) * 3 && d < fwd) return false;
      }
      return true;
    },

    step(dt) {
      if (!this.on || st.mode !== 'PLAYING') return;
      this.t += dt;
      const p = st.player, ph = ctx.player.phys, veh = ctx.player.vehicle, prof = this.prof, sim = ctx.modules.traffic.debug.sim;
      const v = Math.max(0, ph.speed);
      // --- localiza na rota
      this.replanT -= dt;
      if (!this.route.length || this.replanT <= 0) {
        this.replanT = 0.25;
        const cur = net.nearestLane(p.x, p.z, near, p.heading, 1.0);
        let idx = cur ? this._routeIdxOf(cur.lane) : -1;
        if (!this.route.length || (idx < 0 && cur && cur.dist < 4 && !cur.lane.isConnector && this._offRouteT > 1.5)) { this._plan(); idx = 0; this._offRouteT = 0; }
        if (cur && idx < 0) this._offRouteT = (this._offRouteT || 0) + 0.25; else this._offRouteT = 0;
        if (idx >= 0) this.ri = idx;
        if (cur) {
          // faixa a seguir: a atual, salvo troca para a da rota / ultrapassagem
          if (this.track < 0 || cur.laneId !== this.track) {
            // segue por progressão: fica na faixa acompanhada enquanto estiver perto dela; no fim, passa à próxima da rota
            let T = net.lanes[this.track], keep = false;
            for (let g = 0; T && g < 3; g++) {
              const sT = net.projectOnLane(T, p.x, p.z);
              net.sampleLane(T, sT, tmpS);
              const d = Math.hypot(tmpS.x - p.x, tmpS.z - p.z);
              if (sT < T.length - 0.3 && d < (T.isConnector ? 4 : 3.2)) { keep = true; break; }
              if (sT >= T.length - 0.3 && d < 6) { const nid = this._nextLane(T, this._routeIdxOf(T)); if (nid < 0) break; this.track = nid; T = net.lanes[nid]; continue; }
              break;
            }
            const same = T && !T.isConnector && !cur.lane.isConnector && T.segId === cur.lane.segId && T.dir === cur.lane.dir;
            if (!keep && !same) this.track = cur.laneId;
            if (keep || same) { idx = this._routeIdxOf(net.lanes[this.track]); if (idx >= 0) this.ri = idx; }
          }
          const T = net.lanes[this.track];
          this.s = net.projectOnLane(T, p.x, p.z);
          if (!T.isConnector && this.ri < this.route.length) this._chooseLane(T, cur);
        }
      }
      const T = net.lanes[this.track];
      if (!T) return;
      this.s = net.projectOnLane(T, p.x, p.z);
      this._samplePath();
      if (P.n < 2) { this._pedals(0, 1); return; }

      // --- direção (pure pursuit)
      const Ld = Math.max(5, Math.min(28, 4 + v * 0.6));
      let k = Math.min(P.n - 1, Math.round(Ld / PATH_DS));
      const tx = P.x[k], tz = P.z[k];
      const dx = tx - ph.x, dz = tz - ph.z;
      const fx = Math.sin(ph.heading), fz = Math.cos(ph.heading);
      const fwd = dx * fx + dz * fz, left = dx * fz - dz * fx; // + = à esquerda
      const L2 = dx * dx + dz * dz;
      const curv = 2 * left / Math.max(1, L2);
      const sp = Math.min(1, v / 32);
      const maxSteer = veh.maxSteerLow + (veh.maxSteerHigh - veh.maxSteerLow) * Math.pow(sp, 0.7);
      let u = Math.atan(curv * veh.wheelbase) / maxSteer;
      if (fwd < 0) u = left >= 0 ? 1 : -1;
      // amortecimento da guinada (segura o "chicote" a alta velocidade)
      u -= (ph.yawRate - v * curv) * 0.05;
      u = Math.max(-1, Math.min(1, u));
      this.debug.u = u;

      // --- velocidade desejada (limite + curva)
      const tgt = (lim) => Math.max(15, lim * prof.speedMul + prof.speedAdd) / 3.6;
      let v0 = tgt(P.lim[0]);
      if (this.needLC) v0 *= 0.65; // precisa trocar de faixa para a saída: deixa o fluxo passar e abre brecha
      let aCons = 99;
      const cons = (d, vt) => { // chegar a vt na distância d
        if (vt >= v) return;
        const a = (vt * vt - v * v) / (2 * Math.max(0.5, d));
        if (a < aCons) aCons = a;
      };
      for (let i = 1; i < P.n - 2; i++) {
        const d = i * PATH_DS;
        const vl = tgt(P.lim[i]);
        if (vl < v) cons(d, vl);
        // curvatura em janela de 3 amostras
        let dh = P.h[i + 2] - P.h[i - 1]; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
        const kc = Math.abs(dh) / (3 * PATH_DS);
        if (kc > 0.004) cons(Math.max(0, d - 4), Math.max(4, Math.sqrt(prof.latA / kc)));
      }
      // --- obstáculos
      let obsGap = 1e9, obsV = 0, legit = false;
      let obsDh = 0;
      this.debug.why = null; this.debug.curve = aCons < 99;
      const obstacle = (gap, vo, why, dh = 0) => { if (gap < obsGap) { obsGap = gap; obsV = vo; this.debug.why = why; obsDh = dh; } };
      // semáforos e faixas de pedestre ao longo do caminho
      {
        let lane = net.lanes[this.track], s = this.s, base = -s, idx = this._routeIdxOf(lane), guard = 0;
        while (base < 150 && guard++ < 12) {
          const sig = lane.signal;
          if (sig) {
            const stop = sim.laneStop[lane.id];
            const d = base + stop - veh.length * 0.5 - 1.0;
            if (d > -1.5) {
              const state = ctx.signals.getState(sig.signalId, sig.group);
              if (state === 'red') { if (d > -0.5 && !(d < 1 && v > 6)) { obstacle(d, 0, 'red'); legit = true; } }
              else if (state === 'yellow') {
                const need = (v * v) / (2 * prof.yellowDecel);
                if (d > need) { obstacle(d, 0, 'yellow'); legit = true; }
              }
            }
          }
          for (const c of lane.crosswalks) {
            const d = base + c.s - 2.5 - veh.length * 0.5 - 1.2;
            if (d < -1 || d > 90) continue;
            const busy = (sim.cwCross[c.id] > 0 && (c.m == null || sim.cwBlockedM(c.id, c.m))) || (prof.waitPed && sim.cwWait[c.id] > 0 && d < 40);
            if (busy && !(d < 1.5 && v > 8)) { obstacle(Math.max(0, d), 0, 'faixa'); legit = true; }
          }
          base += lane.length;
          const nid = this._nextLane(lane, idx);
          if (nid < 0) break;
          idx = idx >= 0 && this.route[idx + 1] === nid ? idx + 1 : this._routeIdxOfFrom(net.lanes[nid], idx);
          lane = net.lanes[nid];
        }
      }
      // veículos e pessoas no corredor do caminho
      const vs = ctx.modules.traffic.vehicles, myW = veh.width * 0.5;
      for (let i = 0; i < vs.length; i++) {
        const o = vs[i];
        const ox = o.x - ph.x, oz = o.z - ph.z;
        if (ox * ox + oz * oz > 120 * 120) continue;
        if (ox * fx + oz * fz < -2) continue; // atrás
        // amostra mais próxima
        let bi = -1, bd = 1e9;
        for (let j = 0; j < P.n; j += 2) { const ex = o.x - P.x[j], ez = o.z - P.z[j], dd = ex * ex + ez * ez; if (dd < bd) { bd = dd; bi = j; } }
        for (let j = Math.max(0, bi - 1); j <= Math.min(P.n - 1, bi + 1); j++) { const ex = o.x - P.x[j], ez = o.z - P.z[j], dd = ex * ex + ez * ez; if (dd < bd) { bd = dd; bi = j; } }
        let dh = o.heading - P.h[bi]; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
        const ext = Math.abs(Math.cos(dh)) * o.width * 0.5 + Math.abs(Math.sin(dh)) * o.length * 0.5;
        const latMax = myW + ext + 0.45;
        if (bd < latMax * latMax) {
          const along = Math.abs(Math.cos(dh)) * o.length * 0.5 + Math.abs(Math.sin(dh)) * o.width * 0.5;
          const gap = bi * PATH_DS - veh.length * 0.5 - along;
          const vo = Math.max(0, o.speed * Math.cos(dh));
          obstacle(gap, vo, 'carro', Math.abs(dh));
          continue;
        }
        // cone pelo rumo atual do carro (pega quem está entre o carro e a faixa nova numa troca de faixa)
        {
          const fo = ox * fx + oz * fz, lo = ox * fz - oz * fx;
          let dh2 = o.heading - ph.heading; if (dh2 > Math.PI) dh2 -= 2 * Math.PI; else if (dh2 < -Math.PI) dh2 += 2 * Math.PI;
          const ext2 = Math.abs(Math.cos(dh2)) * o.width * 0.5 + Math.abs(Math.sin(dh2)) * o.length * 0.5;
          const al2 = Math.abs(Math.cos(dh2)) * o.length * 0.5 + Math.abs(Math.sin(dh2)) * o.width * 0.5;
          if (fo > 0 && fo < 10 + v * 1.2 && Math.abs(lo) < myW + ext2 + 0.25) obstacle(fo - veh.length * 0.5 - al2, Math.max(0, o.speed * Math.cos(dh2)), 'cone');
        }
        // cruzando (rotatória/cruzamento): previsão de 3,2 s
        const adh = Math.abs(dh);
        if ((adh < 0.35 && !(o.w && o.w.lane.isConnector)) || adh > 2.7 || o.speed < 0.8) continue;
        const ovx = Math.sin(o.heading) * o.speed, ovz = Math.cos(o.heading) * o.speed;
        const vm = Math.max(v, 5);
        for (let t = 0.25; t <= 3.5; t += 0.25) {
          const j = Math.min(P.n - 1, Math.round((vm * t) / PATH_DS));
          // previsão pela FAIXA do outro (curva de balão) enquanto couber nela; senão em linha reta
          let ox2 = o.x + ovx * t, oz2 = o.z + ovz * t;
          if (o.w && o.w.s + o.speed * t < o.w.lane.length) { net.sampleLane(o.w.lane, o.w.s + o.speed * t, tmpO); ox2 = tmpO.x; oz2 = tmpO.z; }
          const qx = ox2 - P.x[j], qz = oz2 - P.z[j];
          if (qx * qx + qz * qz < (myW + ext + 1.6) ** 2) { obstacle(j * PATH_DS - veh.length * 0.5 - 3.5, 0, 'cruza'); break; }
        }
      }
      const peds = ctx.modules.traffic.pedestrians;
      for (let i = 0; i < peds.length; i++) {
        const o = peds[i];
        if (o.state === 'gone') continue;
        const ox = o.x - ph.x, oz = o.z - ph.z;
        if (ox * ox + oz * oz > 50 * 50 || ox * fx + oz * fz < 0) continue;
        // posição atual e prevista (quem atravessa anda ~1,3 m/s): para antes de cruzar o caminho dele
        const mv = o.state === 'crossing' || o.state === 'walking' ? 1 : 0;
        const ps = (o.speed || 1.3) * (o.hurry ? 1.6 : 1);
        let hit = false;
        for (let q = 0; q <= 2 && !hit; q++) {
          const px = o.x + Math.sin(o.heading) * ps * 1.2 * q * mv, pz = o.z + Math.cos(o.heading) * ps * 1.2 * q * mv;
          for (let j = 0; j < Math.min(P.n, 20); j++) {
            const ex = px - P.x[j], ez = pz - P.z[j];
            if (ex * ex + ez * ez < (myW + 1.3) ** 2) { obstacle(j * PATH_DS - veh.length * 0.5 - 2.5, 0, 'pedestre'); legit = true; hit = true; break; }
          }
        }
      }
      // --- IDM
      const a = prof.a, b = prof.b;
      let acc = a * (1 - Math.pow(v / Math.max(1, v0), 4));
      if (obsGap < 1e8) {
        const sStar = prof.s0 + Math.max(0, v * prof.T + v * (v - obsV) / (2 * Math.sqrt(a * b)));
        acc -= a * Math.pow(sStar / Math.max(0.2, obsGap), 2);
      }
      acc = Math.min(acc, aCons < 99 ? aCons * 1.15 : 99);
      this.debug.acc = acc; this.debug.gap = obsGap; this.debug.v0 = v0;
      // impasse com quem está de lado (cone/cruza) parado há > 5 s: avança devagar ignorando esses (como um jogador faria)
      const crossing = this.debug.why === 'cone' || this.debug.why === 'cruza' || (this.debug.why === 'carro' && obsDh > 0.5);
      if (v < 0.4 && crossing && obsV < 0.3 && !legit) this.sideWaitT = (this.sideWaitT || 0) + dt; else this.sideWaitT = 0;
      if (this.sideWaitT > 5) { this.sideWaitT = 0; this.creepT = 1.5; }
      if (this.creepT > 0) {
        this.creepT -= dt;
        let pedNear = false; for (const o of peds) { const ex = o.x - ph.x, ez = o.z - ph.z; if (o.state !== 'gone' && ex * ex + ez * ez < 14 * 14) { pedNear = true; break; } }
        if (!pedNear && this.debug.why !== 'pedestre' && this.debug.why !== 'faixa') acc = Math.max(acc, 0.8);
      }
      // preso (sem motivo): ré curta
      if (v < 0.5 && !legit && obsGap > 8 && acc > 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 6) { this.reverseT = 1.6; this.stuckT = 0; }
      if (this.reverseT > 0) { this.reverseT -= dt; this._steer(-u * 0.5); this._pedals(0, 1); return; }
      // pedais
      let th = 0, br = 0;
      if (acc > 0) th = Math.min(1, (acc + veh.rolling + veh.drag * v * v) / Math.max(0.3, engineAccel(v, veh, ph.spool)));
      else if (acc < -0.15 && v > 0.7) br = Math.min(1, -acc / veh.brakeDecel);
      if (v <= 0.7 && acc < 0) { th = 0; br = 0; }
      this._steer(u);
      this._pedals(th, br);
      // --- ações (humor) como um jogador faria
      const md = st.mood, davi = md.driver.who === 'davi' ? md.driver : md.passenger;
      const A = st.actions;
      const blocked = obsGap < 25 && obsV < v0 * 0.7 && !legit;
      this.blockedT = blocked ? this.blockedT + dt : 0;
      if (A) {
        if (davi && davi.anxiety > prof.breatheAt && A.breathe.cooldown <= 0) this._tap('breathe');
        if (prof.flashBlocked && this.blockedT > prof.flashBlocked && A.flash.cooldown <= 0) this._tap('flash');
        if (prof.hornBlocked && this.blockedT > prof.hornBlocked && A.horn.cooldown <= 0) this._tap('horn');
        if (this.profile === 'apressado' && davi && davi.stress > 85 && A.curse.cooldown <= 0) this._tap('curse');
      }
      this._tapRelease();
    },

    /** Velocidade do primeiro veículo à frente na faixa (até `fwd` m), ou -1 se livre. */
    _laneLeadSpeed(laneId, s, fwd) {
      const vs = ctx.modules.traffic.vehicles; let best = 1e9, sp = -1;
      for (let i = 0; i < vs.length; i++) { const v = vs[i]; if (v.laneId !== laneId || !v.w) continue; const d = v.w.s - s; if (d > 0 && d < fwd && d < best) { best = d; sp = v.speed; } }
      return sp;
    },
    _chooseLane(T, cur) {
      const prof = this.prof, R = this.route;
      let D = net.lanes[R[this.ri]];
      if (!D || D.isConnector || D.segId !== T.segId || D.dir !== T.dir) return;
      const sib = net.siblingLanes(T), left = T.length - this.s;
      const nextR = this.ri + 1 < R.length ? net.lanes[R[this.ri + 1]] : null;
      const busTurn = nextR && nextR.isConnector && nextR.turn === 'right' && D.next.indexOf(nextR.id) >= 0;
      if (D.kind === 'bus' && !prof.busLane && (left > 75 || !busTurn)) { // a rota passa pela exclusiva: usa a normal ao lado (só entra nela para a conversão à direita)
        let best = null; for (const id of sib) { const L = net.lanes[id]; if (L.kind !== 'bus' && (!best || Math.abs(L.index - D.index) < Math.abs(best.index - D.index))) best = L; }
        if (best) D = best;
      }
      this.needLC = false;
      const vNow = Math.max(0, st.player.speed), prep = Math.max(120, vNow * 9);
      if (this.t - this.lastLC < 3.5) { this.needLC = T.id !== D.id && left < prep; return; }
      const ld = ctx.modules.traffic.leadInfo();
      const v = Math.max(0, st.player.speed);
      const want = Math.max(15, T.limitKmh * prof.speedMul) / 3.6;
      const slowLead = ld && ld.gap < prof.overtakeFree && ld.speed < want * prof.overtake;
      // ultrapassagem: faixa vizinha livre
      if (slowLead && left > 110) {
        for (const id of sib) {
          const L = net.lanes[id];
          if (id === T.id || Math.abs(L.index - T.index) !== 1) continue;
          if (L.kind === 'bus' && !prof.busLane) continue;
          // só vale a pena se a faixa do lado anda mais rápido que o lento da frente
          const lsp = this._laneLeadSpeed(id, this.s, 70);
          if (lsp >= 0 && lsp < ld.speed + 2.5) continue;
          if (this._laneFree(id, this.s, 10, prof.overtakeFree + 20)) { this.track = id; this.lastLC = this.t; return; }
        }
      }
      if (T.id !== D.id) {
        // volta para a faixa da rota (de 1 em 1 faixa)
        const step = D.index > T.index ? 1 : -1;
        let nid = -1; for (const id of sib) if (net.lanes[id].index === T.index + step) nid = id;
        if (nid < 0) return;
        const urgent = left < Math.max(70, vNow * 5.5) || (T.kind === 'bus' && !prof.busLane && D.kind !== 'bus');
        const onBus = T.kind === 'bus' && !prof.busLane && D.kind !== 'bus';
        const stay = slowLead === false && !onBus && !urgent && T.kind !== 'bus' && this.profile === 'apressado' && left > 200;
        if (stay) return;
        if (this._laneFree(nid, this.s, urgent ? 4 : 9, urgent ? 10 : 22) || left < 25) { this.track = nid; this.lastLC = this.t; }
        else if (left < prep) this.needLC = true; // tira o pé para achar a brecha
      }
    },

    _steer(u) {
      const e = this.e; e.st += u;
      const o = e.st > 0.5 ? 1 : e.st < -0.5 ? -1 : 0; e.st -= o;
      input.setVirtual('left', o > 0); input.setVirtual('right', o < 0);
    },
    _pedals(th, br) {
      const e = this.e; e.th += th; e.br += br;
      const o1 = e.th >= 0.5 ? 1 : 0; e.th -= o1;
      const o2 = e.br >= 0.5 ? 1 : 0; e.br -= o2;
      input.setVirtual('up', o1 === 1 && o2 === 0); input.setVirtual('down', o2 === 1);
    },
    _tap(a) { input.setVirtual(a, true); (this._taps || (this._taps = [])).push(a); },
    _tapRelease() { if (this._taps && this._taps.length) { const t = this._taps.slice(); this._taps.length = 0; setTimeout0(() => { for (const a of t) input.setVirtual(a, false); }); } },
  };
  // solta as teclas de ação no passo seguinte (sem timer: fila consumida no próximo step)
  const pend = [];
  function setTimeout0(fn) { pend.push(fn); }
  const origStep = bot.step;
  bot.step = function (dt) { while (pend.length) pend.shift()(); return origStep.call(this, dt); };
  return bot;
}
