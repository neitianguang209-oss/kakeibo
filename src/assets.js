// 資産: 総資産の推移・保有株(買った値段と今)・積立NISA・半導体指数との比較・ウォッチ
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { html, useApp, Seg, Sheet, Empty, Field, NumInput } from './ui.js';
import { LineChart, Spark } from './charts.js';
import { yen, pm, pct, tone, today, addDays, addMonths, periodKeyOf, parseD, md, short, uid, sum, ym, jpDay } from './util.js';
import { txs, getConf, summary, cashAt, positions, assetSeries, planBuys, priceAt, unitOf, isFundSym } from './calc.js';
import { getQuotes, loadQuotes, PRESET_WATCH, PRESET_FUNDS, PRESET_SEMI } from './quotes.js';
import * as S from './store.js';
import { fn, getKey } from './api.js';

const RANGES = [
  { v: 30, label: '1か月' },
  { v: 91, label: '3か月' },
  { v: 182, label: '6か月' },
  { v: 365, label: '1年' },
];
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

// 評価に使う値段: ふだんは1年分、積立の投信は設定来の全部
export function quotesForCalc() {
  const a = getQuotes('1y');
  const all = getQuotes('all');
  const out = { ...a };
  for (const [k, v] of Object.entries(all)) if (v?.points?.length) out[k] = { ...a[k], ...v, cur: a[k]?.cur ?? v.cur, prev: a[k]?.prev ?? v.prev };
  return out;
}
export function allSymbols() {
  const w = S.all('watch').map((x) => x.symbol);
  const conf = getConf();
  return [...new Set([...S.all('lot').map((l) => l.symbol), ...S.all('plan').map((p) => p.symbol), ...w, conf.bench || '^SOX', 'JPY=X'])];
}
export async function refreshQuotes(force = false) {
  const syms = allSymbols();
  const planSyms = [...new Set(S.all('plan').map((p) => p.symbol))];
  await Promise.all([loadQuotes(syms, '1y', force), planSyms.length ? loadQuotes(planSyms, 'all', force) : null]);
}

const fmtX = (t, full) => {
  const d = new Date(t);
  return full ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : `${d.getMonth() + 1}/${d.getDate()}`;
};

export function Assets({ qv }) {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const [range, setRange] = useState(182);
  const [busy, setBusy] = useState(false);
  const q = quotesForCalc();
  const fx = q['JPY=X']?.cur;
  const pos = positions(q, fx);
  const open = pos.filter((p) => !p.closed);
  const inv = sum(open, (p) => p.value || 0);
  const cost = sum(open, (p) => p.cost || 0);
  const day = sum(open, (p) => p.dayChange || 0);
  const realized = sum(pos, (p) => p.realized || 0);
  const cash = cashAt(list, conf);
  const series = useMemo(() => assetSeries(list, conf, q, fx, range), [S.getVersion(), range, qv, Object.keys(q).length]);

  const reload = async () => {
    setBusy(true);
    await refreshQuotes(true);
    setBusy(false);
  };
  const stocks = open.filter((p) => !p.plan);
  const plans = open.filter((p) => p.plan);

  return html`<div class="page assets">
    <header class="top"><button class="icon-btn" onClick=${() => history.back()} aria-label="もどる">‹</button><h1>資産</h1><button class=${'icon-btn' + (busy ? ' spin' : '')} onClick=${reload} aria-label="値段を取り直す">↻</button></header>
    ${!getKey() && html`<div class="note">株価・基準価額を取ってくるには、設定で合言葉を入れてください。</div>`}
    <section class="card hero">
      <div class="label">総資産</div>
      <div class="num hero-num">${yen((cash || 0) + inv)}</div>
      <div class="asset-split">
        <div><i style=${{ background: 'var(--c-cash)' }}></i>手元のお金<b class="num">${cash == null ? '未設定' : yen(cash)}</b></div>
        <div><i style=${{ background: 'var(--c-inv)' }}></i>投資(評価額)<b class="num">${yen(inv)}</b></div>
      </div>
      ${open.length > 0 && html`<div class="pl-grid">
        <div><span>投資した元本</span><b class="num">${yen(cost)}</b></div>
        <div><span>含み損益</span><b class=${'num ' + tone(inv - cost)}>${pm(inv - cost)}円 <em>${cost ? pct((inv - cost) / cost) : ''}</em></b></div>
        <div><span>前日比</span><b class=${'num ' + tone(day)}>${pm(day)}円</b></div>
        ${realized ? html`<div><span>売って確定した損益</span><b class=${'num ' + tone(realized)}>${pm(realized)}円</b></div>` : null}
      </div>`}
      <${Seg} small value=${range} onChange=${setRange} options=${RANGES} />
      <${LineChart} xs=${series.map((x) => x.ts)} height=${190} fmtX=${fmtX}
        fmtY=${(v, full) => (full ? yen(v) : short(v))}
        series=${[
          { key: 'total', label: '総資産', color: 'var(--s1)', values: series.map((x) => x.total), area: true },
          ...(open.length ? [{ key: 'inv', label: '投資の評価額', color: 'var(--c-inv)', values: series.map((x) => x.inv) }, { key: 'cost', label: '投資した元本', color: 'var(--ink3)', values: series.map((x) => x.cost), dash: true }] : []),
        ]} />
      ${cash == null && html`<button class="text-btn" onClick=${() => app.open('cash')}>手元のお金(口座・財布の残高)を入れる ›</button>`}
      ${cash != null && html`<button class="text-btn" onClick=${() => app.open('cash')}>残高を実際に合わせる ›</button>`}
    </section>


    <${GoalCard} total=${(cash || 0) + inv} list=${list} conf=${conf} />

    <div class="btn-row">
      <button class="btn" onClick=${() => app.open('lot')}>＋ 株・投信を買った</button>
      <button class="btn" onClick=${() => app.open('plan')}>＋ 積立を登録</button>
    </div>

    <${Compare} open=${open} q=${q} />

    <section class="card">
      <div class="card-h"><h3>📈 持っている株</h3></div>
      ${stocks.length ? stocks.map((p) => html`<${PosRow} key=${p.symbol} p=${p} q=${q} />`) : html`<p class="muted">「株・投信を買った」から、銘柄・買った日・株数・値段を入れると、今いくらになっているか毎日わかります。</p>`}
      ${pos.filter((p) => p.closed).length > 0 && html`<details class="closed"><summary>売り切った銘柄</summary>${pos.filter((p) => p.closed).map((p) => html`<div key=${p.symbol} class="row" onClick=${() => app.go('stock/' + encodeURIComponent(p.symbol))}><span class="rm">${p.name}</span><b class=${'num ' + tone(p.realized)}>${pm(p.realized)}円</b></div>`)}</details>`}
    </section>

    <section class="card">
      <div class="card-h"><h3>🌱 積立(NISA)</h3></div>
      ${plans.length ? plans.map((p) => html`<${PlanRow} key=${p.symbol} p=${p} q=${q} />`) : html`<p class="muted">オルカンなどの積立を登録すると、毎月の積立日に自動で口数を足して、投資した額と今の評価額を出します。</p>`}
    </section>

    <${Watch} q=${q} />
    <p class="fine">値段は Yahoo!ファイナンス・三菱UFJアセットマネジメントの公開データ。株価は約20分遅れ、投信は前営業日の基準価額。積立の口数は積立日の基準価額からの計算(目安)。実際の口数は「口数を合わせる」で直せます。</p>
    <div class="bottom-space"></div>
  </div>`;
}

function PosRow({ p, q }) {
  const app = useApp();
  const pts = (q[p.symbol]?.points || []).slice(-30).map((x) => x[1]);
  const u = unitOf(p.symbol);
  return html`<button class="pos-row" onClick=${() => app.go('stock/' + encodeURIComponent(p.symbol))}>
    <span class="pr-main"><b>${shortName(p.name)}</b><small>${p.kind === 'fund' ? `${Math.round(p.qty).toLocaleString()}口` : `${p.qty.toLocaleString()}株`}・平均 ${p.qty ? ((p.cost / p.qty) * u).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'}${p.currency === 'USD' ? '円換算' : '円'}${p.accts.length ? '・' + p.accts.join('/') : ''}</small></span>
    <${Spark} values=${pts} />
    <span class="pr-val"><b class="num">${p.value != null ? yen(p.value) : '…'}</b>
      <small class=${'num ' + tone(p.pl)}>${p.pl != null ? `${pm(p.pl)}円 (${pct(p.plRate)})` : ''}</small>
      <small class=${'num ' + tone(p.dayChange)}>前日比 ${pm(p.dayChange)}</small></span>
  </button>`;
}

function PlanRow({ p, q }) {
  const app = useApp();
  const pl = p.plan;
  const pts = (q[p.symbol]?.points || []).slice(-60).map((x) => x[1]);
  return html`<button class="pos-row" onClick=${() => app.go('stock/' + encodeURIComponent(p.symbol))}>
    <span class="pr-main"><b>${shortName(p.name)}</b><small>毎月${pl.day === 'end' ? '末' : pl.day}日 ${yen(pl.amount)}・${(p.planBuys || []).length}回${pl.acct ? '・' + pl.acct : ''}</small></span>
    <${Spark} values=${pts} />
    <span class="pr-val"><b class="num">${p.value != null ? yen(p.value) : '…'}</b>
      <small>元本 ${yen(p.cost)}</small>
      <small class=${'num ' + tone(p.pl)}>${p.pl != null ? `${pm(p.pl)}円 (${pct(p.plRate)})` : ''}</small></span>
  </button>`;
}

// ---- 自分の株 と 半導体指数 を、同じ日を100として重ねる(単位がちがうので割合でそろえる)
function Compare({ open, q }) {
  const conf = getConf();
  const [range, setRange] = useState(91);
  const bench = conf.bench || '^SOX';
  const benchQ = q[bench];
  const stockPos = open.filter((p) => q[p.symbol]?.points?.length > 2);
  const [sel, setSel] = useState(null);
  const chosen = sel || [...stockPos.filter((p) => !p.plan), ...stockPos.filter((p) => p.plan)].slice(0, 2).map((p) => p.symbol);
  const from = parseD(addDays(today(), -range)).getTime();
  // 日付をそろえる(指数の日付を軸に)
  const axis = (benchQ?.points || []).filter((p) => p[0] >= from).map((p) => p[0]);
  const idx = (sym) => {
    const sq = q[sym];
    if (!sq?.points?.length || !axis.length) return [];
    const vals = axis.map((t) => {
      let v = null;
      for (const p of sq.points) { if (p[0] <= t + 18 * 3600e3) v = p[1]; else break; }
      return v;
    });
    const base = vals.find((v) => v != null);
    return vals.map((v) => (v == null || !base ? null : (v / base) * 100));
  };
  // 持っている株ぜんぶ(今の数で重みづけ)
  const mine = (() => {
    if (!stockPos.length || !axis.length) return [];
    const tot = axis.map((t) => {
      let s = 0, ok = false;
      for (const p of stockPos) {
        const v = priceAt(q[p.symbol], ymdOf(t));
        if (v != null) { s += (p.qty * v * (q[p.symbol].currency === 'USD' ? q['JPY=X']?.cur || 150 : 1)) / unitOf(p.symbol); ok = true; }
      }
      return ok ? s : null;
    });
    const b = tot.find((v) => v);
    return tot.map((v) => (v && b ? (v / b) * 100 : null));
  })();
  const series = [
    { key: 'bench', label: benchQ?.name ? shortName(benchQ.name) : '半導体指数', color: 'var(--ink3)', values: idx(bench), dash: true },
    ...(stockPos.length > 1 ? [{ key: 'mine', label: '持ち株ぜんぶ', color: 'var(--s1)', values: mine }] : []),
    ...chosen.slice(0, 3).map((s, i) => ({ key: s, label: shortName(q[s]?.name || s), color: SERIES[i + 1], values: idx(s) })),
  ].filter((s) => s.values.length);
  const last = (v) => [...v].reverse().find((x) => x != null);
  const benchList = [...PRESET_WATCH, ...S.all('watch')].filter((w, i, a) => a.findIndex((x) => x.symbol === w.symbol) === i);
  return html`<section class="card">
    <div class="card-h"><h3>⚖️ 指数とくらべる</h3>
      <select class="mini-sel" value=${bench} onChange=${(e) => S.setConf({ bench: e.target.value })} aria-label="くらべる指数">${benchList.map((w) => html`<option key=${w.symbol} value=${w.symbol}>${shortName(w.name)}</option>`)}</select></div>
    <p class="muted small">${range === 30 ? '1か月' : range === 91 ? '3か月' : range === 182 ? '半年' : '1年'}前を100として、どれだけ上がった・下がったか</p>
    <${Seg} small value=${range} onChange=${setRange} options=${RANGES} />
    ${series.length ? html`<${LineChart} xs=${axis} series=${series} baseline=${100} height=${200} fmtX=${fmtX} fmtY=${(v, full) => (full ? (v - 100 >= 0 ? '+' : '') + (v - 100).toFixed(1) + '%' : Math.round(v))} />
      <div class="cmp-sum">${series.map((s) => { const v = last(s.values); return v != null && html`<span key=${s.key}><i style=${{ background: s.color }}></i>${s.label}<b class=${'num ' + tone(v - 100)}>${pct((v - 100) / 100)}</b></span>`; })}</div>`
      : html`<p class="muted">${getKey() ? '値段を読みこみ中、または比べる株がまだありません。' : '合言葉を入れると表示されます。'}</p>`}
    ${stockPos.length > 1 && html`<div class="row-chips">${stockPos.map((p) => html`<button key=${p.symbol} class=${'chip small' + (chosen.includes(p.symbol) ? ' on' : '')} onClick=${() => setSel(chosen.includes(p.symbol) ? chosen.filter((x) => x !== p.symbol) : [...chosen, p.symbol].slice(-3))}>${shortName(p.name)}</button>`)}</div>`}
  </section>`;
}
const ymdOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// 投信は呼び名(オルカン など)で
const NICK = [[/全世界株式\(?オール/, 'オルカン'], [/eMAXIS ?Slim ?米国株式/, 'eMAXIS Slim S&P500'], [/SBI・V・S&P500/, 'SBI・V・S&P500'], [/楽天・全米株式/, '楽天VTI']];
export const shortName = (n) => (NICK.find(([re]) => re.test(String(n || '').normalize('NFKC')))?.[1]) || String(n || '').replace(/^PHLX Semiconductor$/, '半導体株指数(SOX)').replace(/^Nikkei 225$/, '日経平均').replace(/^S&P 500$/, 'S&P500').replace(/フィラデルフィア半導体株指数\(SOX\)/, '半導体株指数(SOX)').replace(/ホールディングス$/, 'HD').slice(0, 22);

// ---- ウォッチ(持っていないけど見ておきたい銘柄・指数)
function Watch({ q }) {
  const app = useApp();
  const w = S.all('watch');
  const items = w.length ? w : PRESET_WATCH.slice(0, 1);
  useEffect(() => { loadQuotes(items.map((x) => x.symbol), '1y'); }, [w.length]);
  return html`<section class="card">
    <div class="card-h"><h3>👀 ウォッチ</h3><button class="text-btn" onClick=${() => app.open('watch')}>＋ 追加</button></div>
    ${items.map((x) => {
      const d = q[x.symbol] || getQuotes('1y')[x.symbol];
      const ch = d?.cur != null && d?.prev ? (d.cur - d.prev) / d.prev : null;
      return html`<div key=${x.symbol} class="pos-row" onClick=${() => app.go('stock/' + encodeURIComponent(x.symbol))}>
        <span class="pr-main"><b>${shortName(d?.name || x.name)}</b><small>${x.symbol}</small></span>
        <${Spark} values=${(d?.points || []).slice(-30).map((p) => p[1])} />
        <span class="pr-val"><b class="num">${d?.cur != null ? d.cur.toLocaleString('ja-JP', { maximumFractionDigits: 2 }) : '…'}</b><small class=${'num ' + tone(ch)}>${ch != null ? pct(ch, 2) : ''}</small></span>
        ${w.length > 0 && html`<button class="icon-btn" aria-label="ウォッチから外す" onClick=${(e) => { e.stopPropagation(); S.remove(x.id); }}>✕</button>`}
      </div>`;
    })}
  </section>`;
}

// ---- 1銘柄のくわしい画面
const DRANGE = [
  { v: '1d', label: '1日' },
  { v: '1mo', label: '1か月' },
  { v: '6mo', label: '6か月' },
  { v: '1y', label: '1年' },
  { v: '5y', label: '5年' },
];
export function StockDetail({ symbol }) {
  const app = useApp();
  const [range, setRange] = useState(isFundSym(symbol) ? '1y' : '1mo');
  const [, force] = useState(0);
  const [cmp, setCmp] = useState(false);
  const conf = getConf();
  const bench = conf.bench || '^SOX';
  useEffect(() => {
    let alive = true;
    const r = range === '5y' && isFundSym(symbol) ? 'all' : range;
    Promise.all([loadQuotes([symbol], r), cmp ? loadQuotes([bench], r) : null]).then(() => alive && force((x) => x + 1));
    return () => { alive = false; };
  }, [range, symbol, cmp]);
  const rq = getQuotes(range === '5y' && isFundSym(symbol) ? 'all' : range);
  const d = rq[symbol] || getQuotes('1y')[symbol];
  const qc = quotesForCalc();
  const fx = qc['JPY=X']?.cur;
  const p = positions(qc, fx).find((x) => x.symbol === symbol);
  const lots = S.all('lot').filter((l) => l.symbol === symbol).sort((a, b) => (a.date < b.date ? 1 : -1));
  const plan = S.all('plan').find((x) => x.symbol === symbol);
  let pts = d?.points || [];
  if (range === '5y' && isFundSym(symbol)) pts = pts.filter((x) => x[0] >= Date.now() - 5 * 365 * 864e5);
  const xs = pts.map((x) => x[0]);
  const vals = pts.map((x) => x[1]);
  const markers = [];
  for (const l of lots) {
    const t = parseD(l.date).getTime();
    if (!xs.length || t < xs[0]) continue;
    let i = xs.findIndex((x) => x >= t - 12 * 3600e3);
    if (i < 0) i = xs.length - 1;
    markers.push({ i, color: l.side === 'sell' ? 'var(--down)' : 'var(--up)' });
  }
  const avg = p && p.qty ? (p.cost / p.qty) * unitOf(symbol) / (d?.currency === 'USD' ? fx || 150 : 1) : null;
  const ch = d?.cur != null && d?.prev ? d.cur - d.prev : null;
  const benchVals = (() => {
    if (!cmp) return null;
    const bq = getQuotes(range === '5y' && isFundSym(symbol) ? '5y' : range)[bench];
    if (!bq?.points?.length || !xs.length) return null;
    const out = xs.map((t) => {
      let v = null;
      for (const pp of bq.points) { if (pp[0] <= t + 18 * 3600e3) v = pp[1]; else break; }
      return v;
    });
    const b0 = out.find((v) => v != null);
    return out.map((v) => (v == null ? null : (v / b0) * 100));
  })();
  const own = vals.length ? vals.map((v) => (v / vals[0]) * 100) : [];
  const ccy = d?.currency === 'USD' ? '$' : '';
  const fmtP = (v) => ccy + Number(v).toLocaleString('ja-JP', { maximumFractionDigits: v < 100 ? 2 : 0 });

  // 積立: 投資額と評価額の推移
  const planSeries = useMemo(() => {
    if (!plan) return null;
    const qq = qc[symbol];
    const buys = planBuys(plan, qq);
    if (!buys.length || !qq?.points?.length) return null;
    const out = [];
    let units = 0, paid = 0, bi = 0;
    if (plan.base?.units) { units += +plan.base.units; paid += +plan.base.cost || 0; }
    const first = parseD(buys[0].date).getTime();
    const ptsAll = qq.points.filter((x) => x[0] >= first - 864e5);
    const step = Math.max(1, Math.floor(ptsAll.length / 240));
    ptsAll.forEach((pt, k) => {
      while (bi < buys.length && parseD(buys[bi].date).getTime() <= pt[0] + 12 * 3600e3) {
        if (!(plan.base?.date && buys[bi].date <= plan.base.date)) { units += buys[bi].units; paid += buys[bi].amount; }
        bi++;
      }
      if (k % step === 0 || k === ptsAll.length - 1) out.push({ t: pt[0], value: (units * pt[1]) / unitOf(symbol), paid });
    });
    return out;
  }, [plan, qc[symbol]?.points?.length]);

  return html`<div class="page detail">
    <header class="top"><button class="icon-btn" onClick=${() => history.back()} aria-label="もどる">‹</button><h1 class="dt">${shortName(d?.name || p?.name || symbol)}</h1><span class="sym">${symbol}</span></header>
    <section class="card">
      <div class="px"><b class="num">${d?.cur != null ? fmtP(d.cur) : '…'}</b>${ch != null && html`<span class=${'num ' + tone(ch)}>${pm(ch, ch && Math.abs(ch) < 10 ? 2 : 0)} (${pct(ch / d.prev, 2)})</span>`}</div>
      <${Seg} small value=${range} onChange=${setRange} options=${isFundSym(symbol) ? DRANGE.slice(1) : DRANGE} />
      ${cmp && benchVals
        ? html`<${LineChart} xs=${xs} baseline=${100} height=${220} fmtX=${fmtX} fmtY=${(v, full) => (full ? (v - 100 >= 0 ? '+' : '') + (v - 100).toFixed(1) + '%' : Math.round(v))}
            series=${[{ key: 'b', label: shortName(getQuotes('1y')[bench]?.name || bench), color: 'var(--ink3)', values: benchVals, dash: true }, { key: 's', label: shortName(d?.name || symbol), color: 'var(--s1)', values: own }]} />`
        : html`<${LineChart} xs=${xs} height=${220} fmtX=${range === '1d' ? (t, full) => { const x = new Date(t); return (full ? fmtX(t, true) + ' ' : '') + `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`; } : fmtX} fmtY=${(v) => fmtP(v)}
            series=${[{ key: 's', label: '値段', color: vals.at(-1) >= vals[0] ? 'var(--up)' : 'var(--down)', values: vals, area: true }]} markers=${markers} baseline=${avg && range !== '1d' ? avg : null} legend=${false} />`}
      <div class="chart-notes">
        ${!cmp && avg && html`<span><i class="base-i"></i>平均取得単価 ${fmtP(avg)}</span>`}
        ${!cmp && markers.length > 0 && html`<span><i class="dot up"></i>買った日</span>`}
        ${!isFundSym(symbol) && symbol !== bench && html`<label class="cmp-t"><input type="checkbox" checked=${cmp} onChange=${(e) => setCmp(e.target.checked)} /> ${shortName(getQuotes('1y')[bench]?.name || '半導体指数')}とくらべる</label>`}
      </div>
    </section>
    ${p && !p.closed && html`<section class="card">
      <div class="pl-grid">
        <div><span>持っている数</span><b class="num">${p.kind === 'fund' ? Math.round(p.qty).toLocaleString() + '口' : p.qty.toLocaleString() + '株'}</b></div>
        <div><span>評価額</span><b class="num">${p.value != null ? yen(p.value) : '—'}</b></div>
        <div><span>投資した額</span><b class="num">${yen(p.cost)}</b></div>
        <div><span>損益</span><b class=${'num ' + tone(p.pl)}>${p.pl != null ? pm(p.pl) + '円' : '—'} <em>${p.plRate != null ? pct(p.plRate) : ''}</em></b></div>
        ${avg && html`<div><span>平均取得単価</span><b class="num">${fmtP(avg)}</b></div>`}
        ${p.realized ? html`<div><span>確定した損益</span><b class=${'num ' + tone(p.realized)}>${pm(p.realized)}円</b></div>` : null}
      </div>
    </section>`}
    ${planSeries && html`<section class="card">
      <div class="card-h"><h3>積立の歩み</h3></div>
      <${LineChart} xs=${planSeries.map((x) => x.t)} height=${190} fmtX=${fmtX} fmtY=${(v, full) => (full ? yen(v) : short(v))}
        series=${[{ key: 'v', label: '評価額', color: 'var(--c-inv)', values: planSeries.map((x) => x.value), area: true }, { key: 'p', label: '積み立てた額', color: 'var(--ink3)', values: planSeries.map((x) => x.paid), dash: true }]} />
      <div class="row-btns"><button class="btn small" onClick=${() => app.open('plan', plan)}>積立の設定を直す</button><button class="btn small ghost" onClick=${() => app.open('planbase', plan)}>口数を合わせる</button></div>
    </section>`}
    <section class="card">
      <div class="card-h"><h3>売り買いの記録</h3></div>
      ${lots.length ? lots.map((l) => html`<button key=${l.id} class="row" onClick=${() => app.open('lot', l)}>
        <span class=${'side ' + (l.side === 'sell' ? 'sell' : 'buy')}>${l.side === 'sell' ? '売' : '買'}</span>
        <span class="rm">${jpDay(l.date)}<small>${isFundSym(symbol) ? Math.round(l.qty).toLocaleString() + '口' : l.qty + '株'} × ${fmtP(l.price)}${l.acct ? '・' + l.acct : ''}</small></span>
        <b class="num">${yen((l.qty * l.price * (l.currency === 'USD' ? +l.fx || fx || 150 : 1)) / unitOf(symbol))}</b></button>`)
        : html`<p class="muted">${plan ? '積立のほかに買った分があれば、ここから足せます。' : 'まだありません'}</p>`}
      <div class="row-btns">
        <button class="btn small" onClick=${() => app.open('lot', { symbol, name: d?.name || p?.name, side: 'buy' })}>＋ 買った</button>
        ${p && p.qty > 0 && html`<button class="btn small ghost" onClick=${() => app.open('lot', { symbol, name: d?.name || p?.name, side: 'sell' })}>売った</button>`}
        ${!p && !S.all('watch').some((w) => w.symbol === symbol) && html`<button class="btn small ghost" onClick=${() => S.save('watch', { id: uid('w'), symbol, name: d?.name || symbol })}>ウォッチに追加</button>`}
      </div>
    </section>
    <div class="bottom-space"></div>
  </div>`;
}

// ---- 銘柄さがし
function SymbolSearch({ onPick, presets, placeholder = '会社名・コード(例: 8035、レーザーテック)' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const tm = useRef(0);
  useEffect(() => {
    clearTimeout(tm.current);
    if (!q.trim()) return setRes([]);
    tm.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fn('search', { q });
        setRes(r.results || []);
      } catch { setRes([]); }
      setBusy(false);
    }, 450);
  }, [q]);
  return html`<div class="sym-search">
    <input type="search" placeholder=${placeholder} value=${q} onChange=${(e) => setQ(e.target.value)} />
    ${busy && html`<div class="muted small">さがしています…</div>`}
    ${res.map((r) => html`<button key=${r.symbol} class="row" onClick=${() => onPick(r)}><span class="rm">${r.name}<small>${r.symbol}${r.kind === 'fund' ? '・投資信託' : ''}</small></span><span class="chev">›</span></button>`)}
    ${!q && presets && presets.map((g) => html`<div key=${g.title} class="preset"><div class="ph">${g.title}</div><div class="row-chips wrap">${g.items.map((r) => html`<button key=${r.symbol} class="chip" onClick=${() => onPick(r)}>${r.nick || r.name}</button>`)}</div></div>`)}
  </div>`;
}

// ---- 買った・売った
export function LotSheet({ lot, onClose }) {
  const app = useApp();
  const editing = !!lot?.id;
  const [sym, setSym] = useState(lot?.symbol ? { symbol: lot.symbol, name: lot.name } : null);
  const [side, setSide] = useState(lot?.side || 'buy');
  const [date, setDate] = useState(lot?.date || today());
  const [qty, setQty] = useState(lot?.qty != null ? String(lot.qty) : '');
  const [price, setPrice] = useState(lot?.price != null ? String(lot.price) : '');
  const [amt, setAmt] = useState('');
  const [acct, setAcct] = useState(lot?.acct || 'NISA 成長投資枠');
  const [fee, setFee] = useState(lot?.fee ? String(lot.fee) : '');
  const [cash, setCash] = useState(lot ? !!lot.cashTx || !editing : true);
  const fund = sym && isFundSym(sym.symbol);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!sym) return;
    loadQuotes([sym.symbol], isFundSym(sym.symbol) ? 'all' : '1y').then(() => bump((x) => x + 1));
  }, [sym?.symbol]);
  const qd = sym ? getQuotes(isFundSym(sym.symbol) ? 'all' : '1y')[sym.symbol] : null;
  const usd = qd?.currency === 'USD';
  const fx = getQuotes('1y')['JPY=X']?.cur || 150;
  const suggested = qd ? priceAt(qd, date) : null;
  // 投信は金額で買うことが多いので、金額から口数を出す
  const effQty = fund && amt && (price || suggested) ? (+amt / +(price || suggested)) * 10000 : +qty;
  const effPrice = +(price || suggested || 0);
  const total = sym ? (effQty * effPrice * (usd ? fx : 1)) / unitOf(sym.symbol) + (+fee || 0) : 0;
  const save = async (close) => {
    if (!sym || !effQty || !effPrice) return app.toast('銘柄・数・値段を入れてください');
    const id = lot?.id || uid('l');
    const rec = { id, symbol: sym.symbol, name: sym.name || qd?.name || sym.symbol, side, date, qty: Math.round(effQty * 1000) / 1000, price: effPrice, acct, fee: +fee || 0, currency: usd ? 'USD' : 'JPY', fx: usd ? fx : undefined, cashTx: cash ? `l_${id}` : null };
    await S.save('lot', rec);
    if (cash) await S.save('tx', { id: `l_${id}`, type: 'inv', amount: Math.round(side === 'sell' ? -(total - 2 * (+fee || 0)) : total), cat: isFundSym(sym.symbol) ? '投資信託' : '株', date, memo: `${shortName(rec.name)} ${side === 'sell' ? '売った' : '買った'}`, src: 'lot', t: Date.now() });
    else if (lot?.cashTx) await S.remove(lot.cashTx);
    close();
    app.toast(`${shortName(rec.name)} を記録しました`);
    refreshQuotes();
  };
  const del = async (close) => {
    await S.remove(lot.id);
    if (lot.cashTx) await S.remove(lot.cashTx);
    close();
    app.toast('消しました', () => { S.restore(lot.id); lot.cashTx && S.restore(lot.cashTx); });
  };
  return html`<${Sheet} title=${editing ? '売り買いを直す' : side === 'sell' ? '売った' : '買った'} onClose=${onClose} full
    foot=${sym && ((close) => html`${editing && html`<button class="btn ghost danger" onClick=${() => del(close)}>消す</button>`}<button class="btn primary wide" onClick=${() => save(close)}>記録する${total ? `(${yen(total)})` : ''}</button>`)}>
    ${!sym ? html`<${SymbolSearch} onPick=${setSym} presets=${[{ title: '半導体', items: PRESET_SEMI }, { title: '投資信託', items: PRESET_FUNDS }]} />`
    : html`<div class="form">
      <div class="picked"><b>${shortName(sym.name || qd?.name)}</b><small>${sym.symbol}</small>${!editing && html`<button class="text-btn" onClick=${() => setSym(null)}>変える</button>`}</div>
      <${Seg} value=${side} onChange=${setSide} options=${[{ v: 'buy', label: '買った', color: 'var(--up)' }, { v: 'sell', label: '売った', color: 'var(--down)' }]} />
      <${Field} label="日付"><input type="date" value=${date} max=${today()} onChange=${(e) => setDate(e.target.value)} /></${Field}>
      ${fund ? html`
        <${Field} label="金額(円)" hint="投信は金額で買ったときはこちら。口数はその日の基準価額から計算します"><${NumInput} value=${amt} onChange=${setAmt} placeholder="例: 30000" suffix="円" /></${Field}>
        <${Field} label="または 口数"><${NumInput} value=${qty} onChange=${(v) => { setQty(v); setAmt(''); }} placeholder="例: 8433" suffix="口" /></${Field}>
        <${Field} label="基準価額(1万口あたり)" hint=${suggested ? `その日の基準価額: ${suggested.toLocaleString()}円` : ''}><${NumInput} value=${price} onChange=${setPrice} placeholder=${suggested ? String(suggested) : ''} suffix="円" /></${Field}>`
      : html`
        <${Field} label="株数"><${NumInput} value=${qty} onChange=${setQty} placeholder="例: 100" suffix="株" /></${Field}>
        <${Field} label=${`1株の値段${usd ? '(ドル)' : ''}`} hint=${suggested ? `その日の終値: ${usd ? '$' : ''}${suggested.toLocaleString()}${usd ? ` ・1ドル ${fx.toFixed(1)}円で円に直します` : '円'}` : ''}><${NumInput} value=${price} onChange=${setPrice} placeholder=${suggested ? String(suggested) : ''} suffix=${usd ? 'ドル' : '円'} /></${Field}>`}
      <${Field} label="口座"><select value=${acct} onChange=${(e) => setAcct(e.target.value)}>${['NISA 成長投資枠', 'NISA つみたて投資枠', '特定口座', '一般口座'].map((a) => html`<option key=${a}>${a}</option>`)}</select></${Field}>
      <${Field} label="手数料(あれば)"><${NumInput} value=${fee} onChange=${setFee} placeholder="0" suffix="円" /></${Field}>
      <label class="check"><input type="checkbox" checked=${cash} onChange=${(e) => setCash(e.target.checked)} /> 家計簿にも「投資へ」として記録する(手元のお金から${side === 'sell' ? '戻った' : '出た'}お金)</label>
    </div>`}
  </${Sheet}>`;
}

// ---- 積立の登録
export function PlanSheet({ plan, onClose }) {
  const app = useApp();
  const editing = !!plan?.id;
  const [sym, setSym] = useState(plan ? { symbol: plan.symbol, name: plan.name } : null);
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '');
  const [day, setDay] = useState(plan?.day || 1);
  const [start, setStart] = useState(plan?.start || ym(today()) + '-01');
  const [acct, setAcct] = useState(plan?.acct || 'NISA つみたて投資枠');
  const [cash, setCash] = useState(plan ? plan.cash !== false : true);
  const [stopped, setStopped] = useState(!!plan?.stopFrom);
  const save = async (close) => {
    if (!sym || !+amount) return app.toast('ファンドと毎月の金額を入れてください');
    const id = plan?.id || uid('p');
    const prevAmt = plan ? +plan.amount : null;
    const changes = [...(plan?.changes || [])];
    // 途中で金額を変えたら、今月からの金額として覚える(前の月の計算は変えない)
    if (plan && prevAmt !== +amount) {
      if (!changes.length) changes.push({ from: plan.start, amount: prevAmt });
      changes.push({ from: ym(today()) + '-01', amount: +amount });
    }
    await S.save('plan', { ...(plan || {}), id, symbol: sym.symbol, name: sym.nick ? sym.name : sym.name, amount: +amount, day: day === 'end' ? 'end' : +day, start, acct, cash, cashFrom: plan?.cashFrom || ym(today()) + '-01', changes, stopFrom: stopped ? plan?.stopFrom || today() : null, active: !stopped });
    close();
    app.toast('積立を登録しました');
    refreshQuotes();
  };
  const del = async (close) => {
    await S.remove(plan.id);
    close();
    app.toast('積立を消しました', () => S.restore(plan.id));
  };
  return html`<${Sheet} title=${editing ? '積立の設定' : '積立を登録'} onClose=${onClose} full
    foot=${sym && ((close) => html`${editing && html`<button class="btn ghost danger" onClick=${() => del(close)}>消す</button>`}<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`)}>
    ${!sym ? html`<${SymbolSearch} onPick=${setSym} placeholder="ファンド名・協会コード(例: 0331418A)" presets=${[{ title: 'よく使われる投資信託', items: PRESET_FUNDS }]} />`
    : html`<div class="form">
      <div class="picked"><b>${sym.name}</b><small>${sym.symbol}</small>${!editing && html`<button class="text-btn" onClick=${() => setSym(null)}>変える</button>`}</div>
      <${Field} label="毎月の金額"><${NumInput} value=${amount} onChange=${setAmount} placeholder="例: 30000" suffix="円" /></${Field}>
      <${Field} label="積立日"><select value=${day} onChange=${(e) => setDay(e.target.value === 'end' ? 'end' : +e.target.value)}>${Array.from({ length: 28 }, (_, i) => html`<option key=${i} value=${i + 1}>毎月${i + 1}日</option>`)}<option value="end">毎月末</option></select></${Field}>
      <${Field} label="積立を始めた日" hint="過去にさかのぼって入れると、その日からの基準価額で口数を計算します"><input type="date" value=${start} max=${today()} onChange=${(e) => setStart(e.target.value)} /></${Field}>
      <${Field} label="口座"><select value=${acct} onChange=${(e) => setAcct(e.target.value)}>${['NISA つみたて投資枠', 'NISA 成長投資枠', '特定口座', 'iDeCo'].map((a) => html`<option key=${a}>${a}</option>`)}</select></${Field}>
      <label class="check"><input type="checkbox" checked=${cash} onChange=${(e) => setCash(e.target.checked)} /> 毎月の積立を家計簿にも「投資へ」として自動で記録する(今月から)</label>
      ${editing && html`<label class="check"><input type="checkbox" checked=${stopped} onChange=${(e) => setStopped(e.target.checked)} /> 積立をやめた(持っている分はそのまま評価します)</label>`}
    </div>`}
  </${Sheet}>`;
}

// ---- 積立の口数を、証券会社の画面に合わせる
export function PlanBaseSheet({ plan, onClose }) {
  const app = useApp();
  const [units, setUnits] = useState(plan.base?.units ? String(plan.base.units) : '');
  const [cost, setCost] = useState(plan.base?.cost ? String(plan.base.cost) : '');
  const [date, setDate] = useState(plan.base?.date || today());
  const save = async (close) => {
    await S.save('plan', { ...plan, base: units ? { units: +units, cost: +cost || 0, date } : null });
    close();
    app.toast('口数を合わせました');
  };
  return html`<${Sheet} title="口数を合わせる" onClose=${onClose}
    foot=${(close) => html`<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <p class="muted">証券会社のアプリの「保有口数」と「取得金額(買付金額)」を入れると、その日までの分はこの数字を使い、それより後は積立日ごとに足していきます。</p>
    <div class="form">
      <${Field} label="この日の時点で"><input type="date" value=${date} max=${today()} onChange=${(e) => setDate(e.target.value)} /></${Field}>
      <${Field} label="保有口数"><${NumInput} value=${units} onChange=${setUnits} placeholder="例: 152340" suffix="口" /></${Field}>
      <${Field} label="取得金額(投資した合計)"><${NumInput} value=${cost} onChange=${setCost} placeholder="例: 480000" suffix="円" /></${Field}>
    </div>
  </${Sheet}>`;
}

export function WatchSheet({ onClose }) {
  const app = useApp();
  const pick = async (r, close) => {
    if (S.all('watch').some((w) => w.symbol === r.symbol)) return app.toast('もう入っています');
    await S.save('watch', { id: uid('w'), symbol: r.symbol, name: r.name });
    close();
    app.toast(`${shortName(r.name)} をウォッチに追加`);
  };
  return html`<${Sheet} title="ウォッチに追加" onClose=${onClose} full>
    ${(close) => html`<${SymbolSearch} onPick=${(r) => pick(r, close)} presets=${[{ title: '指数', items: [...PRESET_WATCH, { symbol: 'SOXX', name: '半導体ETF(SOXX)' }, { symbol: '^IXIC', name: 'ナスダック総合' }] }, { title: '半導体の会社', items: PRESET_SEMI }]} />`}
  </${Sheet}>`;
}

// ---- 手元のお金(最初の残高・残高あわせ)
export function CashSheet({ onClose }) {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const cur = cashAt(list, conf);
  const [v, setV] = useState('');
  const save = async (close) => {
    const n = +v;
    if (!v) return;
    if (!conf.cashStart) {
      await S.setConf({ cashStart: { date: today(), amount: n } });
      // 今日の分はもう引かれた後の残高として扱うため、今日の記録は足し引きしない
      const td = list.filter((t) => t.date === today());
      const delta = td.reduce((s, t) => s + (t.type === 'in' ? t.amount : t.type === 'out' || t.type === 'inv' ? -t.amount : 0), 0);
      if (delta) await S.save('tx', { id: uid('a'), type: 'adj', amount: -delta, cat: '残高あわせ', date: today(), memo: '残高あわせ', t: Date.now() });
    } else {
      const diff = n - cur;
      if (diff) await S.save('tx', { id: uid('a'), type: 'adj', amount: diff, cat: '残高あわせ', date: today(), memo: '残高あわせ', t: Date.now() });
    }
    close();
    app.toast('手元のお金を合わせました');
  };
  return html`<${Sheet} title="手元のお金" onClose=${onClose}
    foot=${(close) => html`<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <p class="muted">${conf.cashStart ? `アプリの計算ではいま ${yen(cur)}。銀行・財布・PayPayなどの実際の合計を入れると、差を「残高あわせ」として記録します(支出には数えません)。` : '銀行口座・財布・PayPayなどの、今の残高の合計を入れてください。ここから先は、記録した収入・支出・投資で自動で増減します(証券口座のお金は除く)。'}</p>
    <div class="form"><${Field} label="今の合計"><${NumInput} value=${v} onChange=${setV} placeholder=${cur != null ? String(cur) : '例: 250000'} suffix="円" /></${Field}></div>
  </${Sheet}>`;
}

// ---- 貯める目標(総資産がどこまで来たか・毎月の投資額)
function GoalCard({ total, list, conf }) {
  const app = useApp();
  const g = conf.goal;
  const curKey = periodKeyOf(today(), conf.startDay);
  const past = [1, 2, 3].map((i) => summary(list, addMonths(curKey, -i), conf));
  const monthlyInv = Math.round(sum(past, (p) => p.inv) / 3);
  if (!g?.amount) {
    return html`<button class="card goal-unset" onClick=${() => app.open('goal')}><b>🎯 貯める目標を決める</b><small>例: 「旅行資金 30万円」「100万円」。総資産がどこまで来たか、ここに出ます${monthlyInv ? `(いま毎月 約${yen(monthlyInv)} を投資に回しています)` : ''}</small></button>`;
  }
  const r = Math.max(0, Math.min(1, total / g.amount));
  const left = g.amount - total;
  const months = g.date ? Math.max(0, Math.round((parseD(g.date) - parseD(today())) / 864e5 / 30.4)) : null;
  return html`<section class="card goal" onClick=${() => app.open('goal')}>
    <div class="card-h"><h3>🎯 ${g.name || '目標'}</h3><span class="num">${yen(g.amount)}</span></div>
    <div class="meter"><i style=${{ width: `${r * 100}%`, background: 'var(--accent)' }}></i></div>
    <div class="goal-foot"><span>${Math.round(r * 100)}% 達成</span><span>${left > 0 ? `あと ${yen(left)}` : '達成しました 🎉'}</span></div>
    ${left > 0 && months != null && months > 0 && html`<small class="muted">${g.date.slice(0, 4)}年${+g.date.slice(5, 7)}月まで あと${months}か月 → 毎月 約${yen(Math.ceil(left / months))} ずつ</small>`}
    ${monthlyInv > 0 && html`<small class="muted">いま毎月 約${yen(monthlyInv)} を投資に回しています(直近3か月の平均)</small>`}
  </section>`;
}

export function GoalSheet({ onClose }) {
  const app = useApp();
  const g = getConf().goal || {};
  const [name, setName] = useState(g.name || '');
  const [amount, setAmount] = useState(g.amount ? String(g.amount) : '');
  const [date, setDate] = useState(g.date || '');
  const save = async (close) => {
    await S.setConf({ goal: +amount > 0 ? { name: name.trim(), amount: +amount, date } : null });
    close();
    app.toast(+amount > 0 ? '目標を保存しました' : '目標をはずしました');
  };
  return html`<${Sheet} title="貯める目標" onClose=${onClose} foot=${(close) => html`<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <div class="form">
      <${Field} label="名前(なくてもOK)"><input value=${name} onChange=${(e) => setName(e.target.value)} placeholder="例: 旅行資金" /></${Field}>
      <${Field} label="めざす額" hint="総資産(手元のお金+投資の評価額)がこの額に届くまでを表示します。空にして保存すると、目標をはずせます"><${NumInput} value=${amount} onChange=${setAmount} placeholder="例: 1000000" suffix="円" /></${Field}>
      <${Field} label="いつまでに(なくてもOK)"><input type="date" value=${date} onChange=${(e) => setDate(e.target.value)} /></${Field}>
    </div>
  </${Sheet}>`;
}
