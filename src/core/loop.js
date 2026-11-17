// Laço principal: simulação em passo FIXO (CONFIG.simHz) + render desacoplado com interpolação (alpha).
export function startLoop({ step, frame, hz = 60, maxSubSteps = 5 }) {
  const h = 1 / hz;
  let acc = 0, last = performance.now(), running = true, raf = 0;
  function tick(now) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;       // aba em segundo plano / travadas
    if (dt < 0) dt = 0;
    acc += dt;
    let n = 0;
    while (acc >= h && n < maxSubSteps) { step(h); acc -= h; n++; }
    if (n === maxSubSteps) acc = 0; // descarta atraso acumulado
    frame(dt, acc / h);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return { stop() { running = false; cancelAnimationFrame(raf); }, dt: h };
}
