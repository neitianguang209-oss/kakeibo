// 記録: カレンダー(日ごとの支出)と一覧・検索
import React, { useState, useMemo } from 'react';
import { html, useApp, Seg, Empty } from './ui.js';
import { TxRow } from './home.js';
import { yen, today, periodKeyOf, addMonths, parseD, addDays, groupBy, sum, fold, mdw, short, catList, catInfo } from './util.js';
import { txs, summary, getConf, upcoming, monthLabel } from './calc.js';

export function Records() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const [key, setKey] = useState(periodKeyOf(today(), conf.startDay));
  const [view, setView] = useState('cal');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const s = summary(list, key, conf);

  // カレンダー
  const days = [];
  for (let d = s.start; d <= s.end; d = addDays(d, 1)) days.push(d);
  const byDay = groupBy(s.list, (t) => t.date);
  const outOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'out'), (t) => t.amount);
  const inOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'in'), (t) => t.amount);
  const maxOut = Math.max(1, ...days.map(outOf));
  const lead = parseD(s.start).getDay();
  const ups = useMemo(() => upcoming(62), [list.length]);
  const upBy = groupBy(ups, (u) => u.date);

  // 検索(期間をこえて全部から)
  const searching = q.trim() || cat;
  const found = useMemo(() => {
    if (!searching) return [];
    const f = fold(q);
    return list.filter((t) => (!cat || t.cat === cat) && (!f || fold(`${t.memo} ${t.cat} ${t.amount}`).includes(f))).slice(0, 300);
  }, [q, cat, list.length, S_ver(list)]);

  const shown = searching ? found : sel ? byDay.get(sel) || [] : s.list;
  const grouped = [...groupBy(shown, (t) => t.date)];
  const t0 = today();

  return html`<div class="page records">
    <header class="top">
      <button class="month-btn" onClick=${() => { setKey(addMonths(key, -1)); setSel(null); }} aria-label="前の月">‹</button>
      <h1 onClick=${() => { setKey(periodKeyOf(today(), conf.startDay)); setSel(null); }}>${monthLabel(key)}</h1>
      <button class="month-btn" onClick=${() => { setKey(addMonths(key, 1)); setSel(null); }} aria-label="次の月">›</button>
      <button class="icon-btn" onClick=${() => app.open('import')} aria-label="まとめて取り込む" title="まとめて取り込む">⤓</button>
    </header>
    <div class="search">
      <input type="search" placeholder="🔍 メモ・カテゴリ・金額でさがす" value=${q} onChange=${(e) => setQ(e.target.value)} />
      <select value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="カテゴリでしぼる">
        <option value="">すべて</option>
        ${[...catList('out', conf), ...catList('in', conf)].map((c) => html`<option key=${c.id} value=${c.id}>${c.icon} ${c.id}</option>`)}
      </select>
    </div>
    ${!searching && html`<div class="month-sum"><span>収入 <b class="num in">${yen(s.in)}</b></span><span>支出 <b class="num">${yen(s.out)}</b></span><span>差し引き <b class=${'num ' + (s.in - s.out >= 0 ? 'in' : 'over')}>${yen(s.in - s.out)}</b></span></div>
    <${Seg} small value=${view} onChange=${setView} options=${[{ v: 'cal', label: 'カレンダー' }, { v: 'list', label: '一覧' }]} />`}
    ${!searching && view === 'cal' && html`<div class="card cal">
      <div class="cal-grid head">${['日', '月', '火', '水', '木', '金', '土'].map((w, i) => html`<span key=${w} class=${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>${w}</span>`)}</div>
      <div class="cal-grid">
        ${Array.from({ length: lead }, (_, i) => html`<span key=${'b' + i}></span>`)}
        ${days.map((d) => {
          const o = outOf(d), inc = inOf(d);
          const fut = d > t0;
          const plan = upBy.get(d);
          const lv = o ? Math.min(4, Math.ceil((o / maxOut) * 4)) : 0;
          return html`<button key=${d} class=${`cd lv${lv}` + (d === t0 ? ' today' : '') + (sel === d ? ' sel' : '') + (fut ? ' fut' : '')} onClick=${() => setSel(sel === d ? null : d)}>
            <span class="cdn">${+d.slice(8)}</span>
            ${o > 0 && html`<span class="cdo num">${short(o)}</span>`}
            ${inc > 0 && html`<span class="cdi num">+${short(inc)}</span>`}
            ${fut && plan && html`<span class="cdp" title=${plan.map((p) => p.rec?.name || p.plan?.name).join('・')}>●</span>`}
          </button>`;
        })}
      </div>
      <div class="cal-legend"><span><i class="lv2"></i>使った日(濃いほど多い)</span><span><b class="cdp">●</b> これからの定期</span></div>
    </div>`}
    ${sel && !searching && html`<div class="sel-bar"><b>${mdw(sel)}</b><span>支出 ${yen(outOf(sel))}</span><button class="chip" onClick=${() => app.edit(null, { date: sel })}>＋ この日に記録</button><button class="icon-btn" onClick=${() => setSel(null)}>✕</button></div>`}
    ${sel && !searching && (upBy.get(sel) || []).map((u, i) => html`<div key=${i} class="row plan"><span class="ri">🗓️</span><span class="rm">${u.rec?.name || u.plan?.name + ' 積立'}<small>予定</small></span><b class="num">${yen(u.amount)}</b></div>`)}
    <div class="card list">
      ${grouped.length ? grouped.map(([d, l]) => html`<div key=${d} class="day-group">
        <div class="day-h"><span>${mdw(d)}</span><span class="num">${sum(l.filter((x) => x.type === 'out'), (x) => x.amount) ? '−' + yen(sum(l.filter((x) => x.type === 'out'), (x) => x.amount)) : ''}</span></div>
        ${l.map((t) => html`<${TxRow} key=${t.id} t=${t} conf=${conf} showDate=${false} />`)}
      </div>`) : html`<${Empty} icon="🗒️" title=${searching ? '見つかりませんでした' : 'この月の記録はまだありません'} />`}
      ${searching && found.length > 0 && html`<div class="found-sum">${found.length}件・支出 ${yen(sum(found.filter((t) => t.type === 'out'), (t) => t.amount))}</div>`}
    </div>
    <div class="bottom-space"></div>
  </div>`;
}
// 一覧が書きかわったときに検索をやり直すための目印
function S_ver(list) {
  return list.length ? list[0].id + list.length : '';
}
