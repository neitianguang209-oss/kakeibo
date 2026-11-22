// 分析: 何に使ったか(円グラフ)・月ごとの推移・見直しのヒント・来月の見通し
import React, { useState, useMemo } from 'react';
import { html, useApp, Seg, Empty } from './ui.js';
import { Donut, Bars, Meter } from './charts.js';
import { MonthPill } from './records.js';
import { yen, pct, today, periodKeyOf, addMonths, sum, catInfo, GROUPS, short, jpDay, md } from './util.js';
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
  out: sum(ss, (x) => x.out), in: sum(ss, (x) => x.in), inv: sum(ss, (x) => x.inv), fixed: sum(ss, (x) => x.fixed), variable: sum(ss, (x) => x.variable),
  byCat: mergeCats(ss.map((x) => x.byCat)), incByCat: mergeCats(ss.map((x) => x.incByCat)),
});

export function Report({ start }) {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const curKey = periodKeyOf(today(), conf.startDay);
  const [key, setKey] = useState(curKey);
  const [view, setView] = useState(start === 'year' ? 'year' : start === 'all' ? 'all' : 'month');
  const [yr, setYr] = useState(+curKey.slice(0, 4));
  const isM = view === 'month';
  const [mode, setMode] = useState('out');
  const [picked, setPicked] = useState(null);
  const [span, setSpan] = useState(6);
  const firstKey = list.length ? periodKeyOf(list.reduce((a, t) => (t.date < a ? t.date : a), list[0].date), conf.startDay) : curKey;
  const keysOf = (a, b) => { const o = []; for (let k = a; k <= b; k = addMonths(k, 1)) o.push(k); return o; };
  const spanKeys = view === 'year' ? Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`) : view === 'all' ? keysOf(firstKey, curKey) : [];
  const spanSums = useMemo(() => spanKeys.map((k) => summary(list, k, conf)), [view, yr, S.getVersion()]);
  const s = isM ? summary(list, key, conf) : merge(spanSums.length ? spanSums : [summary(list, key, conf)]);
  const prevs = !isM ? [] : [1, 2, 3].map((i) => summary(list, addMonths(key, -i), conf)).filter((p) => p.out > 0);
  const avgOf = (cat) => (prevs.length ? sum(prevs, (p) => p.byCat.find((x) => x.cat === cat)?.amount || 0) / prevs.length : null);
  const tips = useMemo(() => insights(list, conf), [S.getVersion()]);
  const next = useMemo(() => nextMonthPlan(list, conf), [S.getVersion()]);

  const rows = mode === 'out' ? s.byCat : s.incByCat;
  const tot = mode === 'out' ? s.out : s.in;
  const donut = rows.map((r) => {
    const c = catInfo(r.cat, conf);
    return { key: r.cat, label: r.cat, value: r.amount, color: c.color, icon: c.icon, fmt: yen(r.amount) };
  });

  // 推移
  const months = isM ? Array.from({ length: span }, (_, i) => addMonths(key, -(span - 1 - i))) : view === 'year' ? spanKeys : [...new Set(spanKeys.map((k) => k.slice(0, 4)))];
  const ms = isM ? months.map((m) => summary(list, m, conf)) : view === 'year' ? spanSums : months.map((y) => merge(spanSums.filter((x) => x.key.startsWith(y))));
  const labelOf = (m) => (view === 'all' ? m + '年' : +m.slice(5) + '月');
  const bestMonth = !isM && spanSums.length ? spanSums.reduce((a, x) => (x.out > a.out ? x : a), spanSums[0]) : null;
  const activeMonths = !isM ? spanSums.filter((x) => x.out > 0 || x.in > 0).length || 1 : 1;
  const [pickM, setPickM] = useState(null);

  // グループ別(固定費・変動費)
  const byGroup = new Map();
  for (const r of s.byCat) {
    const g = catInfo(r.cat, conf).g;
    byGroup.set(g, (byGroup.get(g) || 0) + r.amount);
  }

  const askClaude = () => {
    const lines = [
      `家計簿の${monthLabel(key)}のまとめです。来月どこを削れるか、具体的に3つ提案してください。`,
      `収入 ${yen(s.in)} / 支出 ${yen(s.out)}(固定費 ${yen(s.fixed)}・変動費 ${yen(s.variable)})/ 投資へ ${yen(s.inv)}`,
      '支出の内訳: ' + s.byCat.map((c) => `${c.cat} ${yen(c.amount)}(${c.n}回${avgOf(c.cat) != null ? `・3か月平均 ${yen(avgOf(c.cat))}` : ''})`).join('、'),
      '固定費・サブスク: ' + S.all('rec').filter((r) => r.active !== false && (r.type || 'out') === 'out').map((r) => `${r.name} ${yen(r.amount)}/${(+r.every || 1) === 12 ? '年' : (+r.every || 1) === 2 ? '2か月' : '月'}`).join('、'),
    ];
    const text = lines.join('\n');
    try { navigator.clipboard.writeText(text); } catch { /* なし */ }
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank');
  };

  return html`<div class="page report">
    <header class="bar"><span class="bar-l"></span><h1>レポート</h1><span class="bar-r"></span></header>
    <div class="view-seg"><${Seg} value=${view} onChange=${(v) => { setView(v); setPicked(null); setPickM(null); }} options=${[{ v: 'month', label: '月間' }, { v: 'year', label: '年間' }, { v: 'all', label: '全期間' }]} /></div>
    ${isM && html`<${MonthPill} s=${s} onPrev=${() => { setKey(addMonths(key, -1)); setPicked(null); }} onNext=${() => { setKey(addMonths(key, 1)); setPicked(null); }} onToday=${() => setKey(periodKeyOf(today(), conf.startDay))} />`}
    ${view === 'year' && html`<div class="mpill"><button class="mp-b" onClick=${() => setYr(yr - 1)} aria-label="前の年">‹</button><button class="mp-c" onClick=${() => setYr(+curKey.slice(0, 4))}><b>${yr}年</b><small>(1月〜12月)</small></button><button class="mp-b" onClick=${() => setYr(yr + 1)} aria-label="次の年">›</button></div>`}
    ${view === 'all' && html`<div class="mpill"><div class="mp-c"><b>全期間</b><small>(${+firstKey.slice(0, 4)}年${+firstKey.slice(5)}月〜いま)</small></div></div>`}
    <section class="rhero">
      <div class="rh-top"><span>収支</span><b class=${'num ' + (s.in - s.out >= 0 ? 'in' : 'out')}>${yen(s.in - s.out, true)}</b></div>
      <div class="rh-two"><div class="out"><span>支出</span><b class="num out">${yen(s.out)}</b></div><div class="in"><span>収入</span><b class="num in">${yen(s.in)}</b></div></div>
      ${s.inv > 0 && html`<small>投資へ ${yen(s.inv)}(支出にはふくめていません)</small>`}
      ${!isM && html`<small>1か月あたり 支出 ${yen(Math.round(s.out / activeMonths))}・収入 ${yen(Math.round(s.in / activeMonths))}${bestMonth && bestMonth.out > 0 ? `・いちばん使った月 ${monthLabel(bestMonth.key)}(${yen(bestMonth.out)})` : ''}</small>`}
    </section>
    <div class="utabs" role="tablist"><button role="tab" aria-selected=${mode === 'out'} class=${mode === 'out' ? 'on' : ''} onClick=${() => { setMode('out'); setPicked(null); }}>支出</button><button role="tab" aria-selected=${mode === 'in'} class=${mode === 'in' ? 'on in' : ''} onClick=${() => { setMode('in'); setPicked(null); }}>収入</button></div>
    <section class="card">
      ${rows.length ? html`<div class="donut-wrap"><${Donut} data=${donut} center=${yen(tot)} sub=${mode === 'out' ? '支出' : '収入'} picked=${picked} onPick=${setPicked} /></div>
        <div class="cat-list">
          ${rows.map((r) => {
            const c = catInfo(r.cat, conf);
            const avg = mode === 'out' && isM ? avgOf(r.cat) : null;
            const b = isM ? conf.catBudgets?.[r.cat] : null;
            const diff = avg != null && avg > 0 ? (r.amount - avg) / avg : null;
            return html`<button key=${r.cat} class=${'cat-row' + (picked === r.cat ? ' on' : '')} onClick=${() => setPicked(picked === r.cat ? null : r.cat)}>
              <span class="ri" style=${{ '--cc': c.color }}>${c.icon}</span>
              <span class="cr-main"><span class="cr-top"><b>${r.cat}</b><small>${r.n}回</small><span class="num">${yen(r.amount)}</span><em>${Math.round((r.amount / (tot || 1)) * 100)}%</em></span>
                ${b ? html`<${Meter} value=${r.amount} max=${b} color=${c.color} />` : html`<span class="share"><i style=${{ width: Math.max(2, Math.round((r.amount / (tot || 1)) * 100)) + '%', background: c.color }}></i></span>`}
                ${diff != null && Math.abs(diff) >= 0.15 && html`<small class=${diff > 0 ? 'up' : 'down'}>3か月平均より ${pct(diff, 0)}(平均 ${yen(avg)})</small>`}
                ${b ? html`<small>予算 ${yen(b)} ${r.amount > b ? `・${yen(r.amount - b)} オーバー` : `・あと ${yen(b - r.amount)}`}</small>` : null}
              </span></button>`;
          })}
        </div>
        ${mode === 'out' && html`<div class="split">
          <div><span>固定費</span><b class="num">${yen(s.fixed)}</b></div><div><span>変動費</span><b class="num">${yen(s.variable)}</b></div>
          ${[...byGroup].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, v]) => html`<div key=${g}><span><i style=${{ background: GROUPS[g]?.color }}></i>${GROUPS[g]?.name || g}</span><b class="num">${yen(v)}</b></div>`)}
        </div>`}`
      : html`<${Empty} icon="🍩" title="この月の記録はまだありません" />`}
    </section>

    <section class="card">
      <div class="card-h"><h3>${isM ? '月ごとの推移' : view === 'year' ? `${yr}年の月ごとの収支` : '年ごとの収支'}</h3>${isM && html`<${Seg} small value=${span} onChange=${setSpan} options=${[{ v: 6, label: '6か月' }, { v: 12, label: '1年' }]} />`}</div>
      <${Bars} labels=${months.map(labelOf)} fmt=${(v, full) => (full ? yen(v) : short(v))}
        series=${[{ key: 'in', label: '収入', color: 'var(--c-in)', values: ms.map((x) => x.in) }, { key: 'out', label: '支出', color: 'var(--accent)', values: ms.map((x) => x.out) }, { key: 'inv', label: '投資へ', color: 'var(--c-inv)', values: ms.map((x) => x.inv) }]}
        picked=${pickM} onPick=${(i) => setPickM(pickM === i ? null : i)} />
      <div class="table-mini">
        <div class="tm-h"><span></span><span>収入</span><span>支出</span><span>残せた</span></div>
        ${(isM ? ms.slice().reverse().slice(0, 4) : ms).map((x, i) => html`<div key=${i} class="tm-r"><span>${view === 'all' ? x.key.slice(0, 4) + '年' : monthLabel(x.key).slice(5)}</span><span class="num">${short(x.in)}</span><span class="num">${short(x.out)}</span><span class=${'num ' + (x.in - x.out >= 0 ? 'in' : 'over')}>${x.in ? Math.round(((x.in - x.out) / x.in) * 100) + '%' : '—'}</span></div>`)}
      </div>
    </section>

    ${isM && html`<section class="card tips">
      <div class="card-h"><h3>💡 見直しのヒント</h3></div>
      ${tips.length ? tips.map((x) => html`<div key=${x.k} class=${'tip-row ' + x.level} onClick=${() => (x.tx ? app.edit(S.getOne(x.tx)) : x.go && app.go(x.go))}><span class="ti">${x.icon}</span><span><b>${x.title}</b><small>${x.body}</small></span>${x.save ? html`<em class="save">−${short(x.save)}</em>` : null}</div>`) : html`<p class="muted">記録が1〜2か月たまると、いつもより増えたもの・小さな出費の積み重ねなどを知らせます。</p>`}
      <button class="btn wide ghost" onClick=${askClaude}>🤖 Claudeに来月の節約を相談する</button>
    </section>`}

    ${isM && html`<section class="card">
      <div class="card-h"><h3>🗓️ ${monthLabel(next.key)}の見通し</h3></div>
      <div class="forecast">
        <div><span>決まっている支出</span><b class="num">${yen(next.fixedOut)}</b></div>
        <div><span>ふだんの変動費(3か月平均)</span><b class="num">${yen(next.variable)}</b></div>
        ${next.fixedIn > 0 && html`<div><span>決まっている収入</span><b class="num in">${yen(next.fixedIn)}</b></div>`}
        <div class="fc-total"><span>来月の支出の目安</span><b class="num">${yen(next.fixedOut + next.variable)}</b></div>
      </div>
      ${next.items.filter((i) => (i.rec.type || 'out') === 'out').map((i, k) => html`<div key=${k} class="row"><span class="ri">${catInfo(i.rec.cat, conf).icon}</span><span class="rm">${i.rec.name}<small>${md(i.date)}${(+i.rec.every || 1) === 12 ? '・年1回' : (+i.rec.every || 1) === 2 ? '・2か月ごと' : ''}${i.rec.variable ? '・金額は目安' : ''}</small></span><b class="num">${yen(i.amount)}</b></div>`)}
      ${!next.items.length && html`<p class="muted">家賃・サブスク・ボイトレなど毎月決まった支払いを登録すると、来月いくら出ていくかが分かります。</p>`}
      <button class="text-btn" onClick=${() => app.go('recs')}>固定費・サブスクを登録する ›</button>
    </section>`}
    <div class="bottom-space"></div>
  </div>`;
}
