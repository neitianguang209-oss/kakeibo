// 1件の記録の行(カレンダー・検索・カテゴリ画面で共通)。一覧は短く、押すと中身(写真・メモなど)が開く
import React from 'react';
import { html, useApp } from './ui.js';
import { Icon, CatIcon } from './icons.js';
import { yen, fold } from './util.js';

export function TxRow({ t, conf, hl = '' }) {
  const app = useApp();
  const sign = t.type === 'in' ? '+' : t.type === 'adj' && t.amount >= 0 ? '+' : '';
  const f = fold(hl);
  const hit = f ? (t.items || []).find((x) => fold(`${x.n} ${x.tag || ''}`).includes(f)) : null;
  const memo = t.memo && t.memo !== t.cat ? t.memo : '';
  // 品目があれば「もやし・ちくわ ほか2点」のように、買ったものを見せる
  const names = (t.items || []).map((x) => x.n).filter(Boolean);
  const bought = names.length ? names.slice(0, 2).join('・') + (names.length > 2 ? ` ほか${names.length - 2}点` : '') : '';
  // 「野菜(キャベツ・にんじん)」のように、分類とタグを並べる
  const kind = t.sub && t.tags?.length ? `${t.sub}(${t.tags.join('・')})` : t.sub || (t.tags || []).join('・');
  const line = [kind, memo || bought || t.store].filter(Boolean).join('・');
  const sub = hit ? `${hit.n} ${yen(hit.a)}` : line || (t.type === 'adj' ? '残高あわせ' : '');
  const tap = () => {
    if (t.type === 'adj') return;
    if (t.pending) app.edit(t);
    else app.open('detail', t.id);
  };
  return html`<button class="row tx" onClick=${tap}>
    <span class="ri"><${CatIcon} id=${t.type === 'adj' ? '残高あわせ' : t.cat} conf=${conf} /></span>
    <span class="rm"><span class="rt">${t.cat}${t.pending && html`<em class="tag warn">未確定</em>`}${t.photos?.length ? html`<${Icon} k="image" size="13" />` : null}</span>
      ${sub && html`<small>${sub}</small>`}</span>
    <b class=${'num ' + (t.type === 'in' ? 'in' : t.type === 'inv' ? 'inv' : '')}>${sign}${yen(t.amount)}</b>
    <span class="chev">›</span>
  </button>`;
}
