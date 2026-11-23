// Menu principal: título, foto do Davi (placeholder), modo, rota, recordes e iniciar.
import { el, fmtTime, fmtInt } from './dom.js';
import { drawTitle, drawDaviHelmet, drawCar, drawSkyline } from './pixel.js';
import { MODE_UI, ROUTE_UI } from './texts.js';
import { getRecord, saveSelection } from './storage.js';

const PHOTO_URL = 'assets/davi.png';

export class Menu {
  /** h = { start(routeId, mode), howto(), options() } */
  constructor(layer, ctx, sel, h) {
    this.ctx = ctx; this.sel = sel; this.h = h;
    const root = this.root = el('div', 'screen menu', layer);
    root.dataset.testid = 'menu';
    drawSkyline(el('canvas', 'skyline', root));
    const cab = el('div', 'cab', root);

    // cabeçalho
    const head = el('header', 'menu-head', cab);
    const title = el('canvas', 'title', head); title.setAttribute('aria-label', 'Davi, the Driver'); title.setAttribute('role', 'img');
    drawTitle(title);
    const hr = el('div', 'head-right', head);
    el('p', 'slogan', hr, 'De casa ao trabalho (ou vice-versa) pelo trânsito de Brasília. Sem bater, sem multa, no menor tempo.');
    const hb = el('div', 'head-btns', hr);
    const b1 = el('button', 'btn', hb, 'COMO JOGAR'); b1.dataset.testid = 'btn-howto'; b1.onclick = () => h.howto();
    const b2 = el('button', 'btn', hb, 'OPÇÕES'); b2.dataset.testid = 'btn-options'; b2.onclick = () => h.options();
    // seletor de gráficos (LOW = perfil 'leve'; HD = placa dedicada). A troca recarrega o jogo preservando as escolhas.
    const st = ctx.state, sup = st.hdSupport, hdOk = !sup || sup.ok;
    const gfx = el('div', 'gfx', hb); gfx.setAttribute('role', 'group'); gfx.setAttribute('aria-label', 'Gráficos');
    el('span', 'gfx-lab', gfx, 'GRÁFICOS');
    const seg = el('div', 'seg', gfx);
    this.gfxLow = el('button', 'seg-btn', seg, 'LOW'); this.gfxLow.dataset.testid = 'gfx-low'; this.gfxLow.type = 'button';
    this.gfxLow.title = 'LOW: leve, para gráficos integrados';
    this.gfxHd = el('button', 'seg-btn', seg, 'HD'); this.gfxHd.dataset.testid = 'gfx-hd'; this.gfxHd.type = 'button';
    this.gfxHd.title = hdOk ? 'HD: sombras, reflexos e pós-processamento — para placa de vídeo dedicada' : 'HD indisponível: ' + (sup.reason || 'sem WebGL2');
    this.gfxHd.disabled = !hdOk;
    if (!hdOk) { const w = el('small', 'gfx-why', hr, 'HD indisponível: ' + (sup.reason || 'sem WebGL2')); w.dataset.testid = 'gfx-why'; }
    this.gfxLow.onclick = () => h.quality && h.quality('leve');
    this.gfxHd.onclick = () => { if (hdOk && h.quality) h.quality('hd'); };

    const main = el('div', 'menu-main', cab);

    // lateral: foto + recordes
    const side = el('aside', 'side', main);
    const fig = el('figure', 'photo', side);
    el('i', 'tape', fig);
    const frame = el('div', 'photo-frame', fig);
    this.avatar = el('canvas', 'avatar', frame); drawDaviHelmet(this.avatar);
    this.img = el('img', 'photo-img', frame); this.img.alt = 'Davi de capacete'; this.img.hidden = true;
    this.cap = el('figcaption', '', fig, 'FOTO DO DAVI DE CAPACETE (em breve)');
    this.cap.dataset.testid = 'photo-caption';
    // se existir assets/davi.png, substitui o avatar (funciona em file://; se não existir, nada acontece)
    const probe = new Image();
    probe.onload = () => {
      this.img.src = PHOTO_URL; this.img.hidden = false; this.avatar.hidden = true; frame.classList.add('real');
      this.cap.textContent = 'DAVI, DE CAPACETE';
    };
    // Em automação (navigator.webdriver) não sondamos: um 404 em file:// vira erro de console e quebraria o smoke.
    // Use ?foto=1 para forçar a sondagem mesmo assim.
    if (!navigator.webdriver || /[?&]foto=1\b/.test(location.search)) probe.src = PHOTO_URL;

    const rec = el('div', 'records', side); rec.dataset.testid = 'records';
    el('h3', '', rec, 'RECORDES');
    this.recWhere = el('div', 'rec-where', rec);
    const r1 = el('div', 'rec-row', rec); el('span', '', r1, 'Melhor pontuação'); this.recPts = el('b', '', r1);
    const r2 = el('div', 'rec-row', rec); el('span', '', r2, 'Melhor tempo'); this.recTime = el('b', '', r2);
    this.recRuns = el('div', 'rec-runs', rec);

    // escolha
    const pick = el('section', 'pick', main);
    el('h3', '', pick, '1 · ESCOLHA O MODO');
    const cards = el('div', 'cards', pick);
    this.modeBtns = {};
    for (const id of ['davi', 'carona', 'perigo']) {
      const u = MODE_UI[id];
      const b = el('button', 'card', cards); b.dataset.mode = id; b.dataset.testid = 'mode-' + id; b.type = 'button';
      const top = el('div', 'card-top', b);
      drawCar(el('canvas', 'car', top), id === 'davi' ? 'kwid' : 'cactus');
      const lv = el('span', 'lvl', top); for (let i = 1; i <= 3; i++) el('i', i <= u.level ? 'on' : '', lv);
      el('b', 'card-name', b, u.name);
      el('span', 'card-car', b, u.car);
      el('em', 'card-tag', b, u.tag);
      el('p', 'card-desc', b, u.desc);
      b.onclick = () => this.select({ mode: id });
      this.modeBtns[id] = b;
    }
    el('h3', '', pick, '2 · ESCOLHA A ROTA');
    const routes = el('div', 'routes', pick);
    this.routeBtns = {};
    for (const id of ['casa-stj', 'stj-casa']) {
      const u = ROUTE_UI[id];
      const b = el('button', 'route', routes); b.dataset.route = id; b.dataset.testid = 'route-' + id; b.type = 'button';
      const t = el('b', '', b, u.name); el('small', 'route-when', t, u.when);
      el('span', '', b, u.sub);
      b.onclick = () => this.select({ route: id });
      this.routeBtns[id] = b;
    }
    const go = el('button', 'btn go start', pick, 'INICIAR VIAGEM'); go.id = 'ui-start'; go.dataset.testid = 'start';
    go.onclick = () => h.start(this.sel.route, this.sel.mode);
    this.go = go;
    this.refresh();
  }

  select(patch) { Object.assign(this.sel, patch); saveSelection(this.sel); this.refresh(); }

  refresh() {
    if (this.gfxLow) {
      const q = this.ctx.state.settings.quality, run = this.ctx.state.quality;
      for (const [b, id] of [[this.gfxLow, 'leve'], [this.gfxHd, 'hd']]) {
        b.classList.toggle('sel', run === id); b.setAttribute('aria-pressed', run === id); // perfil em uso
        b.classList.toggle('pending', q === id && run !== id); // escolhido, aplica ao recarregar (pisca)
      }
    }
    for (const k in this.modeBtns) { const on = k === this.sel.mode; this.modeBtns[k].classList.toggle('sel', on); this.modeBtns[k].setAttribute('aria-pressed', on); }
    for (const k in this.routeBtns) { const on = k === this.sel.route; this.routeBtns[k].classList.toggle('sel', on); this.routeBtns[k].setAttribute('aria-pressed', on); }
    const r = getRecord(this.sel.mode, this.sel.route);
    this.recWhere.textContent = `${MODE_UI[this.sel.mode].name} · ${ROUTE_UI[this.sel.route].name}`;
    this.recPts.textContent = r.points == null ? '—' : fmtInt(r.points);
    this.recTime.textContent = r.time == null ? '—' : fmtTime(r.time);
    this.recRuns.textContent = r.runs ? `${r.runs} chegada${r.runs === 1 ? '' : 's'} sem bater` : 'Ninguém chegou ainda. Seja o primeiro.';
  }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; if (v) this.refresh(); }
}
