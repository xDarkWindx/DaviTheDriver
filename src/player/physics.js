// Física arcade de carro (pura, sem three.js) — usada pelo jogador; reaproveitável/testável.
// Convenções: forward = (sin h, cos h); direita = (-cos h, sin h); virar à esquerda = h aumenta.
import { clamp, smoothNoise } from '../core/math.js';

/** Modificadores externos (humor/efeitos). Valores neutros. Quem escreve: systems/mood.js etc. */
export function defaultMods() {
  return {
    steerNoise: 0,     // amplitude (0..1) de ruído somado ao volante (tremedeira)
    steerGain: 1,      // multiplica o volante (>1 = nervoso, <1 = travado)
    steerDelay: 0,     // s extra de atraso de resposta do volante
    throttleBias: 0,   // somado ao acelerador (-1..1): >0 "pé pesado", <0 hesitação
    accelMul: 1,       // multiplica a força do motor
    brakeMul: 1,       // multiplica a frenagem
    maxSpeedMul: 1,    // multiplica a velocidade final
    gripMul: 1,        // multiplica a aderência lateral
  };
}

export function createVehicleState() {
  return { x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, lateral: 0, steer: 0, yawRate: 0,
    spool: 0, throttleTime: 0, latAccel: 0, longAccel: 0, offroad: false, braking: false, reversing: false };
}

/** Multiplicador da curva de torque (tabela [[km/h, mul], ...], interpolação linear). */
export function torqueAt(kmhV, curve) {
  if (kmhV <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (kmhV <= curve[i][0]) {
      const a = curve[i - 1], b = curve[i];
      return a[1] + (b[1] - a[1]) * ((kmhV - a[0]) / (b[0] - a[0]));
    }
  }
  return curve[curve.length - 1][1];
}

/** Aceleração do motor (m/s²) na velocidade v (m/s) com turbo `spool` (0..1). Ver VEHICLES em config.js. */
export function engineAccel(v, veh, spool, maxSpeedMul = 1) {
  const k = (Math.max(0, v) * 3.6) / maxSpeedMul; // maxSpeedMul estica a curva
  return veh.engineAccel * torqueAt(k, veh.torqueCurve) * (1 + veh.turboBoost * spool);
}

/**
 * Um passo de simulação. inp = { throttle 0..1, brake 0..1, steer -1..1 (+esq), handbrake bool }.
 * env = { offroad: bool, t: tempo (s) p/ ruído }
 */
export function stepVehicle(st, veh, inp, mods, dt, env) {
  const sh = Math.sin(st.heading), ch = Math.cos(st.heading);
  let vf = st.vx * sh + st.vz * ch;           // longitudinal
  let vl = st.vx * -ch + st.vz * sh;          // lateral (direita +)
  const vmax = veh.maxSpeed * mods.maxSpeedMul;
  const throttle = clamp(inp.throttle + mods.throttleBias * (inp.throttle > 0 || mods.throttleBias > 0 ? 1 : 0), 0, 1);
  const brake = inp.brake;
  const speedKmh = Math.abs(vf) * 3.6;

  // --- turbo
  if (throttle > 0.6 && veh.turboBoost > 0) {
    st.throttleTime += dt;
    if (st.throttleTime > veh.turboLag) st.spool = Math.min(1, st.spool + veh.turboSpoolRate * dt);
  } else {
    st.throttleTime = 0;
    st.spool = Math.max(0, st.spool - 3 * dt);
  }

  // --- longitudinal
  let a = 0;
  st.braking = false; st.reversing = false;
  if (throttle > 0) {
    if (vf < -0.5) { a += veh.brakeDecel * throttle * mods.brakeMul; st.braking = true; }
    else if (vf < vmax) a += engineAccel(vf, veh, st.spool, mods.maxSpeedMul) * throttle * mods.accelMul;
  }
  if (brake > 0) {
    if (vf > 0.5) { a -= veh.brakeDecel * brake * mods.brakeMul; st.braking = true; }
    else if (vf > -veh.maxReverse) { a -= veh.engineAccel * 0.55 * brake; st.reversing = true; }
  }
  // resistências (nunca invertem o sentido)
  let res = veh.rolling + veh.drag * vf * vf + (env.offroad ? veh.offroadDrag + 0.04 * Math.abs(vf) : 0);
  if (inp.handbrake) res += veh.handbrakeDecel;
  const vf0 = vf;
  vf += a * dt;
  if (vf > 0) vf = Math.max(0, vf - res * dt);
  else if (vf < 0) vf = Math.min(0, vf + res * dt);
  if (vf0 > 0 && vf < 0 && !(brake > 0 && vf0 <= 0.5)) vf = 0; // freio não vira ré sozinho
  if (vf > vmax) vf = Math.max(vmax, vf - 8 * dt);
  st.longAccel = (vf - vf0) / dt;

  // --- direção
  const noise = mods.steerNoise ? mods.steerNoise * smoothNoise(env.t * 2.3, 1.7) : 0;
  const target = clamp(inp.steer * mods.steerGain + noise, -1, 1);
  const rate = veh.steerRate / (1 + mods.steerDelay * veh.steerRate);
  st.steer += (target - st.steer) * Math.min(1, rate * dt);
  const sp = clamp(Math.abs(vf) / 32, 0, 1);
  const maxSteer = veh.maxSteerLow + (veh.maxSteerHigh - veh.maxSteerLow) * Math.pow(sp, 0.7);
  let yaw = (vf * Math.tan(st.steer * maxSteer)) / veh.wheelbase;
  if (inp.handbrake && Math.abs(vf) > 4) yaw *= 1.55;
  // instabilidade (nervosismo em alta: frenagem forte / curva rápida)
  if (speedKmh > veh.unstableFromKmh && veh.instability > 0) {
    const k = Math.min(1, (speedKmh - veh.unstableFromKmh) / 60);
    const stress = (st.braking && brake > 0.5 ? 1 : 0) + Math.abs(st.steer) * 0.8;
    yaw += veh.instability * k * stress * smoothNoise(env.t * 4.1, 5.3);
  }
  st.yawRate = yaw;

  // recompõe velocidade no referencial antigo, gira, decompõe no novo (gera deriva)
  let vx = sh * vf + -ch * vl, vz = ch * vf + sh * vl;
  st.heading += yaw * dt;
  if (st.heading > Math.PI) st.heading -= Math.PI * 2; else if (st.heading < -Math.PI) st.heading += Math.PI * 2;
  const sh2 = Math.sin(st.heading), ch2 = Math.cos(st.heading);
  vf = vx * sh2 + vz * ch2; vl = vx * -ch2 + vz * sh2;
  let grip = inp.handbrake ? veh.handbrakeGrip : veh.grip;
  if (env.offroad) grip = Math.min(grip, veh.offroadGrip);
  if (speedKmh > veh.unstableFromKmh) grip *= 1 - veh.highSpeedGripLoss * Math.min(1, (speedKmh - veh.unstableFromKmh) / 70);
  grip *= mods.gripMul;
  vl *= Math.exp(-grip * dt);
  vx = sh2 * vf + -ch2 * vl; vz = ch2 * vf + sh2 * vl;
  st.vx = vx; st.vz = vz;
  st.x += vx * dt; st.z += vz * dt;
  st.speed = vf; st.lateral = vl;
  st.latAccel = vf * yaw;
  st.offroad = !!env.offroad;
  return st;
}
