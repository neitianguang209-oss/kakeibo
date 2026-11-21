// 1件の記録の行(カレンダー・検索・レポートで共通)。MoneyNote と同じく「カテゴリ名」が主役でメモは小さく
import React from 'react';
import { html, useApp } from './ui.js';
import { yen, catInfo } from './util.js';

export function TxRow({ t, conf, showDate = true }) {
  const app = useApp();
  const c = t.type === 'inv' ? { icon: t.cat === '積立' ? '🌱' : '💹', color: 'var(--c-inv)' } : t.type === 'adj' ? { icon: '⚖️', color: 'var(--ink3)' } : catInfo(t.cat, conf);
  const sign = t.type === 'in' ? '+' : t.type === 'adj' ? (t.amount >= 0 ? '+' : '') : '';
  const sub = [t.memo && t.memo !== t.cat ? t.memo : '', t.type === 'adj' ? '残高あわせ' : '', t.pay || ''].filter(Boolean).join('・');
  return html`<button class="row tx" onClick=${() => t.type !== 'adj' && app.edit(t)}>
    <span class="ri" style=${{ '--cc': c.color }}>${c.icon}</span>
    <span class="rm"><span class="rt">${t.cat}${t.pending && html`<em class="tag warn">未確定</em>`}${t.rec && !t.pending && html`<em class="tag">定期</em>`}${t.src === 'receipt' && html`<em class="tag">レシート</em>`}${t.src === 'claude' && html`<em class="tag">Claude</em>`}</span>
      ${(sub || showDate) && html`<small>${sub}</small>`}</span>
    <b class=${'num ' + (t.type === 'in' ? 'in' : t.type === 'inv' ? 'inv' : '')}>${sign}${yen(t.amount)}</b>
    <span class="chev">›</span>
  </button>`;
}
