// レポート: 数字 → グラフ → カテゴリ の順に見る。くわしいこと(推移・ヒント・見通し)は1段下の画面に
import React, { useState, useMemo } from 'react';
import { html, useApp, Seg, Empty, PageHead } from './ui.js';
import { Donut, Bars } from './charts.js';
import { CatIcon } from './icons.js';
import { TxRow } from './home.js';
import { MonthPill, YearPill, Sum3 } from './records.js';
import { yen, pct, today, periodKeyOf, periodOf, addMonths, sum, catInfo, short, md, mdw, groupBy } from './util.js';
import { txs, summary, getConf, insights, nextMonthPlan, monthLabel } from './calc.js';
import * as S from './store.js';

const mergeCats = (arrs) => {
  const m = new Map();
  for (const a of arrs) for (const r of a) { const x = m.get(r.cat) || { cat: r.cat, amount: 0, n: 0 }; x.amount += r.amount; x.n += r.n; m.set(r.cat, x); }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
};
// 月ごとの集計をまとめて、1年・全期間の集計にする
const merge = (ss) => ({
  key: ss[0].key, start: ss[0].start, end: ss[ss.length - 1].end,
  list: ss.flatMap((x) => x.list),
  out: sum(ss, (x) => x.out), in: sum(ss, (x) => x.in), inv: sum(ss, (x) => x.inv), fixed: sum(ss, (x) => x.fixed), variable: sum(ss, (x) => x.variable),
  byCat: mergeCats(ss.map((x) => x.byCat)), incByCat: mergeCats(ss.map((x) => x.incByCat)),
});

// 見ていた期間を覚えておく(カテゴリ画面から戻ってきたとき、同じ場所に戻る)
const memory = { view: 'month', key: null, yr: null, mode: 'out' };

function useRange(conf, list) {
  const curKey = periodKeyOf(today(), conf.startDay);
  const firstKey = list.length ? periodKeyOf(list[list.length - 1].date, conf.startDay) : curKey;
  const keysOf = (view, key, yr) => {
    if (view === 'month') return [key];
    if (view === 'year') return Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`);
    const o = [];
    for (let k = firstKey; k <= curKey; k = addMonths(k, 1)) o.push(k);
    return o;
  };
  return { curKey, firstKey, keysOf };
}

export function Report({ start }) {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const { curKey, firstKey, keysOf } = useRange(conf, list);
  const [st, setSt] = useState(() => {
    if (start) memory.view = start;
    return { ...memory, key: memory.key || curKey, yr: memory.yr || +curKey.slice(0, 4) };
  });
  const set = (patch) => { Object.assign(memory, st, patch); setSt({ ...st, ...patch }); setPicked(null); };
  const { view, key, yr, mode } = st;
  const isM = view === 'month';
  const [picked, setPicked] = useState(null);
  const sums = useMemo(() => keysOf(view, key, yr).map((k) => summary(list, k, conf)), [view, key, yr, S.getVersion()]);
  const s = isM ? sums[0] : merge(sums.length ? sums : [summary(list, curKey, conf)]);
  const tips = useMemo(() => insights(list, conf), [S.getVersion()]);
  const next = useMemo(() => nextMonthPlan(list, conf), [S.getVersion()]);

  const rows = mode === 'out' ? s.byCat : s.incByCat;
  const tot = mode === 'out' ? s.out : s.in;
  const donut = rows.map((r) => ({ key: r.cat, label: r.cat, value: r.amount, color: catInfo(r.cat, conf).color, fmt: yen(r.amount) }));
  const months = sums.filter((x) => x.out > 0 || x.in > 0).length || 1;
  const budget = conf.budget || 0;
  const itemN = s.list.filter((t) => t.items?.length).length;
  const openCat = (cat) => app.go(['cat', mode, encodeURIComponent(cat), s.start, s.end].join('/'));
  const link = (label, to, value) => html`<button class="row" onClick=${() => app.go(to)}><span class="rm"><span class="rt">${label}</span></span>${value && html`<span class="rv"><em class="num">${value}</em></span>`}<span class="chev">›</span></button>`;

  return html`<div class="page report">
    <header class="bar"><span class="bar-l"></span><${Seg} value=${view} onChange=${(v) => set({ view: v })} options=${[{ v: 'month', label: '月間' }, { v: 'year', label: '年間' }, { v: 'all', label: '全期間' }]} /><span class="bar-r"></span></header>
    ${isM && html`<${MonthPill} s=${s} onPrev=${() => set({ key: addMonths(key, -1) })} onNext=${() => set({ key: addMonths(key, 1) })} onToday=${() => set({ key: curKey })} />`}
    ${view === 'year' && html`<${YearPill} year=${yr} onChange=${(y) => set({ yr: y })} />`}
    ${view === 'all' && html`<div class="mpill"><div class="mp-c"><b>全期間</b><small>(${+firstKey.slice(0, 4)}年${+firstKey.slice(5)}月〜いま)</small></div></div>`}

    <div class="box2"><div><span>支出</span><b class="num out">${yen(s.out)}</b></div><div><span>収入</span><b class="num in">${yen(s.in)}</b></div></div>
    <div class="box1"><span>収支</span><b class=${'num ' + (s.in - s.out >= 0 ? 'in' : 'out')}>${yen(s.in - s.out, true)}</b></div>
    ${!isM && html`<div class="per-month">1か月あたり 支出 ${yen(s.out / months)}・収入 ${yen(s.in / months)}</div>`}

    <div class="utabs" role="tablist">${[['out', '支出'], ['in', '収入']].map(([v, l]) => html`<button key=${v} role="tab" aria-selected=${mode === v} class=${mode === v ? 'on' : ''} onClick=${() => set({ mode: v })}>${l}</button>`)}</div>
    ${rows.length ? html`
      <div class="donut-wrap"><${Donut} data=${donut} size=${230} thick=${52} labels center=${yen(tot)} sub=${mode === 'out' ? '支出' : '収入'} picked=${picked} onPick=${setPicked} /></div>
      <div class="sec flush">${rows.map((r) => html`<button key=${r.cat} class="row cat-row" onClick=${() => openCat(r.cat)}>
        <span class="ri"><${CatIcon} id=${r.cat} conf=${conf} /></span>
        <span class="rm"><span class="rt">${r.cat}</span></span>
        <span class="rv"><b class="num">${yen(r.amount)}</b><em class="num">${((r.amount / (tot || 1)) * 100).toFixed(1)}%</em></span><span class="chev">›</span></button>`)}</div>`
      : html`<${Empty} title=${`この期間の${mode === 'out' ? '支出' : '収入'}はまだありません`} />`}

    <h4 class="grp">もっとくわしく</h4>
    <div class="sec flush">
      ${link('月ごとの推移', 'trend')}
      ${link('予算', 'budget', budget > 0 && isM ? (budget - s.out >= 0 ? `あと ${yen(budget - s.out)}` : `${yen(s.out - budget)} 超過`) : '')}
      ${link('買ったもの', 'items', itemN ? `内訳つき ${itemN}件` : '')}
      ${link('固定費・サブスク', 'recs', s.fixed ? yen(s.fixed) : '')}
      ${isM && link('見直しのヒント', 'tips', tips.length ? `${tips.length}件` : '')}
      ${isM && link(`${+next.key.slice(5)}月の見通し`, 'forecast', next.fixedOut + next.variable ? yen(next.fixedOut + next.variable) : '')}
    </div>
    ${s.inv > 0 && html`<p class="fine">この期間に「投資へ」回した ${yen(s.inv)} は、支出にふくめていません。</p>`}
    <div class="bottom-space"></div>
  </div>`;
}

// ---- カテゴリ1つ: 合計 → 月ごとの動き → 記録(押すと中身)
export function CatPage({ mode, cat, start, end }) {
  const conf = getConf();
  const list = txs();
  const of = (t) => t.type === mode && (t.cat || (mode === 'in' ? 'その他収入' : 'その他')) === cat;
  const rows = list.filter((t) => of(t) && t.date >= start && t.date <= end);
  const total = sum(rows, (t) => t.amount);
  const endKey = periodKeyOf(end < today() ? end : today(), conf.startDay);
  const keys = Array.from({ length: 6 }, (_, i) => addMonths(endKey, i - 5));
  const vals = keys.map((k) => { const p = periodOf(k, conf.startDay); return sum(list.filter((t) => of(t) && t.date >= p.start && t.date <= p.end), (t) => t.amount); });
  const [limit, setLimit] = useState(100);
  const budget = mode === 'out' ? conf.catBudgets?.[cat] : 0;
  const oneMonth = (new Date(end) - new Date(start)) / 864e5 < 32;
  const prev = vals.slice(2, 5).filter((v) => v > 0);
  const avg = prev.length ? sum(prev) / prev.length : 0;
  return html`<div class="page catpage">
    <${PageHead} title=${cat} />
    <div class="totalbox"><div class="label">${md(start)}(${start.slice(0, 4)}年)〜 ${md(end)}・${rows.length}件</div>
      <div class=${'num hero-num ' + mode}>${yen(total)}</div>
      <div class="deltas">
        ${oneMonth && avg > 0 && html`<span>前の3か月の平均<b class="num">${yen(avg)}</b>(${pct((total - avg) / avg, 0)})</span>`}
        ${oneMonth && budget > 0 && html`<span>予算 ${yen(budget)}<b class=${'num ' + (budget < total ? 'out' : '')}>${budget >= total ? `あと ${yen(budget - total)}` : `${yen(total - budget)} 超過`}</b></span>`}
      </div></div>
    <section class="card">
      <${Bars} labels=${keys.map((k) => +k.slice(5) + '月')} height=${150} fmt=${(v, full) => (full ? yen(v) : short(v))}
        series=${[{ key: 'v', label: cat, color: catInfo(cat, conf).color, values: vals }]} />
    </section>
    <div class="dlist">${[...groupBy(rows.slice(0, limit), (t) => t.date)].map(([d, l]) => html`<div key=${d} class="day-group">
      <div class="day-h"><span>${d.slice(0, 4)}年${md(d).replace('/', '月')}日(${mdw(d).slice(-2, -1)})</span></div>
      ${l.map((t) => html`<${TxRow} key=${t.id} t=${t} conf=${conf} />`)}</div>`)}</div>
    ${rows.length > limit && html`<button class="text-btn" onClick=${() => setLimit(limit + 200)}>もっと見る(あと${rows.length - limit}件)</button>`}
    ${!rows.length && html`<${Empty} title="この期間の記録はありません" />`}
    <div class="bottom-space"></div>
  </div>`;
}

// ---- 月ごとの推移
export function TrendPage() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const { curKey, firstKey, keysOf } = useRange(conf, list);
  const [span, setSpan] = useState(6);
  const [pick, setPick] = useState(null);
  const keys = span ? Array.from({ length: span }, (_, i) => addMonths(curKey, i - span + 1)) : keysOf('all');
  const ms = keys.map((k) => summary(list, k, conf));
  const years = [...groupBy(ms, (x) => x.key.slice(0, 4))].map(([y, l]) => merge(l));
  const cols = span ? ms : years;
  const label = (x) => (span ? `${+x.key.slice(5)}月` : `${x.key.slice(0, 4)}年`);
  void firstKey;
  return html`<div class="page trend">
    <${PageHead} title="月ごとの推移" />
    <${Seg} value=${span} onChange=${(v) => { setSpan(v); setPick(null); }} options=${[{ v: 6, label: '6か月' }, { v: 12, label: '1年' }, { v: 0, label: '年ごと' }]} />
    <${Sum3} inc=${sum(ms, (x) => x.in)} out=${sum(ms, (x) => x.out)} />
    <section class="card">
      <${Bars} labels=${cols.map(label)} fmt=${(v, full) => (full ? yen(v) : short(v))}
        series=${[{ key: 'in', label: '収入', color: 'var(--inc)', values: cols.map((x) => x.in) }, { key: 'out', label: '支出', color: 'var(--out)', values: cols.map((x) => x.out) }, { key: 'inv', label: '投資へ', color: 'var(--c-inv)', values: cols.map((x) => x.inv) }]}
        picked=${pick} onPick=${(i) => setPick(pick === i ? null : i)} />
      <div class="table-mini">
        <div class="tm-h"><span></span><span>収入</span><span>支出</span><span>残せた</span></div>
        ${cols.slice().reverse().map((x) => html`<button key=${x.key} class="tm-r" style=${{ width: '100%' }} onClick=${() => { if (!span) return; memory.view = 'month'; memory.key = x.key; app.go('report'); }}><span>${label(x)}</span><span class="num">${short(x.in)}</span><span class="num">${short(x.out)}</span><span class=${'num ' + (x.in - x.out >= 0 ? 'in' : 'out')}>${x.in ? Math.round(((x.in - x.out) / x.in) * 100) + '%' : '—'}</span></button>`)}
      </div>
    </section>
    <div class="bottom-space"></div>
  </div>`;
}

// ---- 見直しのヒント
export function TipsPage() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const tips = useMemo(() => insights(list, conf), [S.getVersion()]);
  const key = periodKeyOf(today(), conf.startDay);
  const askClaude = () => {
    const s = summary(list, key, conf);
    const prevs = [1, 2, 3].map((i) => summary(list, addMonths(key, -i), conf)).filter((p) => p.out > 0);
    const avgOf = (c) => (prevs.length ? sum(prevs, (p) => p.byCat.find((x) => x.cat === c)?.amount || 0) / prevs.length : null);
    const text = [
      `家計簿の${monthLabel(key)}のまとめです。来月どこを削れるか、具体的に3つ提案してください。`,
      `収入 ${yen(s.in)} / 支出 ${yen(s.out)}(固定費 ${yen(s.fixed)}・変動費 ${yen(s.variable)})/ 投資へ ${yen(s.inv)}`,
      '支出の内訳: ' + s.byCat.map((c) => `${c.cat} ${yen(c.amount)}(${c.n}回${avgOf(c.cat) != null ? `・3か月平均 ${yen(avgOf(c.cat))}` : ''})`).join('、'),
      '固定費・サブスク: ' + S.all('rec').filter((r) => r.active !== false && (r.type || 'out') === 'out').map((r) => `${r.name} ${yen(r.amount)}/${(+r.every || 1) === 12 ? '年' : (+r.every || 1) === 2 ? '2か月' : '月'}`).join('、'),
    ].join('\n');
    try { navigator.clipboard.writeText(text); } catch { /* なし */ }
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank');
  };
  return html`<div class="page tips">
    <${PageHead} title="見直しのヒント" />
    ${tips.length ? html`<div class="sec">${tips.map((x) => html`<div key=${x.k} class="tip-row" onClick=${() => (x.tx ? app.edit(S.getOne(x.tx)) : x.go && app.go(x.go))}><span class="ti">${x.icon}</span><span><b>${x.title}</b><small>${x.body}</small></span>${x.save ? html`<em class="save">−${short(x.save)}</em>` : null}</div>`)}</div>`
      : html`<${Empty} title="いまはヒントがありません" body="記録が1〜2か月たまると、いつもより増えたもの・小さな出費の積み重ねなどを知らせます。" />`}
    <button class="btn wide" onClick=${askClaude}>Claudeに来月の節約を相談する</button>
    <div class="bottom-space"></div>
  </div>`;
}

// ---- 来月の見通し
export function ForecastPage() {
  const app = useApp();
  const conf = getConf();
  const next = nextMonthPlan(txs(), conf);
  return html`<div class="page forecastpage">
    <${PageHead} title=${`${monthLabel(next.key)}の見通し`} />
    <div class="totalbox"><div class="label">支出の目安</div><div class="num hero-num">${yen(next.fixedOut + next.variable)}</div></div>
    <section class="card"><div class="forecast">
      <div><span>決まっている支出</span><b class="num">${yen(next.fixedOut)}</b></div>
      <div><span>ふだんの変動費(3か月平均)</span><b class="num">${yen(next.variable)}</b></div>
      ${next.fixedIn > 0 && html`<div><span>決まっている収入</span><b class="num in">${yen(next.fixedIn)}</b></div>`}
    </div></section>
    ${next.items.length > 0 && html`<div class="sec">${next.items.filter((i) => (i.rec.type || 'out') === 'out').map((i, k) => html`<div key=${k} class="row"><span class="ri"><${CatIcon} id=${i.rec.cat} conf=${conf} /></span><span class="rm"><span class="rt">${i.rec.name}</span><small>${md(i.date)}${(+i.rec.every || 1) === 12 ? '・年1回' : (+i.rec.every || 1) === 2 ? '・2か月ごと' : ''}${i.rec.variable ? '・金額は目安' : ''}</small></span><b class="num">${yen(i.amount)}</b></div>`)}</div>`}
    ${!next.items.length && html`<p class="muted">家賃・サブスク・ボイトレなど毎月決まった支払いを登録すると、来月いくら出ていくかが分かります。</p>`}
    <button class="text-btn" onClick=${() => app.go('recs')}>固定費・サブスクを登録する ›</button>
    <div class="bottom-space"></div>
  </div>`;
}
