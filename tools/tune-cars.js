// Mede 0-100, retomada 60-100 e velocidade final de cada veículo (reta, pé no fundo):  node tools/tune-cars.js
import { VEHICLES } from '../src/config.js';
import { stepVehicle, createVehicleState, defaultMods } from '../src/player/physics.js';
const dt = 1 / 60;
for (const v of Object.values(VEHICLES)) {
  const st = createVehicleState(); st.heading = Math.PI / 2;
  const mods = defaultMods(), inp = { throttle: 1, brake: 0, steer: 0, handbrake: false };
  let t = 0, t100 = null, t60 = null, t100b = null;
  while (t < 90) {
    stepVehicle(st, v, inp, mods, dt, { offroad: false, t });
    t += dt;
    const k = st.speed * 3.6;
    if (t60 === null && k >= 60) t60 = t;
    if (t100 === null && k >= 100) t100 = t;
  }
  // retomada 60->100 sem turbo cheio (solta e pisa)
  const st2 = createVehicleState(); st2.heading = Math.PI / 2; st2.vx = 60 / 3.6;
  let t2 = 0; while (st2.speed * 3.6 < 100 && t2 < 60) { stepVehicle(st2, v, inp, mods, dt, { offroad: false, t: t2 }); t2 += dt; }
  // frenagem 100->0
  const st3 = createVehicleState(); st3.heading = Math.PI / 2; st3.vx = 100 / 3.6; st3.speed = 100 / 3.6; let d = 0;
  while (st3.speed > 0.1) { const x0 = st3.x; stepVehicle(st3, v, { throttle: 0, brake: 1, steer: 0, handbrake: false }, mods, dt, { offroad: false, t: 0 }); d += st3.x - x0; }
  console.log(`${v.id.padEnd(7)} 0-60 ${t60.toFixed(1)}s  0-100 ${t100.toFixed(1)}s (alvo ${v.game.zeroTo100})  60-100 ${t2.toFixed(1)}s  final ${(st.speed * 3.6).toFixed(0)} km/h (ficha ${v.real.topKmh})  frenagem 100-0 ${d.toFixed(0)} m`);
}
