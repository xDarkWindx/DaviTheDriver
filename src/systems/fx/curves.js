// Funções puras compartilhadas entre fx.js e audio.js (sem DOM, sem WebAudio).
import { clamp } from '../../core/math.js';

/** Batimentos por minuto do Davi conforme a ansiedade (0..100). */
export function heartBpm(anxiety) { return 58 + clamp(anxiety, 0, 100) * 1.15; }

/** Envelope "lub-dub" (0..1) para fase 0..1 de um batimento. */
export function beatEnv(ph) {
  const a = Math.exp(-Math.pow((ph - 0.04) / 0.045, 2));
  const b = Math.exp(-Math.pow((ph - 0.27) / 0.05, 2)) * 0.65;
  return Math.min(1, a + b);
}

export function smooth01(x, a, b) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

const DEFAULT_SETTINGS = { volume: 0.7, muted: false, retro: true, quality: 'leve' };
/** state.settings pode não existir (a UI cria): devolve sempre um objeto válido. */
export function getSettings(state) { return state.settings || DEFAULT_SETTINGS; }

/**
 * Quem é o Davi na viagem atual e com que peso seu humor aparece na tela/áudio.
 * Davi ao volante (davi/perigo) = peso 1; Davi de carona = peso 0.5 (o jogador dirige o dono, calmo).
 */
export function daviMood(state, out) {
  const d = state.mood.driver, p = state.mood.passenger;
  if (d.who === 'davi') { out.bars = d; out.weight = 1; }
  else if (p.active && p.who === 'davi') { out.bars = p; out.weight = 0.5; }
  else { out.bars = d; out.weight = 0; }
  return out;
}

/** Passageiro apavorado (dono no modo perigo) ou null. */
export function panicBars(state) {
  const p = state.mood.passenger;
  return p.active && p.who === 'dono' ? p : null;
}
