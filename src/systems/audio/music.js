// Loop chiptune original em lá menor (clima de choro/baião acelerado). 8 compassos x 16 semicolcheias.
// Escalonamento com antecedência (setInterval + currentTime); o andamento sobe com a ansiedade.
// Notação da melodia: nota (a4, g#4), '.' = prolonga a nota anterior, 'r' = pausa.

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function midi(tok) {
  const m = /^([a-g])(#?)(\d)$/.exec(tok); if (!m) return -1;
  return 12 * (parseInt(m[3], 10) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MELODY = [
  'a4 . c5 e5 a5 . e5 c5 b4 c5 b4 a4 e4 . a4 .',
  'g#4 . b4 . e5 d5 b4 g#4 b4 . g#4 e4 g#4 . b4 .',
  'c5 . e5 . a5 g5 e5 c5 e5 d5 c5 b4 a4 . . .',
  'd5 . f5 a5 . f5 d5 . f5 e5 d5 c5 a4 . d5 .',
  'e5 . g#4 b4 . d5 b4 g#4 e4 . g#4 b4 e5 . d5 b4',
  'a4 c5 e5 a5 g5 e5 c5 e5 a5 . g5 . e5 c5 a4 .',
  'd5 f5 a5 f5 d5 . . . b4 d5 e5 d5 b4 g#4 e4 .',
  'a4 . e5 . c5 . a4 . e4 . a4 . r r r r',
].map((bar) => bar.split(' ').map((t) => (t === '.' ? -2 : t === 'r' ? -1 : midi(t))));

const AM = [57, 60, 64], E7 = [56, 59, 64], DM = [57, 62, 65];
// acorde por meio compasso (2 por compasso) e baixo (raiz, quinta)
const CH = [[AM, AM], [E7, E7], [AM, AM], [DM, DM], [E7, E7], [AM, AM], [DM, E7], [AM, AM]];
const ROOT = { 57: [45, 52], 56: [40, 47], 50: [38, 45] };
function bassFor(chord) { return chord === AM ? ROOT[57] : chord === E7 ? ROOT[56] : ROOT[50]; }

export class Music {
  constructor(synth, dest) {
    this.s = synth; this.ac = synth.ac;
    this.bus = this.ac.createGain(); this.bus.gain.value = 0;
    this.lp = this.ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 5200;
    this.bus.connect(this.lp); this.lp.connect(dest);
    this.step = 0; this.bar = 0; this.next = 0; this.timer = null; this.bpm = 124; this.level = 0; this.enabled = true;
    this.hatHP = this.ac.createBiquadFilter(); this.hatHP.type = 'highpass'; this.hatHP.frequency.value = 6500;
    this.hatG = this.ac.createGain(); this.hatG.gain.value = 1; this.hatHP.connect(this.hatG); this.hatG.connect(this.bus);
  }

  start() {
    if (this.timer) return;
    this.next = this.ac.currentTime + 0.12;
    this.timer = setInterval(() => this._tick(), 45);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** level 0..1 alvo do volume da música; anxiety 0..100 define o andamento. */
  setTarget(level, anxiety) {
    this.level = level;
    this.bus.gain.setTargetAtTime(level, this.ac.currentTime, 0.35);
    this.bpm = 122 + 24 * Math.min(1, Math.max(0, (anxiety - 20) / 80));
  }

  _tick() {
    const ac = this.ac;
    if (ac.state !== 'running') { this.next = ac.currentTime + 0.1; return; }
    const horizon = ac.currentTime + 0.22;
    if (this.next < ac.currentTime - 0.3) this.next = ac.currentTime + 0.05;
    while (this.next < horizon) {
      const sd = 60 / this.bpm / 4;
      if (this.level > 0.004) this._step(this.step, this.bar, this.next, sd);
      this.next += sd;
      if (++this.step >= 16) { this.step = 0; this.bar = (this.bar + 1) % 8; }
    }
  }

  _step(st, bar, t, sd) {
    const s = this.s, bus = this.bus, mel = MELODY[bar];
    // melodia: pulso 25%
    const n = mel[st];
    if (n >= 0) {
      let len = 1; while (st + len < 16 && mel[st + len] === -2) len++;
      const dur = Math.max(0.07, len * sd * 0.92);
      s.tone('pulse25', hz(n), hz(n), t, dur, 0.085, bus, { attack: 0.004, filter: 'lowpass', ff: 3600, prio: 0 });
      if (len >= 3) s.tone('pulse25', hz(n) * 1.004, hz(n) * 1.004, t + sd * 1.6, dur - sd * 1.6, 0.03, bus, { attack: 0.02, prio: 0 }); // vibrato-ish
    }
    // baixo (baião): passos 0, 6, 8, 14
    const ch = CH[bar][st < 8 ? 0 : 1], bs = bassFor(ch);
    if (st === 0 || st === 8) s.tone('triangle', hz(bs[0]), hz(bs[0]), t, sd * 5, 0.17, bus, { attack: 0.006, prio: 0 });
    else if (st === 6 || st === 14) s.tone('triangle', hz(bs[1]), hz(bs[1]), t, sd * 1.9, 0.14, bus, { attack: 0.006, prio: 0 });
    // sanfona (acordes curtos) nos contratempos
    if (st === 3 || st === 11 || st === 7 && bar % 2 === 1) {
      for (let k = 0; k < ch.length; k++) s.tone('pulse12', hz(ch[k]), hz(ch[k]), t, sd * 1.5, 0.028, bus, { attack: 0.005, filter: 'lowpass', ff: 2600, prio: 0 });
    }
    // zabumba / surdo
    if (st === 0 || st === 8) s.tone('sine', 130, 48, t, 0.16, 0.34, bus, { attack: 0.002, prio: 0 });
    else if (st === 6 || st === 14) s.tone('sine', 100, 55, t, 0.1, 0.17, bus, { attack: 0.002, prio: 0 });
    // triângulo / chimbau
    if (st % 2 === 0 || st % 4 === 3) {
      const acc = st % 4 === 2 ? 0.07 : 0.035;
      s.burst(t, 0.035, acc, this.hatHP, { filter: 'highpass', f0: 7000, prio: 0 });
    }
    if (st === 4 || st === 12) s.burst(t, 0.09, 0.11, bus, { filter: 'bandpass', f0: 1800, q: 0.9, prio: 0 }); // caixa leve
  }
}
