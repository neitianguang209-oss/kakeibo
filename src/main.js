// 家計簿アプリの土台: 下のタブ・画面の切りかえ・下から出る窓・同期
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { html, AppCtx, useStore, Toasts } from './ui.js';
import * as S from './store.js';
import { takeKeyFromUrl, getKey, lsGet } from './api.js';
import { onQuotes } from './quotes.js';
import { ensureAuto } from './calc.js';
import { Records } from './records.js';
import { Report } from './report.js';
import { Budget } from './budget.js';
import { Assets, StockDetail, GoalSheet, LotSheet, PlanSheet, PlanBaseSheet, WatchSheet, CashSheet, refreshQuotes } from './assets.js';
import { Settings, Recs, RecSheet, BudgetSheet, CatsSheet, applySkin } from './settings.js';
import { EntrySheet, ImportSheet, ReceiptSheet } from './input.js';
import { vibrate } from './util.js';

takeKeyFromUrl();
applySkin(lsGet('kakeibo:skin') || 'orange');

const route = () => location.hash.replace(/^#\/?/, '') || 'records';

// 下のタブの絵(線画)
const ICONS = {
  input: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  records: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01M8 17h2',
  report: 'M12 3a9 9 0 1 0 9 9h-9V3zM15 3.5A9 9 0 0 1 20.5 9H15V3.5z',
  budget: 'M3 8a2 2 0 0 1 2-2h13v3M3 8v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2M16 14.5h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
const Icon = ({ k }) => html`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICONS[k]} ${k === 'more' ? 'stroke-width="3.2"' : ''} /></svg>`;

function App() {
  useStore();
  const [r, setR] = useState(route());
  const [qv, setQv] = useState(0);
  const [sheet, setSheet] = useState(null); // {kind, arg, preset}
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const f = () => { setR(route()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => onQuotes(setQv), []);

  const toast = useCallback((msg, undo) => {
    const id = Math.random();
    const t = { id, msg, undo: undo ? () => { undo(); setToasts((l) => l.filter((x) => x.id !== id)); } : null };
    setToasts((l) => [...l.slice(-2), t]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), undo ? 5000 : 2600);
  }, []);
  const app = {
    go: (p) => { location.hash = '#/' + p; },
    open: (kind, arg) => setSheet({ kind, arg }),
    edit: (tx, preset) => setSheet({ kind: 'entry', arg: tx, preset }),
    toast,
    qv,
  };
  const close = () => setSheet(null);

  const [page, arg] = r.split('/');
  let body;
  if (page === 'records') body = html`<${Records} />`;
  else if (page === 'report') body = html`<${Report} key=${arg || 'month'} start=${arg} />`;
  else if (page === 'budget') body = html`<${Budget} />`;
  else if (page === 'assets') body = html`<${Assets} qv=${qv} />`;
  else if (page === 'stock') body = html`<${StockDetail} key=${arg} symbol=${decodeURIComponent(arg || '')} qv=${qv} />`;
  else if (page === 'settings') body = html`<${Settings} />`;
  else if (page === 'recs') body = html`<${Recs} />`;
  else body = html`<${Records} />`;
  const tab = ['records', 'report', 'budget', 'settings'].includes(page) ? page : ['stock', 'assets', 'recs'].includes(page) ? 'settings' : 'records';

  const sh = sheet;
  const sheets = {
    entry: () => html`<${EntrySheet} tx=${sh.arg} preset=${sh.preset} onClose=${close} />`,
    receipt: () => html`<${ReceiptSheet} onClose=${close} />`,
    import: () => html`<${ImportSheet} onClose=${close} />`,
    lot: () => html`<${LotSheet} lot=${sh.arg} onClose=${close} />`,
    plan: () => html`<${PlanSheet} plan=${sh.arg} onClose=${close} />`,
    planbase: () => html`<${PlanBaseSheet} plan=${sh.arg} onClose=${close} />`,
    watch: () => html`<${WatchSheet} onClose=${close} />`,
    cash: () => html`<${CashSheet} onClose=${close} />`,
    rec: () => html`<${RecSheet} rec=${sh.arg} onClose=${close} />`,
    goal: () => html`<${GoalSheet} onClose=${close} />`,
    budget: () => html`<${BudgetSheet} onClose=${close} />`,
    cats: () => html`<${CatsSheet} onClose=${close} />`,
  };

  return html`<${AppCtx.Provider} value=${app}>
    <main class="main">${body}</main>
    <nav class="tabbar" aria-label="画面の切りかえ">
      <button class=${sheet?.kind === 'entry' ? 'on' : ''} onClick=${() => { vibrate(10); app.edit(null); }}><${Icon} k="input" /><span>入力</span></button>
      ${[['records', 'カレンダー'], ['report', 'レポート'], ['budget', '予算'], ['settings', 'メニュー']].map(([k, l]) => html`<a key=${k} href=${'#/' + k} class=${tab === k ? 'on' : ''}><${Icon} k=${k === 'settings' ? 'more' : k} /><span>${l}</span></a>`)}
    </nav>
    ${S.sync.state === 'err' && getKey() && html`<div class="sync-err" onClick=${() => S.pull()}>同期できませんでした(${S.sync.msg})・押してやり直す</div>`}
    ${sh && sheets[sh.kind] && sheets[sh.kind]()}
    <${Toasts} list=${toasts} />
  </${AppCtx.Provider}>`;
}

async function start() {
  await S.boot();
  await ensureAuto();
  createRoot(document.getElementById('root')).render(html`<${App} />`);
  // クラウドと合わせてから、もう一度定期の分を確認(別の端末で作った分と重ならないように)
  await S.pull();
  await ensureAuto();
  refreshQuotes();
  let last = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await S.pull();
    await ensureAuto();
    if (Date.now() - last > 10 * 60e3) { last = Date.now(); refreshQuotes(); }
  });
  setInterval(() => document.visibilityState === 'visible' && S.pull(), 90e3);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
