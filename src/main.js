// 家計簿アプリの土台: 下のタブ・画面の切りかえ・下から出る窓・同期
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { html, AppCtx, useStore, Toasts } from './ui.js';
import * as S from './store.js';
import { takeKeyFromUrl, getKey } from './api.js';
import { onQuotes } from './quotes.js';
import { ensureAuto } from './calc.js';
import { Home } from './home.js';
import { Records } from './records.js';
import { Report } from './report.js';
import { Assets, StockDetail, LotSheet, PlanSheet, PlanBaseSheet, WatchSheet, CashSheet, refreshQuotes } from './assets.js';
import { Settings, Recs, RecSheet, BudgetSheet, CatsSheet } from './settings.js';
import { EntrySheet, ImportSheet, ReceiptSheet } from './input.js';
import { vibrate } from './util.js';

takeKeyFromUrl();

const route = () => (location.hash.replace(/^#\/?/, '') || 'home');

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
  else if (page === 'report') body = html`<${Report} />`;
  else if (page === 'assets') body = html`<${Assets} qv=${qv} />`;
  else if (page === 'stock') body = html`<${StockDetail} key=${arg} symbol=${decodeURIComponent(arg || '')} qv=${qv} />`;
  else if (page === 'settings') body = html`<${Settings} />`;
  else if (page === 'recs') body = html`<${Recs} />`;
  else body = html`<${Home} quotesVer=${qv} />`;
  const tab = ['home', 'records', 'report', 'assets'].includes(page) ? page : page === 'stock' ? 'assets' : page === 'recs' || page === 'settings' ? 'home' : 'home';

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
    budget: () => html`<${BudgetSheet} onClose=${close} />`,
    cats: () => html`<${CatsSheet} onClose=${close} />`,
  };

  return html`<${AppCtx.Provider} value=${app}>
    <main class="main">${body}</main>
    <nav class="tabbar" aria-label="画面の切りかえ">
      ${[['home', 'ホーム', '⌂'], ['records', '記録', '▤']].map(([k, l, i]) => html`<a key=${k} href=${'#/' + k} class=${tab === k ? 'on' : ''}><span class="ti">${i}</span><span>${l}</span></a>`)}
      <button class="fab" aria-label="記録する" onClick=${() => { vibrate(10); app.edit(null); }}>＋</button>
      ${[['report', '分析', '◔'], ['assets', '資産', '↗']].map(([k, l, i]) => html`<a key=${k} href=${'#/' + k} class=${tab === k ? 'on' : ''}><span class="ti">${i}</span><span>${l}</span></a>`)}
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
