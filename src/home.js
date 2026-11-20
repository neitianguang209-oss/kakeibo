// ホーム: 今月あといくら使えるか・総資産・見直しのヒント・最近の記録
import React, { useMemo, useState } from 'react';
import { html, useApp, Empty } from './ui.js';
import { Meter, Spark } from './charts.js';
import { yen, pm, pct, tone, today, periodKeyOf, addMonths, parseD, catInfo, jpDay, md, short } from './util.js';
import { txs, summary, getConf, insights, upcoming, cashAt, positions, monthLabel } from './calc.js';
import { quotesForCalc } from './assets.js';
import * as S from './store.js';

export function Home({ quotesVer }) {
  const app = useApp();
  const conf = getConf();
  const list = txs();
  const [key, setKey] = useState(periodKeyOf(today(), conf.startDay));
  const isCur = key === periodKeyOf(today(), conf.startDay);
  const s = summary(list, key, conf);
  const prev = summary(list, addMonths(key, -1), conf);
  const tips = useMemo(() => insights(list, conf), [S.getVersion()]);
  const up = upcoming(14);

  // 予算
  const budget = conf.budget || 0;
  const t = today();
  const total = (parseD(s.end) - parseD(s.start)) / 864e5 + 1;
  const elapsed = isCur ? (parseD(t) - parseD(s.start)) / 864e5 + 1 : total;
  const left = budget - s.out;
  const daysLeft = Math.max(1, total - elapsed + 1);

  // 資産
  const q = quotesForCalc();
  const fx = q['JPY=X']?.cur;
  const pos = positions(q, fx);
  const inv = pos.reduce((a, p) => a + (p.value || 0), 0);
  const cost = pos.reduce((a, p) => a + (p.closed ? 0 : p.cost || 0), 0);
  const day = pos.reduce((a, p) => a + (p.dayChange || 0), 0);
  const cash = cashAt(list, conf);
  const hasAssets = pos.length > 0 || cash != null;

  const recent = list.slice(0, 6);
  const todo = tips.filter((x) => x.level === 'todo');
  const hint = tips.filter((x) => x.level !== 'todo');
  const saveable = hint.reduce((a, x) => a + (x.save || 0), 0);

  return html`<div class="page home">
    <header class="top">
      <button class="month-btn" onClick=${() => setKey(addMonths(key, -1))} aria-label="前の月">‹</button>
      <h1 onClick=${() => setKey(periodKeyOf(today(), conf.startDay))}>${monthLabel(key)}${!isCur && html`<small>今月へ</small>`}</h1>
      <button class="month-btn" onClick=${() => setKey(addMonths(key, 1))} aria-label="次の月">›</button>
      <button class="icon-btn gear" onClick=${() => app.go('settings')} aria-label="設定">⚙︎</button>
    </header>

    <section class="card hero">
      ${budget > 0
        ? html`<div class="hero-row">
            <div><div class="label">${isCur ? '今月あと使える' : '予算の残り'}</div>
              <div class=${'num hero-num' + (left < 0 ? ' over' : '')}>${yen(left)}</div>
              ${isCur && left > 0 && html`<div class="sub">1日あたり <b class="num">${yen(left / daysLeft)}</b>・残り${Math.round(daysLeft)}日</div>`}
              ${left < 0 && html`<div class="sub warn-t">予算を ${yen(-left)} こえています</div>`}
            </div>
            <div class="pig" aria-hidden="true">${left < 0 ? '🐷💦' : '🐷'}</div>
          </div>
          <${Meter} value=${s.out} max=${budget} mark=${isCur ? elapsed / total : null} />
          <div class="meter-cap"><span>使った ${yen(s.out)}</span><span>予算 ${yen(budget)}</span></div>`
        : html`<div class="hero-row"><div><div class="label">今月の支出</div><div class="num hero-num">${yen(s.out)}</div>
            <button class="text-btn" onClick=${() => app.go('settings')}>月の予算を決める ›</button></div><div class="pig">🐷</div></div>`}
      <div class="trio">
        <div><span>収入</span><b class="num in">${yen(s.in)}</b></div>
        <div><span>支出</span><b class="num">${yen(s.out)}</b>${prev.out > 0 && html`<em class=${s.out > prev.out && !isCur ? 'up' : ''}>先月 ${short(prev.out)}</em>`}</div>
        <div><span>投資へ</span><b class="num inv">${yen(s.inv)}</b></div>
      </div>
    </section>

    ${todo.length > 0 && html`<section class="card todo">
      <h3>📝 確認してほしいこと</h3>
      ${todo.map((x) => html`<button key=${x.k} class="todo-row" onClick=${() => (x.tx ? app.edit(S.getOne(x.tx)) : app.go(x.go || 'recs'))}>
        <span class="ti">${x.icon}</span><span><b>${x.title}</b><small>${x.body}</small></span><span class="chev">›</span></button>`)}
    </section>`}

    <section class="card assets-card" onClick=${() => app.go('assets')}>
      <div class="card-h"><h3>総資産</h3><span class="chev">›</span></div>
      ${hasAssets
        ? html`<div class="num asset-total">${yen((cash || 0) + inv)}</div>
          <div class="asset-split">
            ${cash != null && html`<div><i style=${{ background: 'var(--c-cash)' }}></i>手元のお金<b class="num">${yen(cash)}</b></div>`}
            <div><i style=${{ background: 'var(--c-inv)' }}></i>投資<b class="num">${yen(inv)}</b></div>
          </div>
          ${pos.length > 0 && html`<div class="asset-pl">
            <span>含み損益 <b class=${'num ' + tone(inv - cost)}>${pm(inv - cost)}円</b>${cost > 0 && html` <em class=${tone(inv - cost)}>${pct((inv - cost) / cost)}</em>`}</span>
            <span>前日比 <b class=${'num ' + tone(day)}>${pm(day)}円</b></span>
          </div>`}`
        : html`<p class="muted">株・積立NISA・手元のお金を登録すると、ここで全部まとめて見られます。</p>`}
    </section>

    ${hint.length > 0 && html`<section class="card tips">
      <div class="card-h"><h3>💡 見直しのヒント</h3>${saveable > 0 && html`<span class="save-badge">来月 最大 ${yen(saveable)} 浮くかも</span>`}</div>
      ${hint.slice(0, 3).map((x) => html`<div key=${x.k} class="tip-row" onClick=${() => x.go && app.go(x.go)}><span class="ti">${x.icon}</span><span><b>${x.title}</b><small>${x.body}</small></span></div>`)}
      ${hint.length > 3 && html`<button class="text-btn" onClick=${() => app.go('report')}>ほかに ${hint.length - 3} 件 ›</button>`}
    </section>`}

    ${up.length > 0 && html`<section class="card">
      <div class="card-h"><h3>もうすぐの支払い・入金</h3><button class="text-btn" onClick=${() => app.go('recs')}>固定費・サブスク ›</button></div>
      ${up.slice(0, 5).map((u, i) => {
        const r = u.rec;
        const c = r ? catInfo(r.cat, conf) : { icon: '🌱' };
        return html`<div key=${i} class="row"><span class="ri">${c.icon}</span><span class="rm">${r ? r.name : u.plan.name + ' 積立'}<small>${jpDay(u.date)}${r?.variable ? '・金額は毎回ちがう' : ''}</small></span><b class=${'num ' + (r?.type === 'in' ? 'in' : '')}>${r?.type === 'in' ? '+' : ''}${yen(u.amount)}</b></div>`;
      })}
    </section>`}

    <section class="card">
      <div class="card-h"><h3>最近の記録</h3><button class="text-btn" onClick=${() => app.go('records')}>すべて ›</button></div>
      ${recent.length ? recent.map((x) => html`<${TxRow} key=${x.id} t=${x} conf=${conf} />`) : html`<${Empty} title="まだ記録がありません" body="下の ＋ から、最初の1件を記録してみましょう。レシートの写真からも入れられます。" />`}
    </section>
    <div class="bottom-space"></div>
  </div>`;
}

export function TxRow({ t, conf, showDate = true }) {
  const app = useApp();
  const c = t.type === 'inv' ? { icon: t.cat === '積立' ? '🌱' : '📈', color: 'var(--c-inv)' } : t.type === 'adj' ? { icon: '⚖️' } : catInfo(t.cat, conf);
  const sign = t.type === 'in' ? '+' : t.type === 'adj' ? (t.amount >= 0 ? '+' : '') : '';
  return html`<button class="row tx" onClick=${() => t.type !== 'adj' && app.edit(t)}>
    <span class="ri" style=${{ '--cc': c.color }}>${c.icon}</span>
    <span class="rm">${t.memo || t.cat}${t.pending && html`<em class="tag warn">未確定</em>`}${t.rec && !t.pending && html`<em class="tag">定期</em>`}${t.src === 'receipt' && html`<em class="tag">レシート</em>`}${t.src === 'claude' && html`<em class="tag">Claude</em>`}
      <small>${showDate ? jpDay(t.date) + '・' : ''}${t.type === 'adj' ? '残高あわせ' : t.cat}${t.pay ? '・' + t.pay : ''}</small></span>
    <b class=${'num ' + (t.type === 'in' ? 'in' : t.type === 'inv' ? 'inv' : '')}>${sign}${yen(t.amount)}</b>
  </button>`;
}
