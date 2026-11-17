// Telas de fim de viagem: chegou / bateu (boletim de ocorrência) / desistiu / tomouOCarro.
import { el, fmtTime, fmtInt, fmtMoney, pick } from './dom.js';
import { drawFace } from './pixel.js';
import {
  GRADE_TITLES, GRADE_QUIPS, REASON_UI, CRASH_WITH, CRASH_WITH_DEFAULT, CRASH_EXCUSE, REPAIR_ITEMS, BO_WITNESSES, MODE_UI, ROUTE_UI,
} from './texts.js';

const GRADE_COLOR = { A: '#3fd37a', B: '#a6e03a', C: '#ffd23a', D: '#ff9a2a', E: '#f0553a', F: '#d6252f' };

/** Junta o que o sistema de regras mandou (state.result) com o que existe em state/eventos. */
export function buildEndModel(ctx, f, lastCol, rec) {
  const st = ctx.state, tr = st.trip;
  const res = st.result && st.result.reason === f.reason ? st.result : null;
  const fines = res && Array.isArray(res.fines) ? res.fines : st.fines || [];
  let fineTotal = 0, cnh = 0;
  for (const x of fines) { fineTotal += +x.amount || 0; cnh += +x.points || 0; }
  if (!res && st.fineTotal) fineTotal = st.fineTotal;
  const det = f.details && (f.details.kind || f.details.b) ? f.details : lastCol;
  const kind = det && det.kind ? det.kind : det && det.b ? det.b : null;
  const impact = det && det.impactKmh ? det.impactKmh : 30;
  let crash = null;
  if (f.reason === 'bateu') {
    const c = (res && res.crash) || {};
    const seed = Math.round((det ? (det.x || 0) * 7 + (det.z || 0) * 3 : 0) + impact);
    const withWhat = c.withWhat || CRASH_WITH[kind] || CRASH_WITH_DEFAULT;
    const excuseList = CRASH_EXCUSE[kind] || CRASH_EXCUSE._;
    const excuse = c.excuse || pick(excuseList, seed);
    let repair = typeof c.repairCost === 'number' ? c.repairCost : null;
    if (repair == null && tr.mode === 'perigo') repair = Math.round((3200 + impact * 610) / 10) * 10;
    const sn = c.sinistroNo != null ? c.sinistroNo : drawSinistro();
    crash = { sinistroNo: sn, withWhat, excuse, repairCost: repair, impact, witness: pick(BO_WITNESSES, seed + 1), kind };
  }
  const grade = res && res.grade ? String(res.grade).toUpperCase().slice(0, 1) : fallbackGrade(fines.length);
  return {
    reason: f.reason, mode: tr.mode, routeId: tr.routeId, label: tr.label,
    time: res && typeof res.time === 'number' ? res.time : f.time != null ? f.time : tr.elapsed,
    points: res && typeof res.points === 'number' ? res.points : st.score ? st.score.points : 0,
    grade, title: (res && res.title) || GRADE_TITLES[grade] || '',
    fines, fineTotal, cnh,
    crash, yearsLost: res && typeof res.yearsLost === 'number' ? res.yearsLost : null,
    sinistroNo: crash ? crash.sinistroNo : null, rec, roadName: st.player.roadName || 'via não identificada',
    seed: Math.round((tr.elapsed || 0) * 10),
  };
}

let sinNo = 2 + Math.floor(Math.random() * 98);
/** Sorteia o número do sinistro (2..99); chamado a cada início de viagem. */
export function rollSinistro() { sinNo = 2 + Math.floor(Math.random() * 98); }
function drawSinistro() { return sinNo; }

function fallbackGrade(n) { return n === 0 ? 'A' : n === 1 ? 'B' : n === 2 ? 'C' : n === 3 ? 'D' : n === 4 ? 'E' : 'F'; }

export function renderEnd(root, m, handlers) {
  root.textContent = '';
  const card = el('div', 'end-card end-' + m.reason, root);
  card.dataset.testid = 'end-' + m.reason;
  if (m.reason === 'chegou') renderArrived(card, m);
  else if (m.reason === 'bateu') renderCrash(card, m);
  else renderOther(card, m);
  const row = el('div', 'end-actions', card);
  const again = el('button', 'btn go', row, 'DE NOVO'); again.id = 'ui-again'; again.dataset.testid = 'again'; again.onclick = handlers.again;
  const menu = el('button', 'btn', row, 'MENU'); menu.dataset.testid = 'to-menu'; menu.onclick = handlers.menu;
  return again;
}

function statRow(parent, k, v, cls) {
  const r = el('div', 'stat ' + (cls || ''), parent);
  el('span', 'stat-k', r, k); const val = el('span', 'stat-v', r, v);
  return val;
}

function finesBlock(parent, m) {
  const box = el('div', 'fines-box', parent);
  const head = el('div', 'fines-head', box);
  el('b', '', head, m.fines.length ? `MULTAS (${m.fines.length})` : 'MULTAS');
  el('span', '', head, m.fines.length ? fmtMoney(m.fineTotal) : 'nenhuma. Quem diria.');
  if (m.fines.length) {
    const list = el('div', 'fines-list', box);
    for (const f of m.fines) {
      const r = el('div', 'fine-line', list);
      el('span', 'fine-name', r, f.label || f.code || 'Infração');
      el('span', 'fine-val', r, `${fmtMoney(f.amount)} · ${f.points | 0} pt`);
    }
    el('div', 'fines-cnh', box, `${m.cnh} ponto${m.cnh === 1 ? '' : 's'} na CNH${m.cnh >= 20 ? ' — suspensa. O despachante já ligou.' : ''}`);
  }
}

function modeLine(m) { return `${(ROUTE_UI[m.routeId] || {}).name || ''} · ${(MODE_UI[m.mode] || {}).name || ''}`; }

function renderArrived(card, m) {
  el('div', 'end-kicker', card, modeLine(m));
  const body = el('div', 'arrived', card);
  const left = el('div', 'grade-col', body);
  const g = el('div', 'grade', left, m.grade); g.style.setProperty('--gc', GRADE_COLOR[m.grade] || '#fff'); g.dataset.testid = 'grade';
  el('div', 'grade-title', left, m.title);
  el('div', 'grade-quip', left, GRADE_QUIPS[m.grade] || '');
  const right = el('div', 'stats-col', body);
  el('h2', 'end-head', right, REASON_UI.chegou.head);
  const t = statRow(right, 'TEMPO', fmtTime(m.time));
  const p = statRow(right, 'PONTUAÇÃO', fmtInt(m.points));
  if (m.rec) {
    if (m.rec.newTime) el('em', 'badge', t, m.rec.prev.time == null ? 'PRIMEIRO RECORDE' : 'RECORDE!');
    if (m.rec.newPoints) el('em', 'badge', p, m.rec.prev.points == null ? 'PRIMEIRO RECORDE' : 'RECORDE!');
    if (!m.rec.newTime && m.rec.prev.time != null) el('small', 'stat-prev', t, `melhor: ${fmtTime(m.rec.prev.time)}`);
    if (!m.rec.newPoints && m.rec.prev.points != null) el('small', 'stat-prev', p, `melhor: ${fmtInt(m.rec.prev.points)}`);
  }
  finesBlock(right, m);
  if (m.yearsLost != null) statRow(right, 'ANOS DE VIDA PERDIDOS PELO DONO', m.yearsLost.toFixed(1).replace('.', ','), 'warn');
}

function renderOther(card, m) {
  const ui = REASON_UI[m.reason] || { head: 'FIM DE VIAGEM', sub: 'A viagem terminou. De um jeito ou de outro.' };
  el('div', 'end-kicker', card, modeLine(m));
  const body = el('div', 'other', card);
  const face = el('canvas', 'end-face', body);
  drawFace(face, m.reason === 'tomouOCarro' ? 'dono' : 'davi', m.reason === 'tomouOCarro' ? 'stress' : 'anx');
  const txt = el('div', 'other-txt', body);
  el('h2', 'end-head big', txt, ui.head);
  el('p', 'end-sub', txt, ui.sub);
  statRow(txt, m.reason === 'desistiu' ? 'TEMPO ATÉ DESISTIR' : 'TEMPO DE VIAGEM', fmtTime(m.time));
  if (m.fines.length) finesBlock(txt, m);
  if (m.yearsLost != null) statRow(txt, 'ANOS DE VIDA PERDIDOS PELO DONO', m.yearsLost.toFixed(1).replace('.', ','), 'warn');
}

function renderCrash(card, m) {
  const c = m.crash, carona = m.mode === 'carona', perigo = m.mode === 'perigo';
  const paper = el('div', 'bo-paper', card);
  const top = el('div', 'bo-top', paper);
  el('span', '', top, 'BOLETIM DE OCORRÊNCIA');
  el('span', 'bo-sub', top, 'documento humorístico, sem validade jurídica');
  el('h2', 'bo-title', paper, `SINISTRO Nº ${m.sinistroNo}`);
  el('div', 'bo-lead', paper, 'Ninguém se feriu gravemente. O carro, sim.');
  const cols = el('div', 'bo-cols', paper);
  const a = el('div', 'bo-col', cols);
  const field = (k, v) => { const r = el('div', 'bo-field', a); el('span', 'bo-k', r, k); el('span', 'bo-v', r, v); };
  field('Condutor', carona ? 'Dono do Cactus' : 'Davi');
  field('Veículo', carona || perigo ? 'Citroën C4 Cactus THP cinza' : 'Renault Kwid branco');
  field('Local', m.roadName);
  field('Colidiu com', c.withWhat);
  field('Impacto', `${Math.round(c.impact)} km/h`);
  field('Testemunhas', c.witness);
  field('Tempo de viagem', fmtTime(m.time));
  if (m.fines.length) field('Multas até aqui', `${m.fines.length} · ${fmtMoney(m.fineTotal)}`);
  if (m.yearsLost != null) field('Anos de vida do dono', `-${m.yearsLost.toFixed(1).replace('.', ',')}`);

  const b = el('div', 'bo-col', cols);
  const v = el('div', 'bo-version', b);
  el('div', 'bo-version-h', v, 'CAUSA APURADA');
  el('p', 'bo-quote', v, c.excuse);
  el('div', 'bo-fault', v, 'ACONTECE');
  if (!(perigo || c.repairCost != null)) {
    const d = el('div', 'bo-quote-box', b);
    el('div', 'bo-version-h', d, 'DANOS');
    el('p', 'bo-damage', d, carona
      ? 'Cactus: para-choque e a paciência do dono. Seguro: o dono liga na segunda.'
      : 'Kwid: para-choque e farol. Seguro: a renovar.');
  }
  if (perigo || c.repairCost != null) {
    const q = el('div', 'bo-quote-box', b);
    el('div', 'bo-version-h', q, perigo ? 'ORÇAMENTO DO CONSERTO — C4 CACTUS THP' : 'ORÇAMENTO DO CONSERTO');
    const total = c.repairCost != null ? c.repairCost : 0;
    let used = 0;
    REPAIR_ITEMS.forEach(([name, share], i) => {
      const val = i === REPAIR_ITEMS.length - 1 ? total - used : Math.round(total * share / 10) * 10;
      used += val;
      const r = el('div', 'fine-line', q); el('span', 'fine-name', r, name); el('span', 'fine-val', r, fmtMoney(val));
    });
    const t = el('div', 'bo-total', q); el('b', '', t, 'TOTAL'); el('b', '', t, fmtMoney(total));
    el('div', 'bo-note', q, perigo ? 'Pagamento: à vista, pelo dono do carro.' : '');
  }
}
