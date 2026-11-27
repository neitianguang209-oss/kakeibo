// カレンダー: いつ・いくら使ったか。見方は「カレンダー / 週ごと / 月ごと」の3つ。下に収入・支出・合計と日ごとの一覧
import React, { useState, useMemo, useRef } from 'react';
import { html, useApp, Empty, Seg } from './ui.js';
import { Icon } from './icons.js';
import { TxRow } from './home.js';
import { itemText } from './items.js';
import { yen, today, periodKeyOf, addMonths, parseD, addDays, groupBy, sum, fold, mdw, md, catList } from './util.js';
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
export function YearPill({ year, onChange }) {
  return html`<div class="mpill">
    <button class="mp-b" onClick=${() => onChange(year - 1)} aria-label="前の年">‹</button>
    <button class="mp-c" onClick=${() => onChange(+today().slice(0, 4))}><b>${year}年</b><small>(1月〜12月)</small></button>
    <button class="mp-b" onClick=${() => onChange(year + 1)} aria-label="次の年">›</button>
  </div>`;
}
// どの画面でも同じ形の「今月の合計」: 支出・収入・投資、その下に収支(収入−支出)
export const totalTitle = (key, startDay = 1) => (key === periodKeyOf(today(), startDay) ? '今月の合計' : `${+key.slice(5)}月の合計`);
export function Totals({ title, s, compact, onClick, children }) {
  const net = s.in - s.out;
  const body = html`<${React.Fragment}>
    <span class="tt-h"><span>${title}</span><span class="tt-net">収支<b class=${'num ' + (net >= 0 ? 'in' : 'out')}>${yen(net, true)}</b>${onClick && html`<span class="chev">›</span>`}</span></span>
    <span class="tt-3">
      <span><small>支出</small><b class="num out">${yen(s.out)}</b></span>
      <span><small>収入</small><b class="num in">${yen(s.in)}</b></span>
      <span><small>投資</small><b class="num inv">${yen(s.inv)}</b></span>
    </span>
    ${children}
  </${React.Fragment}>`;
  const cls = 'totals' + (compact ? ' compact' : '');
  return onClick ? html`<button class=${cls} onClick=${onClick}>${body}</button>` : html`<div class=${cls}>${body}</div>`;
}

const dayHead = (d, l) => {
  const o = sum(l.filter((x) => x.type === 'out'), (x) => x.amount);
  return html`<div class="day-h"><span>${d.slice(0, 4)}年${md(d).replace('/', '月')}日(${mdw(d).slice(-2, -1)})</span><span class="num">${o ? yen(o) : ''}</span></div>`;
};
function DayList({ list, conf, picked, hl }) {
  return [...groupBy(list, (t) => t.date)].map(([d, l]) => html`<div key=${d} data-day=${d} class=${'day-group' + (picked === d ? ' picked' : '')}>
    ${dayHead(d, l)}
    ${l.map((t) => html`<${TxRow} key=${t.id} t=${t} conf=${conf} hl=${hl} />`)}
  </div>`);
}
function PeriodRow({ label, sub, inc, out, onClick, open }) {
  return html`<button class="row period-row" aria-expanded=${open} onClick=${onClick}>
    <span class="rm"><span class="rt">${label}</span>${sub && html`<small>${sub}</small>`}</span>
    <span class="rv">${inc > 0 && html`<b class="num in">${yen(inc)}</b>`}<b class="num out">${yen(out)}</b></span>
    <span class="chev">${open === undefined ? '›' : open ? '⌃' : '⌄'}</span></button>`;
}

// 見方を覚えておく(詳細を見て戻ってきたときのため)
const memory = { view: 'cal', key: null };

export function Records() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const curKey = periodKeyOf(today(), conf.startDay);
  const [view, setViewS] = useState(memory.view);
  const [key, setKeyS] = useState(memory.key || curKey);
  const setView = (v) => { memory.view = v; setViewS(v); };
  const setKey = (k) => { memory.key = k; setKeyS(k); setSel(null); setWeek(null); };
  const [year, setYear] = useState(+(memory.key || curKey).slice(0, 4));
  const [sel, setSel] = useState(null);
  const [week, setWeek] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [searchOn, setSearchOn] = useState(false);
  const s = summary(list, key, conf);
  const isCur = key === curKey;
  const todo = useMemo(() => insights(list, conf).filter((x) => x.level === 'todo'), [S.getVersion()]);

  const days = [];
  for (let d = s.start; d <= s.end; d = addDays(d, 1)) days.push(d);
  const byDay = groupBy(s.list, (t) => t.date);
  const outOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'out'), (t) => t.amount);
  const inOf = (d) => sum((byDay.get(d) || []).filter((t) => t.type === 'in'), (t) => t.amount);
  const lead = (parseD(s.start).getDay() + 6) % 7; // 月曜はじまり
  const upBy = groupBy(useMemo(() => upcoming(62), [S.getVersion()]), (u) => u.date);
  const t0 = today();

  const searching = q.trim() || cat;
  const found = useMemo(() => {
    if (!searching) return [];
    const f = fold(q);
    return list.filter((t) => (!cat || t.cat === cat) && (!f || fold(`${t.memo} ${t.sub || ''} ${t.cat} ${t.amount} ${t.note || ''} ${(t.tags || []).join(' ')} ${itemText(t)}`).includes(f)));
  }, [q, cat, S.getVersion()]);
  const dlistRef = useRef(null);
  // 日付を押すと、下の一覧のその日へ移る
  const pickDay = (d) => {
    const next = sel === d ? null : d;
    setSel(next);
    if (!next || !byDay.get(next)) return;
    requestAnimationFrame(() => dlistRef.current?.querySelector(`[data-day="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // 週ごと(月曜はじまり)
  const weeks = [];
  for (const d of days) {
    if (!weeks.length || (parseD(d).getDay() + 6) % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  // 月ごと
  const months = view === 'month' ? Array.from({ length: 12 }, (_, i) => summary(list, `${year}-${String(i + 1).padStart(2, '0')}`, conf)) : [];

  const budget = conf.budget || 0;
  const left = budget - s.out;

  return html`<div class="page records">
    <header class="bar"><span class="bar-l"></span>${searching || searchOn ? html`<h1>さがす</h1>` : html`<${Seg} value=${view} onChange=${(v) => { setView(v); setYear(+key.slice(0, 4)); }} options=${[{ v: 'cal', label: 'カレンダー' }, { v: 'week', label: '週' }, { v: 'month', label: '月' }]} />`}
      <button class="icon-btn" onClick=${() => { setSearchOn(!searchOn); if (searchOn) { setQ(''); setCat(''); } }} aria-label=${searchOn ? 'さがすのをやめる' : 'さがす'}><${Icon} k=${searchOn ? 'close' : 'search'} size="20" /></button></header>
    ${searchOn && html`<div class="search">
      <input type="search" autoFocus placeholder="内容・お店・タグ・品名・金額" value=${q} onChange=${(e) => setQ(e.target.value)} />
      <select value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="カテゴリでしぼる">
        <option value="">すべて</option>
        ${[...catList('out', conf), ...catList('in', conf)].map((c) => html`<option key=${c.id} value=${c.id}>${c.id}</option>`)}
      </select>
    </div>`}
    ${searchOn ? html`
      ${searching ? html`<div class="found-sum">${found.length}件・支出 ${yen(sum(found.filter((t) => t.type === 'out'), (t) => t.amount))}</div>
        <div class="dlist"><${DayList} list=${found.slice(0, 300)} conf=${conf} hl=${q.trim()} /></div>` : html`<${Empty} title="言葉かカテゴリでさがせます" />`}`
    : view === 'month' ? html`
      <${YearPill} year=${year} onChange=${setYear} />
      <${Totals} title=${`${year}年の合計`} s=${{ in: sum(months, (m) => m.in), out: sum(months, (m) => m.out), inv: sum(months, (m) => m.inv) }} />
      <div class="sec flush">${months.filter((m) => m.in || m.out).reverse().map((m) => html`<${PeriodRow} key=${m.key} label=${`${+m.key.slice(5)}月`} sub=${`収支 ${yen(m.in - m.out, true)}${m.inv ? `・投資 ${yen(m.inv)}` : ''}`} inc=${m.in} out=${m.out} onClick=${() => { setKey(m.key); setView('cal'); window.scrollTo(0, 0); }} />`)}</div>
      ${!months.some((m) => m.in || m.out) && html`<${Empty} title="この年の記録はありません" />`}`
    : html`
      <${MonthPill} s=${s} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))} onToday=${() => setKey(curKey)} />
      ${view === 'cal' && html`<div class="cal">
        <div class="cal-grid head">${WEEK.map((w, i) => html`<span key=${w} class=${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}>${w}</span>`)}</div>
        <div class="cal-grid">
          ${Array.from({ length: lead }, (_, i) => html`<span key=${'b' + i} class="cd blank"></span>`)}
          ${days.map((d) => {
            const o = outOf(d), inc = inOf(d);
            const dow = (parseD(d).getDay() + 6) % 7;
            return html`<button key=${d} class=${'cd' + (d === t0 ? ' today' : '') + (sel === d ? ' sel' : '')} aria-label=${`${md(d)} 支出${o}円 収入${inc}円`} onClick=${() => pickDay(d)}>
              <span class=${'cdn' + (dow === 6 ? ' sun' : dow === 5 ? ' sat' : '')}>${+d.slice(8)}</span>
              ${inc > 0 && html`<span class="cdi num">${inc.toLocaleString('ja-JP')}</span>`}
              ${o > 0 && html`<span class="cdo num">${o.toLocaleString('ja-JP')}</span>`}
              ${d > t0 && upBy.get(d) && html`<span class="cdp" title="支払いの予定"></span>`}
            </button>`;
          })}
          ${Array.from({ length: (7 - ((lead + days.length) % 7)) % 7 }, (_, i) => html`<span key=${'e' + i} class="cd blank"></span>`)}
        </div>
      </div>`}
      <${Totals} title=${totalTitle(s.key, conf.startDay)} s=${s} />
      ${budget > 0 && html`<button class=${'strip' + (left < 0 ? ' warn' : '')} onClick=${() => app.go('budget')}><span>${left >= 0 ? (isCur ? '今月あと使える' : '予算の残り') : '予算を超えた額'}<b class="num">${yen(Math.abs(left))}</b></span><span class="chev">›</span></button>`}
      ${todo.length > 0 && html`<button class="strip warn" onClick=${() => (todo[0].tx ? app.edit(S.getOne(todo[0].tx)) : app.go(todo[0].go || 'recs'))}><span>確認してほしいこと ${todo.length}件</span><span class="chev">›</span></button>`}
      ${view === 'week' ? html`<div class="sec flush">${weeks.map((w, i) => {
        const l = s.list.filter((t) => t.date >= w[0] && t.date <= w[w.length - 1]);
        const open = week === i;
        return html`<div key=${w[0]}><${PeriodRow} label=${`${md(w[0])} 〜 ${md(w[w.length - 1])}`} sub=${`${l.length}件`} open=${open}
          inc=${sum(l.filter((t) => t.type === 'in'), (t) => t.amount)} out=${sum(l.filter((t) => t.type === 'out'), (t) => t.amount)} onClick=${() => setWeek(open ? null : i)} />
          ${open && html`<div class="period-body"><${DayList} list=${l} conf=${conf} /></div>`}</div>`;
      })}</div>`
      : html`
        ${sel && html`<div class="sel-bar"><b>${mdw(sel)}</b><span>${byDay.get(sel) ? `支出 ${yen(outOf(sel))}` : '記録なし'}</span><button class="chip small" onClick=${() => app.edit(null, { date: sel })}>＋ この日に記録</button></div>`}
        ${sel && (upBy.get(sel) || []).map((u, i) => html`<div key=${i} class="row plan"><span class="rm"><span class="rt">${u.rec?.name || u.plan?.name + ' 積立'}</span><small>支払いの予定</small></span><b class="num">${yen(u.amount)}</b></div>`)}
        <div class="dlist" ref=${dlistRef}><${DayList} list=${s.list} conf=${conf} picked=${sel} /></div>
        ${!s.list.length && html`<${Empty} title="この月の記録はまだありません" body="下の「入力」から記録できます" />`}`}`}
    <div class="bottom-space"></div>
  </div>`;
}
