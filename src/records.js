// カレンダー: 月の選択・収入/支出/合計・月曜はじまりのカレンダー・日ごとの一覧(MoneyNote と同じ並び)
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { html, useApp, Empty } from './ui.js';
import { TxRow } from './home.js';
import { yen, today, periodKeyOf, addMonths, parseD, addDays, groupBy, sum, fold, mdw, catList, md } from './util.js';
import { txs, summary, getConf, upcoming, insights } from './calc.js';
import * as S from './store.js';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
export const rangeLabel = (s) => `(${+s.start.slice(5, 7)}月${+s.start.slice(8)}日〜${+s.end.slice(5, 7)}月${+s.end.slice(8)}日)`;

// 月の選択(‹ 2026年11月 (11月1日〜11月30日) ›)
export function MonthPill({ s, onPrev, onNext, onToday }) {
  return html`<div class="mpill">
    <button class="mp-b" onClick=${onPrev} aria-label="前の月">‹</button>
    <button class="mp-c" onClick=${onToday}><b>${s.key.slice(0, 4)}年${+s.key.slice(5)}月</b><small>${rangeLabel(s)}</small></button>
    <button class="mp-b" onClick=${onNext} aria-label="次の月">›</button>
  </div>`;
}

export function Records() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const [key, setKey] = useState(periodKeyOf(today(), conf.startDay));
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [searchOn, setSearchOn] = useState(false);
  const s = summary(list, key, conf);
  const isCur = key === periodKeyOf(today(), conf.startDay);
  const tips = useMemo(() => insights(list, conf), [S.getVersion()]);
  const todo = tips.filter((x) => x.level === 'todo');

  const days = [];
  for (let d = s.start; d <= s.end; d = addDays(d, 1)) days.push(d);
  const byDay = groupBy(s.list, (t) => t.date);
  const outOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'out'), (t) => t.amount);
  const inOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'in'), (t) => t.amount);
  const lead = (parseD(s.start).getDay() + 6) % 7; // 月曜はじまり
  const ups = useMemo(() => upcoming(62), [list.length]);
  const upBy = groupBy(ups, (u) => u.date);
  const t0 = today();

  const searching = q.trim() || cat;
  const found = useMemo(() => {
    if (!searching) return [];
    const f = fold(q);
    return list.filter((t) => (!cat || t.cat === cat) && (!f || fold(`${t.memo} ${t.cat} ${t.amount}`).includes(f))).slice(0, 300);
  }, [q, cat, list.length]);
  const shown = searching ? found : s.list;
  const dlistRef = useRef(null);
  // 日付を押すと、下の一覧のその日へ移る
  const pickDay = (d) => {
    const next = sel === d ? null : d;
    setSel(next);
    if (!next) return;
    requestAnimationFrame(() => {
      const el = dlistRef.current?.querySelector(`[data-day="${next}"]`) || dlistRef.current;
      el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const grouped = [...groupBy(shown, (t) => t.date)];

  // 予算(あと使える額)
  const budget = conf.budget || 0;
  const total = (parseD(s.end) - parseD(s.start)) / 864e5 + 1;
  const elapsed = isCur ? (parseD(t0) - parseD(s.start)) / 864e5 + 1 : total;
  const left = budget - s.out;
  const daysLeft = Math.max(1, total - elapsed + 1);

  return html`<div class="page records">
    <header class="bar"><span class="bar-l"></span><h1>カレンダー</h1><button class="icon-btn" onClick=${() => { setSearchOn(!searchOn); if (searchOn) { setQ(''); setCat(''); } }} aria-label="さがす">${searchOn ? '✕' : '🔍'}</button></header>
    ${searchOn && html`<div class="search">
      <input type="search" placeholder="メモ・カテゴリ・金額でさがす" value=${q} onChange=${(e) => setQ(e.target.value)} />
      <select value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="カテゴリでしぼる">
        <option value="">すべて</option>
        ${[...catList('out', conf), ...catList('in', conf)].map((c) => html`<option key=${c.id} value=${c.id}>${c.icon} ${c.id}</option>`)}
      </select>
    </div>`}
    <${MonthPill} s=${s} onPrev=${() => { setKey(addMonths(key, -1)); setSel(null); }} onNext=${() => { setKey(addMonths(key, 1)); setSel(null); }} onToday=${() => { setKey(periodKeyOf(today(), conf.startDay)); setSel(null); }} />
    ${!searching && html`<div class="sum3"><div><span>収入</span><b class="num in">${yen(s.in)}</b></div><div><span>支出</span><b class="num out">${yen(s.out)}</b></div><div><span>合計</span><b class=${'num ' + (s.in - s.out >= 0 ? 'in' : 'out')}>${yen(s.in - s.out, true)}</b></div></div>`}
    ${!searching && s.inv > 0 && html`<div class="inv-line">投資へ <b class="num inv">${yen(s.inv)}</b>(支出にはふくめていません)</div>`}
    ${!searching && budget > 0 && html`<div class=${'budget-strip' + (left < 0 ? ' over' : '')}><span>${isCur ? '今月あと使える' : '予算の残り'}</span><b class="num">${yen(left)}</b>${isCur && left > 0 ? html`<small>1日 ${yen(left / daysLeft)}・残り${Math.round(daysLeft)}日</small>` : left < 0 ? html`<small>予算オーバー</small>` : null}</div>`}
    ${!searching && todo.length > 0 && html`<button class="todo-strip" onClick=${() => (todo[0].tx ? app.edit(S.getOne(todo[0].tx)) : app.go(todo[0].go || 'recs'))}>📝 確認してほしいこと ${todo.length}件<span class="chev">›</span></button>`}
    ${!searching && html`<div class="cal">
      <div class="cal-grid head">${WEEK.map((w, i) => html`<span key=${w} class=${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}>${w}</span>`)}</div>
      <div class="cal-grid body">
        ${Array.from({ length: lead }, (_, i) => html`<span key=${'b' + i} class="cd blank"></span>`)}
        ${days.map((d) => {
          const o = outOf(d), inc = inOf(d);
          const fut = d > t0;
          const plan = upBy.get(d);
          const dow = (parseD(d).getDay() + 6) % 7;
          return html`<button key=${d} class=${'cd' + (d === t0 ? ' today' : '') + (sel === d ? ' sel' : '') + (fut ? ' fut' : '')} onClick=${() => pickDay(d)}>
            <span class=${'cdn' + (dow === 6 ? ' sun' : dow === 5 ? ' sat' : '')}>${+d.slice(8)}</span>
            ${inc > 0 && html`<span class="cdi num">${inc.toLocaleString('ja-JP')}円</span>`}
            ${o > 0 && html`<span class="cdo num">${o.toLocaleString('ja-JP')}円</span>`}
            ${fut && plan && html`<span class="cdp" title=${plan.map((p) => p.rec?.name || p.plan?.name).join('・')}>●</span>`}
          </button>`;
        })}
        ${Array.from({ length: (7 - ((lead + days.length) % 7)) % 7 }, (_, i) => html`<span key=${'e' + i} class="cd blank"></span>`)}
      </div>
    </div>`}
    ${sel && !searching && html`<div class="sel-bar"><b>${mdw(sel)}</b><span>支出 ${yen(outOf(sel))}</span><button class="chip" onClick=${() => app.edit(null, { date: sel })}>＋ この日に記録</button><button class="icon-btn" onClick=${() => setSel(null)}>✕</button></div>`}
    ${sel && !searching && (upBy.get(sel) || []).map((u, i) => html`<div key=${i} class="row plan"><span class="ri">🗓️</span><span class="rm"><span class="rt">${u.rec?.name || u.plan?.name + ' 積立'}</span><small>予定</small></span><b class="num">${yen(u.amount)}</b></div>`)}
    <div class="dlist" ref=${dlistRef}>
      ${grouped.length ? grouped.map(([d, l]) => html`<div key=${d} data-day=${d} class=${'day-group' + (sel === d && !searching ? ' picked' : '')}>
        <div class="day-h"><span>${d.slice(0, 4)}年${md(d).replace('/', '月')}日(${mdw(d).slice(-2, -1)})</span><span class="num">${sum(l.filter((x) => x.type === 'out'), (x) => x.amount) ? yen(sum(l.filter((x) => x.type === 'out'), (x) => x.amount)) : ''}</span></div>
        ${l.map((t) => html`<${TxRow} key=${t.id} t=${t} conf=${conf} showDate=${false} />`)}
      </div>`) : html`<${Empty} icon="🗒️" title=${searching ? '見つかりませんでした' : 'この月の記録はまだありません'} body=${searching ? '' : '下の「入力」から記録できます'} />`}
      ${searching && found.length > 0 && html`<div class="found-sum">${found.length}件・支出 ${yen(sum(found.filter((t) => t.type === 'out'), (t) => t.amount))}</div>`}
    </div>
    <div class="bottom-space"></div>
  </div>`;
}
