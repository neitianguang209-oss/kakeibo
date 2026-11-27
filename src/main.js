// 家計簿アプリの土台: 下のタブ・画面の切りかえ・下から出る窓・同期
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { html, AppCtx, useStore, Toasts } from './ui.js';
import * as S from './store.js';
import { takeKeyFromUrl, getKey, lsGet } from './api.js';
import { onQuotes } from './quotes.js';
import { ensureAuto } from './calc.js';
import { Records } from './records.js';
import { Report, CatPage, TrendPage, TipsPage, ForecastPage } from './report.js';
import { Budget } from './budget.js';
import { StockDetail, GoalSheet, LotSheet, PlanSheet, PlanBaseSheet, WatchSheet, CashSheet, EarningsPage, ComparePage, refreshQuotes } from './assets.js';
import { Wealth, AssetSheet } from './wealth.js';
import { TxDetail } from './detail.js';
import { Icon } from './icons.js';
import { PortfolioPage } from './portfolio.js';
import { ItemsPage } from './items.js';
import { Settings, Recs, RecSheet, BudgetSheet, CatsSheet, applySkin, applyTheme } from './settings.js';
import { EntrySheet, ImportSheet, ReceiptSheet } from './input.js';
import { vibrate } from './util.js';

takeKeyFromUrl();
applySkin(lsGet('kakeibo:skin') || 'orange');
applyTheme(lsGet('kakeibo:theme') || 'auto');

const route = () => location.hash.replace(/^#\/?/, '') || 'input';

// 下のタブ: 入力 / カレンダー / レポート / 資産 / その他。1段下の画面でも、どのタブの中にいるかを光らせる
const TABS = [['input', '入力', 'edit'], ['records', 'カレンダー', 'cal'], ['report', 'レポート', 'pie'], ['assets', '資産', 'chart'], ['settings', 'その他', 'more']];
const PARENT = { stock: 'assets', port: 'assets', earnings: 'assets', compare: 'assets', items: 'report', cat: 'report', trend: 'report', tips: 'report', forecast: 'report', budget: 'report', recs: 'settings' };

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
    edit: (tx, preset) => setSheet({ kind: 'entry', arg: tx, preset, n: Date.now() }),
    toast,
    qv,
  };
  // 詳細 → 直す のように窓を差しかえたとき、古い窓の「閉じる」で新しい窓まで消えないようにする
  const close = () => setSheet((cur) => (cur === sheet ? null : cur));

  const parts = r.split('/');
  const [page, arg] = parts;
  const dec = (s) => decodeURIComponent(s || '');
  const PAGES = {
    input: () => html`<${EntrySheet} page />`,
    records: () => html`<${Records} />`,
    report: () => html`<${Report} key=${arg || ''} start=${arg} />`,
    cat: () => html`<${CatPage} key=${r} mode=${arg} cat=${dec(parts[2])} start=${parts[3]} end=${parts[4]} />`,
    trend: () => html`<${TrendPage} />`,
    tips: () => html`<${TipsPage} />`,
    forecast: () => html`<${ForecastPage} />`,
    budget: () => html`<${Budget} />`,
    assets: () => html`<${Wealth} tab=${arg} qv=${qv} />`,
    port: () => html`<${PortfolioPage} key=${arg} kind=${arg === 'fund' ? 'fund' : 'stock'} qv=${qv} />`,
    earnings: () => html`<${EarningsPage} />`,
    compare: () => html`<${ComparePage} />`,
    items: () => html`<${ItemsPage} key=${arg || ''} initialTag=${dec(arg)} />`,
    stock: () => html`<${StockDetail} key=${arg} symbol=${dec(arg)} qv=${qv} />`,
    settings: () => html`<${Settings} />`,
    recs: () => html`<${Recs} />`,
  };
  const body = (PAGES[page] || PAGES.records)();
  const tab = PARENT[page] || (PAGES[page] ? page : 'records');

  const sh = sheet;
  const sheets = {
    entry: () => html`<${EntrySheet} key=${sh.n} tx=${sh.arg} preset=${sh.preset} onClose=${close} />`,
    detail: () => html`<${TxDetail} key=${sh.arg} id=${sh.arg} onClose=${close} />`,
    asset: () => html`<${AssetSheet} asset=${sh.arg} onClose=${close} />`,
    receipt: () => html`<${ReceiptSheet} onClose=${close} />`,
    import: () => html`<${ImportSheet} onClose=${close} />`,
    lot: () => html`<${LotSheet} lot=${sh.arg} onClose=${close} />`,
    plan: () => html`<${PlanSheet} plan=${sh.arg} onClose=${close} />`,
    planbase: () => html`<${PlanBaseSheet} plan=${sh.arg} onClose=${close} />`,
    watch: () => html`<${WatchSheet} item=${sh.arg} onClose=${close} />`,
    cash: () => html`<${CashSheet} onClose=${close} />`,
    rec: () => html`<${RecSheet} rec=${sh.arg} onClose=${close} />`,
    goal: () => html`<${GoalSheet} onClose=${close} />`,
    budget: () => html`<${BudgetSheet} onClose=${close} />`,
    cats: () => html`<${CatsSheet} onClose=${close} />`,
  };

  return html`<${AppCtx.Provider} value=${app}>
    <main class="main">${body}</main>
    <nav class="tabbar" aria-label="画面の切りかえ">
      ${TABS.map(([k, l, i]) => html`<a key=${k} href=${'#/' + k} class=${tab === k ? 'on' : ''} aria-current=${tab === k ? 'page' : null}><${Icon} k=${i} size="24" w=${i === 'more' ? 3 : 1.7} /><span>${l}</span></a>`)}
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
