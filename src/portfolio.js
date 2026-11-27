// 資産の中身: 「積立・投信」と「個別株」を分けて並べ、まとめの推移グラフと、個別株の分散(銘柄・業種・口座)を見せる
import React, { useState, useEffect, useMemo } from 'react';
import { html, useApp, Seg, Empty } from './ui.js';
import { LineChart, Donut } from './charts.js';
import { yen, pm, pct, tone, sum, short, groupBy } from './util.js';
import { positions, holdingSeries } from './calc.js';
import { getProfiles, loadProfiles } from './quotes.js';
import { PosRow, PlanRow, shortName, acctSplit, quotesForCalc, refreshQuotes } from './assets.js';
import * as S from './store.js';

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#eda100', '#e87ba4', '#09a5cc', '#a9673c', '#7a9a1e', '#a39d93'];
const KIND = {
  fund: { icon: '🌱', title: '積立・投信', add: 'plan', addLabel: '＋ 積立を登録' },
  stock: { icon: '📈', title: '個別株', add: 'lot', addLabel: '＋ 買った' },
};

const totals = (list) => {
  const value = sum(list, (p) => p.value || 0);
  // 値段がまだ取れていない銘柄は、損益の計算に入れない
  const priced = list.filter((p) => p.value != null);
  const cost = sum(priced, (p) => p.cost || 0);
  return { value, cost: sum(list, (p) => p.cost || 0), pl: value - cost, rate: cost ? (value - cost) / cost : 0, day: sum(list, (p) => p.dayChange || 0), ready: priced.length === list.length };
};

function Row({ p, q }) {
  return p.plan ? html`<${PlanRow} p=${p} q=${q} />` : html`<${PosRow} p=${p} q=${q} />`;
}
function Closed({ list }) {
  const app = useApp();
  if (!list.length) return null;
  return html`<details class="closed"><summary>売り切った銘柄 ${list.length}件・確定した損益 ${pm(sum(list, (p) => p.realized))}円</summary>${list.map((p) => html`<button key=${p.symbol} class="row" onClick=${() => app.go('stock/' + encodeURIComponent(p.symbol))}><span class="rm">${shortName(p.name)}</span><b class=${'num ' + tone(p.realized)}>${pm(p.realized)}円</b></button>`)}</details>`;
}

// ---- 資産タブに並べる2枚
export function Holdings({ pos, q }) {
  const app = useApp();
  return html`<${React.Fragment}>${['fund', 'stock'].map((k) => {
    const K = KIND[k];
    const mine = pos.filter((p) => p.kind === k);
    const open = mine.filter((p) => !p.closed);
    const T = totals(open);
    return html`<section key=${k} class="card">
      <button class="hold-head" onClick=${() => app.go('port/' + k)}>
        <span class="hold-top"><h3>${K.icon} ${K.title}</h3><span class="chev">›</span></span>
        ${open.length > 0 && html`<span class="hold-val"><b class="num">${yen(T.value)}</b><span class=${'num ' + tone(T.pl)}>${pm(T.pl)}円 (${pct(T.rate)})</span></span>
          <span class="hold-more">${k === 'stock' ? '分散の内訳とまとめのグラフを見る' : 'まとめのグラフを見る'}</span>`}
      </button>
      ${k === 'stock' && open.length > 1 && T.value > 0 && html`<div class="stack">${[...open].sort((a, b) => (b.value || 0) - (a.value || 0)).map((p, i) => html`<i key=${p.symbol} title=${shortName(p.name)} style=${{ width: ((p.value || 0) / T.value) * 100 + '%', background: COLORS[i % COLORS.length] }}></i>`)}</div>`}
      ${open.map((p) => html`<${Row} key=${p.symbol} p=${p} q=${q} />`)}
      ${!open.length && html`<p class="muted">${k === 'fund' ? 'オルカンなどの積立を登録すると、毎月の積立日に自動で口数を足して、投資した額と今の評価額を出します。' : '買った銘柄・日・株数・値段を入れると、今いくらになっているかと分散がわかります。'}</p>`}
      <${Closed} list=${mine.filter((p) => p.closed)} />
      <div class="hold-foot"><button class="text-btn" onClick=${() => app.open(K.add)}>${K.addLabel}</button></div>
    </section>`;
  })}</${React.Fragment}>`;
}

// ---- 分散(銘柄・業種・口座)
function Diversity({ open }) {
  const [by, setBy] = useState('name');
  const [picked, setPicked] = useState(null);
  const prof = getProfiles();
  useEffect(() => { loadProfiles(open.map((p) => p.symbol)); }, [open.map((p) => p.symbol).join()]);
  const priced = open.filter((p) => p.value > 0);
  const total = sum(priced, (p) => p.value);
  if (!total) return html`<section class="card"><h3>🧩 分散の内訳</h3><p class="muted">値段を読みこむと、ここに内訳が出ます。</p></section>`;
  const sectorOf = (p) => prof[p.symbol]?.industry || '業種を調べ中';
  const group = (pairs) => [...groupBy(pairs, (x) => x[0])].map(([label, l]) => ({ label, value: sum(l, (x) => x[1]) }));
  const parts = (by === 'name' ? priced.map((p) => ({ label: shortName(p.name), value: p.value }))
    : by === 'sector' ? group(priced.map((p) => [sectorOf(p), p.value]))
    : group(priced.flatMap((p) => acctSplit(p))))
    .sort((a, b) => b.value - a.value)
    .map((x, i) => ({ ...x, key: x.label, color: COLORS[i % COLORS.length], fmt: yen(x.value) }));
  // 事実だけを並べる(売り買いのすすめはしない)
  const names = [...priced].sort((a, b) => b.value - a.value);
  const sectors = group(priced.map((p) => [sectorOf(p), p.value])).sort((a, b) => b.value - a.value);
  const ratio = (v) => Math.round((v / total) * 100) + '%';
  return html`<section class="card">
    <div class="card-h"><h3>🧩 分散の内訳</h3></div>
    <${Seg} small value=${by} onChange=${(v) => { setBy(v); setPicked(null); }} options=${[{ v: 'name', label: '銘柄' }, { v: 'sector', label: '業種' }, { v: 'acct', label: '口座' }]} />
    <div class="donut-wrap port"><${Donut} data=${parts} center=${yen(total)} sub="個別株" picked=${picked} onPick=${setPicked} /></div>
    ${parts.map((x) => html`<button key=${x.key} class=${'bd-row' + (picked === x.key ? ' on' : '')} onClick=${() => setPicked(picked === x.key ? null : x.key)}><span><i style=${{ background: x.color }}></i>${x.label}</span><b class="num">${yen(x.value)}</b><em>${ratio(x.value)}</em></button>`)}
    ${by === 'sector' && picked && html`<p class="muted small">${picked}: ${priced.filter((p) => sectorOf(p) === picked).map((p) => shortName(p.name)).join('・')}</p>`}
    <ul class="div-facts">
      <li>${priced.length}銘柄・${sectors.length}業種に分かれています</li>
      <li>いちばん大きい銘柄は ${shortName(names[0].name)} で、全体の ${ratio(names[0].value)}</li>
      ${names.length > 3 && html`<li>上位3銘柄で、全体の ${ratio(sum(names.slice(0, 3), (p) => p.value))}</li>`}
      ${names.length > 1 && html`<li>${shortName(names[0].name)} が10%下がると、個別株全体では 約${yen(names[0].value * 0.1)}(${((names[0].value * 10) / total).toFixed(1)}%)の減り</li>`}
    </ul>
  </section>`;
}

// ---- 「積立・投信」「個別株」それぞれのまとめ画面
export function PortfolioPage({ kind, qv }) {
  const app = useApp();
  const K = KIND[kind];
  const [range, setRange] = useState(182);
  const q = quotesForCalc();
  const fx = q['JPY=X']?.cur;
  const pos = positions(q, fx).filter((p) => p.kind === kind);
  const open = pos.filter((p) => !p.closed);
  const T = totals(open);
  const syms = pos.map((p) => p.symbol);
  // 売り切った銘柄は values に出ないので、記録からも銘柄を集める
  const all = [...new Set([...syms, ...S.all('lot').map((l) => l.symbol).filter((s) => /^[0-9A-Z]{8}$/.test(s) === (kind === 'fund'))])];
  useEffect(() => { refreshQuotes(); }, []);
  const series = useMemo(() => holdingSeries(all, q, fx, range), [S.getVersion(), qv, range, all.join(), Object.keys(q).length]);
  return html`<div class="page assets">
    <header class="top"><button class="icon-btn" onClick=${() => history.back()} aria-label="もどる">‹</button><h1>${K.title}</h1><span class="bar-r"></span></header>
    ${!open.length && !series.length ? html`<${Empty} icon=${K.icon} title="まだ登録がありません"><button class="btn small" onClick=${() => app.open(K.add)}>${K.addLabel}</button></${Empty}>` : html`<${React.Fragment}>
    <section class="card hero">
      <div class="label">${K.title}の評価額</div>
      <div class="num hero-num">${yen(T.value)}</div>
      <div class="pl-grid">
        <div><span>投資した元本</span><b class="num">${yen(T.cost)}</b></div>
        <div><span>含み損益</span><b class=${'num ' + tone(T.pl)}>${pm(T.pl)}円 <em>${pct(T.rate)}</em></b></div>
        <div><span>前日比</span><b class=${'num ' + tone(T.day)}>${pm(T.day)}円</b></div>
        ${sum(pos, (p) => p.realized || 0) ? html`<div><span>売って確定した損益</span><b class=${'num ' + tone(sum(pos, (p) => p.realized || 0))}>${pm(sum(pos, (p) => p.realized || 0))}円</b></div>` : null}
      </div>
      <${Seg} small value=${range} onChange=${setRange} options=${[{ v: 30, label: '1か月' }, { v: 91, label: '3か月' }, { v: 182, label: '6か月' }, { v: 365, label: '1年' }]} />
      <${LineChart} xs=${series.map((x) => x.ts)} height=${200}
        fmtX=${(t, full) => { const d = new Date(t); return (full ? d.getFullYear() + '/' : '') + `${d.getMonth() + 1}/${d.getDate()}`; }}
        fmtY=${(v, full) => (full ? yen(v) : short(v))}
        series=${[{ key: 'v', label: '評価額', color: 'var(--c-inv)', values: series.map((x) => x.value), area: true }, { key: 'c', label: '投資した元本', color: 'var(--ink3)', values: series.map((x) => x.cost), dash: true }]} />
    </section>
    ${kind === 'stock' && open.length > 0 && html`<${Diversity} open=${open} />`}
    <section class="card">
      <div class="card-h"><h3>${K.icon} 銘柄ごと(押すと推移)</h3><button class="text-btn" onClick=${() => app.open(K.add)}>${K.addLabel}</button></div>
      ${open.map((p) => html`<${Row} key=${p.symbol} p=${p} q=${q} />`)}
      <${Closed} list=${pos.filter((p) => p.closed)} />
    </section>
    </${React.Fragment}>`}
    <div class="bottom-space"></div>
  </div>`;
}
