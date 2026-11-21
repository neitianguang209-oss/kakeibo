// 予算: 「あといくら使えるか」を、全体とカテゴリごとに見る(予算の設定がないものは、赤字扱いにしない)
import React, { useState } from 'react';
import { html, useApp, Empty } from './ui.js';
import { Meter } from './charts.js';
import { MonthPill } from './records.js';
import { yen, today, periodKeyOf, addMonths, parseD, catInfo } from './util.js';
import { txs, summary, getConf } from './calc.js';

export function Budget() {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const curKey = periodKeyOf(today(), conf.startDay);
  const [key, setKey] = useState(curKey);
  const s = summary(list, key, conf);
  const isCur = key === curKey;
  const cb = conf.catBudgets || {};
  const sumCat = Object.values(cb).reduce((a, v) => a + (+v || 0), 0);
  const total = conf.budget || 0;
  const days = (parseD(s.end) - parseD(s.start)) / 864e5 + 1;
  const elapsed = isCur ? (parseD(today()) - parseD(s.start)) / 864e5 + 1 : days;
  const pace = isCur ? Math.min(1, elapsed / days) : null; // 今日までに使ってよい割合の目安
  const left = total - s.out;
  const spent = new Map(s.byCat.map((x) => [x.cat, x.amount]));
  const cats = [...new Set([...Object.keys(cb), ...s.byCat.map((x) => x.cat)])]
    .map((c) => ({ cat: c, b: +cb[c] || 0, used: spent.get(c) || 0 }))
    .sort((a, b) => (b.b > 0) - (a.b > 0) || b.used - a.used);
  const edit = () => app.open('budget');

  return html`<div class="page budget">
    <header class="bar"><span class="bar-l"></span><h1>予算</h1><button class="icon-btn" onClick=${edit} aria-label="予算を設定する">⚙</button></header>
    <${MonthPill} s=${s} onPrev=${() => setKey(addMonths(key, -1))} onNext=${() => setKey(addMonths(key, 1))} onToday=${() => setKey(curKey)} />
    ${total > 0
      ? html`<section class="card bud-total" onClick=${edit}>
          <div class="bt-top"><span>予算の合計</span><b class="num">${yen(total)}</b></div>
          <div class="bt-left"><span>${left >= 0 ? '残り' : '予算より'}</span><b class=${'num ' + (left >= 0 ? '' : 'out')}>${left >= 0 ? yen(left) : yen(-left) + ' 多い'}</b></div>
          <${Meter} value=${s.out} max=${total} mark=${pace} />
          <div class="bt-foot"><span>使った額 ${yen(s.out)}(${Math.round((s.out / total) * 100)}%)</span>${isCur && pace != null && html`<span>今日までの目安 ${yen(total * pace)}</span>`}</div>
        </section>`
      : html`<button class="card bud-unset" onClick=${edit}><b>月の予算は まだ決めていません</b><small>タップして設定(未設定でも、ふつうに使えます)</small></button>`}
    ${sumCat > 0 && total > 0 && sumCat > total && html`<div class="note">カテゴリごとの予算の合計(${yen(sumCat)})が、全体の予算より多くなっています。</div>`}
    <div class="bud-list">
      ${cats.length ? cats.map((c) => {
        const ci = catInfo(c.cat, conf);
        const r = c.b - c.used;
        return html`<button key=${c.cat} class="card bud-row2" onClick=${edit}>
          <span class="ri" style=${{ '--cc': ci.color }}>${ci.icon}</span>
          <span class="br-main">
            <span class="br-top"><b>${c.cat}</b>${c.b > 0 ? html`<span class=${'num ' + (r < 0 ? 'out' : '')}>${r >= 0 ? '残り ' + yen(r) : yen(-r) + ' 超えています'}</span>` : html`<span class="muted-s">予算未設定(タップで設定)</span>`}</span>
            ${c.b > 0 && html`<${Meter} value=${c.used} max=${c.b} color=${ci.color} mark=${pace} />`}
            <small>${c.b > 0 ? `${Math.round((c.used / c.b) * 100)}%・予算 ${yen(c.b)}・使った額 ${yen(c.used)}` : `使った額 ${yen(c.used)}`}</small>
          </span></button>`;
      }) : html`<${Empty} icon="🎯" title="この月はまだ記録がありません" body="記録すると、カテゴリごとの使った額がここに並びます。" />`}
    </div>
    <div class="bottom-space"></div>
  </div>`;
}
