// Janelas modais: "Como jogar" e "Opções". Usadas no menu e na pausa.
import { el } from './dom.js';
import { HOWTO_CONTROLS, HOWTO_RULES } from './texts.js';

export class Modal {
  constructor(layer, id, title) {
    this.root = el('div', 'modal', layer);
    this.root.dataset.testid = 'modal-' + id;
    this.card = el('div', 'modal-card', this.root);
    const head = el('div', 'modal-head', this.card);
    el('h2', '', head, title);
    this.closeBtn = el('button', 'btn small', head, 'FECHAR'); this.closeBtn.dataset.testid = 'close-' + id;
    this.body = el('div', 'modal-body', this.card);
    this.closeBtn.onclick = () => this.close();
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.isOpen = false; this.onClose = null;
  }
  open() { this.isOpen = true; this.root.classList.add('open'); this.closeBtn.focus({ preventScroll: true }); }
  close() { if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('open'); if (this.onClose) this.onClose(); }
}

export function buildHowTo(layer) {
  const m = new Modal(layer, 'howto', 'COMO JOGAR');
  const grid = el('div', 'howto', m.body);
  const c = el('div', 'howto-keys', grid);
  el('h3', '', c, 'CONTROLES');
  for (const [k, v] of HOWTO_CONTROLS) {
    const r = el('div', 'key-row', c);
    const keys = el('span', 'keys', r);
    for (const part of k.split('  ')) { if (part.trim() === '/') el('i', 'key-or', keys, 'ou'); else el('kbd', '', keys, part.trim()); }
    el('span', 'key-what', r, v);
  }
  const r = el('div', 'howto-rules', grid);
  el('h3', '', r, 'REGRAS DO JOGO');
  for (const [k, v] of HOWTO_RULES) {
    const p = el('div', 'rule', r);
    el('b', '', p, k); el('span', '', p, v);
  }
  return m;
}

/** `apply(key, value)` grava em state.settings, persiste e emite. */
export function buildOptions(layer, settings, apply, state = null) {
  const m = new Modal(layer, 'options', 'OPÇÕES');
  const body = el('div', 'opts', m.body);

  const rowVol = el('div', 'opt', body);
  el('label', '', rowVol, 'Volume geral').htmlFor = 'opt-volume';
  const vol = el('input', '', rowVol); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.step = 1; vol.id = 'opt-volume'; vol.dataset.testid = 'opt-volume';
  const volOut = el('output', 'opt-out', rowVol);

  const rowMute = el('div', 'opt', body);
  el('span', 'opt-lab', rowMute, 'Mudo');
  const mute = switchBtn(rowMute, 'opt-mute');

  const rowRetro = el('div', 'opt', body);
  const labR = el('span', 'opt-lab', rowRetro, 'Filtro retrô');
  el('small', 'opt-hint', labR, 'granulado, vinheta e cores de fita antiga');
  const retro = switchBtn(rowRetro, 'opt-retro');

  const rowP = el('div', 'opt', body);
  const labP = el('span', 'opt-lab', rowP, 'Palavrões');
  el('small', 'opt-hint', labP, 'xingamento de trânsito nas falas (nada contra ninguém)');
  const prof = switchBtn(rowP, 'opt-profanity');

  const rowQ = el('div', 'opt', body);
  const labQ = el('span', 'opt-lab', rowQ, 'Qualidade gráfica');
  const sup = state && state.hdSupport;
  const hdOk = !sup || sup.ok;
  const qHint = el('small', 'opt-hint', labQ, hdOk ? 'HD é para placa de vídeo dedicada; a troca recarrega o jogo'
    : 'HD indisponível aqui: ' + (sup.reason || 'sem WebGL2'));
  qHint.dataset.testid = 'opt-q-hint';
  const seg = el('div', 'seg', rowQ);
  const leve = el('button', 'seg-btn', seg, 'LEVE'); leve.dataset.testid = 'opt-q-leve';
  const hd = el('button', 'seg-btn', seg, 'HD'); hd.dataset.testid = 'opt-q-hd';
  hd.title = hdOk ? 'Sombras, reflexos e pós-processamento: para placa de vídeo dedicada' : 'Indisponível: ' + (sup.reason || 'sem WebGL2');
  hd.disabled = !hdOk;
  // degrau atual do ajuste automático (state.qualityAuto): 0 completo … 3 cenário reduzido
  const rowA = el('div', 'opt', body);
  const labA = el('span', 'opt-lab', rowA, 'Ajuste automático');
  el('small', 'opt-hint', labA, state && state.quality === 'hd' ? 'no HD: tira o pós, reduz sombra e resolução e, no limite, volta para o Leve'
    : 'o jogo reduz sombra, resolução e cenário sozinho se o FPS cair');
  const autoTxt = el('span', 'opt-auto', rowA, '—'); autoTxt.dataset.testid = 'opt-auto';

  vol.addEventListener('input', () => { apply('volume', vol.value / 100); sync(); });
  mute.onclick = () => { apply('muted', !settings.muted); sync(); };
  retro.onclick = () => { apply('retro', !settings.retro); sync(); };
  prof.onclick = () => { apply('profanity', !settings.profanity); sync(); };
  leve.onclick = () => { apply('quality', 'leve'); sync(); };
  hd.onclick = () => { if (hdOk) { apply('quality', 'hd'); sync(); } };

  function sync() {
    vol.value = Math.round(settings.volume * 100);
    volOut.textContent = Math.round(settings.volume * 100) + '%';
    vol.style.setProperty('--fill', vol.value + '%');
    setSwitch(mute, settings.muted); setSwitch(retro, settings.retro); setSwitch(prof, settings.profanity !== false);
    leve.classList.toggle('sel', settings.quality === 'leve');
    hd.classList.toggle('sel', settings.quality === 'hd');
    if (hdOk && state && state.quality) {
      qHint.textContent = settings.quality !== state.quality
        ? (state.mode === 'MENU' ? 'recarregando com o novo perfil…' : `muda para ${settings.quality === 'hd' ? 'HD' : 'Leve'} ao voltar ao menu`)
        : 'HD é para placa de vídeo dedicada; a troca recarrega o jogo';
    }
    const qa = state && state.qualityAuto;
    autoTxt.textContent = qa ? `degrau ${qa.step} de ${qa.max ?? 3} · ${qa.label}${qa.fps ? ` · ${Math.round(qa.fps)} FPS` : ''}` : '—';
  }
  m.sync = sync; sync();
  return m;
}

function switchBtn(parent, testid) {
  const b = el('button', 'switch', parent); b.setAttribute('role', 'switch'); b.dataset.testid = testid;
  el('i', 'knob', b); el('span', 'sw-txt', b);
  return b;
}
function setSwitch(b, on) {
  b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', !!on);
  b.lastChild.textContent = on ? 'LIGADO' : 'DESLIGADO';
}
