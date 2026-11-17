// Utilitários de síntese Web Audio: 100% procedural, sem arquivos. Conta fontes (osciladores/ruídos) vivas
// e recusa vozes de baixa prioridade quando passa do limite (prio 0 < 1 < 2).

export const LIMITS = [56, 80, 104];   // teto de fontes vivas para prio 0 (blips/hats), 1 (sfx), 2 (batida, jingles)

export class Synth {
  constructor(ac) {
    this.ac = ac;
    this.live = 0;        // fontes (OscillatorNode/AudioBufferSourceNode) iniciadas e ainda não terminadas
    this.persistent = 0;  // subconjunto: fontes contínuas (motor, pneus, drone...)
    this.peak = 0;
    this.dropped = 0;
    const sr = ac.sampleRate, len = Math.floor(sr * 2);
    this.noiseBuf = ac.createBuffer(1, len, sr);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ac.createBuffer(1, len, sr);
    const b = this.brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.pulse25 = this._pulse(0.25); this.pulse12 = this._pulse(0.125);
  }

  _pulse(duty) {
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return this.ac.createPeriodicWave(re, im, { disableNormalization: false });
  }

  canPlay(prio = 1) {
    if (this.live >= LIMITS[prio]) { this.dropped++; return false; }
    return true;
  }

  _track(src, cleanup, persistent) {
    this.live++; if (persistent) this.persistent++;
    if (this.live > this.peak) this.peak = this.live;
    src.onended = () => {
      this.live--; if (persistent) this.persistent--;
      try { src.disconnect(); } catch (e) { /* já desconectado */ }
      if (cleanup) for (const n of cleanup) { try { n.disconnect(); } catch (e) { /* idem */ } }
    };
  }

  /** Oscilador de vida curta: f0 -> f1 (exponencial) em [t0, t0+dur]. Retorna o gain (para automação extra). */
  tone(type, f0, f1, t0, dur, vol, dest, o = {}) {
    if (!this.canPlay(o.prio ?? 1)) return null;
    const ac = this.ac, osc = ac.createOscillator(), g = ac.createGain();
    if (type === 'pulse25') osc.setPeriodicWave(this.pulse25); else if (type === 'pulse12') osc.setPeriodicWave(this.pulse12); else osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const att = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + att);
    if (o.sustain) { g.gain.setValueAtTime(vol, t0 + dur - (o.release ?? 0.05)); }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g; const cleanup = [g];
    osc.connect(g);
    if (o.filter) {
      const f = ac.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.ff || 2000; f.Q.value = o.q || 0.7;
      g.connect(f); node = f; cleanup.push(f);
    }
    if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; cleanup.push(p); }
    node.connect(dest);
    this._track(osc, cleanup, false);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
    return g;
  }

  /** Rajada de ruído filtrado (envelope attack/decay). */
  burst(t0, dur, vol, dest, o = {}) {
    if (!this.canPlay(o.prio ?? 1)) return null;
    const ac = this.ac, src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = o.brown ? this.brownBuf : this.noiseBuf; src.loop = true;
    src.loopStart = 0; src.loopEnd = 2;
    f.type = o.filter || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0 || 1500, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const att = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + att);
    if (o.hold) g.gain.setValueAtTime(vol, t0 + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    let node = g; const cleanup = [f, g];
    if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; cleanup.push(p); }
    node.connect(dest);
    this._track(src, cleanup, false);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.03);
    return g;
  }

  /** Fontes contínuas (retornam o nó; vida = até stop()). */
  loopOsc(type, freq, dest) {
    const osc = this.ac.createOscillator(); osc.type = type; osc.frequency.value = freq; osc.connect(dest);
    this._track(osc, null, true); osc.start(); return osc;
  }
  loopNoise(dest, brown = false) {
    const src = this.ac.createBufferSource(); src.buffer = brown ? this.brownBuf : this.noiseBuf; src.loop = true;
    src.connect(dest); this._track(src, null, true); src.start(0, Math.random() * 1.5); return src;
  }
}
