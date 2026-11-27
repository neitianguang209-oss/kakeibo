// 品目の内訳(何を買ったか): 1件の支出に items = [{ n: 品名, a: 金額, q: 個数, tag: 品目タグ }] を持たせて、開いて確認・タグや言葉でさがす
import React, { useState, useMemo } from 'react';
import { html, useApp, Sheet, Seg, Empty, PageHead } from './ui.js';
import { yen, sum, fold, today, addDays, md, catList, groupBy } from './util.js';
import { txs, getConf } from './calc.js';

export const ITEM_TAGS = [
  { id: '野菜・果物', icon: '🥬' },
  { id: '肉・魚', icon: '🍖' },
  { id: '卵・乳・豆腐', icon: '🥚' },
  { id: '米・パン・麺', icon: '🍚' },
  { id: '惣菜・弁当', icon: '🍱' },
  { id: '冷凍・即席', icon: '🧊' },
  { id: 'お菓子', icon: '🍫' },
  { id: '飲み物', icon: '🥤' },
  { id: 'お酒', icon: '🍺' },
  { id: '調味料', icon: '🧂' },
  { id: '外食メニュー', icon: '🍽️' },
  { id: '日用品', icon: '🧻' },
  { id: 'コスメ・衛生', icon: '🧴' },
  { id: '服・靴', icon: '👕' },
  { id: '本・文具', icon: '📚' },
  { id: '趣味・推し', icon: '🎫' },
  { id: 'そのほか', icon: '🔖' },
];
export const tagIcon = (id) => ITEM_TAGS.find((t) => t.id === id)?.icon || '🔖';

// 品名からタグを推し量る(上から順に当てる。当たらなければ空)
const TAG_HINTS = [
  [/冷凍|カップ(麺|ヌードル|スープ)|インスタント|レトルト/, '冷凍・即席'],
  [/弁当|おにぎり|惣菜|総菜|サンドイッチ|サンド$|唐揚げ|からあげ|コロッケ|サラダチキン/, '惣菜・弁当'],
  [/ビール|発泡酒|チューハイ|酎ハイ|ハイボール|ワイン|日本酒|焼酎|サワー/, 'お酒'],
  [/お茶|緑茶|麦茶|紅茶|コーヒー|カフェラテ|ジュース|コーラ|炭酸|サイダー|天然水|ミネラル|飲料|ドリンク|豆乳/, '飲み物'],
  [/チョコ|クッキー|ビスケット|ポテトチップ|ポテチ|グミ|アイス|プリン|ゼリー|菓子|キャンディ|飴|ケーキ|せんべい|ドーナツ/, 'お菓子'],
  [/納豆|豆腐|油揚げ|厚揚げ|卵|たまご|玉子|牛乳|ヨーグルト|チーズ|バター/, '卵・乳・豆腐'],
  [/醤油|しょうゆ|味噌|みそ|塩|砂糖|酢|油$|オイル|ドレッシング|マヨネーズ|ケチャップ|ソース|だし|コンソメ|カレールー|たれ$/, '調味料'],
  [/米$|ごはん|ご飯|パン|食パン|うどん|そば|パスタ|スパゲ|ラーメン|そうめん|中華麺|焼きそば|シリアル|絹美人/, '米・パン・麺'],
  [/もやし|キャベツ|レタス|玉ねぎ|たまねぎ|にんじん|人参|じゃがいも|トマト|きゅうり|なす|ピーマン|ねぎ|ネギ|ほうれん草|小松菜|大根|白菜|ブロッコリー|きのこ|しめじ|えのき|まいたけ|バナナ|りんご|みかん|いちご|ぶどう|野菜|果物/, '野菜・果物'],
  [/豚|鶏|牛肉|ひき肉|挽肉|むね肉|もも肉|ハム|ベーコン|ウインナー|ソーセージ|ちくわ|かまぼこ|鮭|さけ|さば|まぐろ|刺身|魚|えび|いか/, '肉・魚'],
  [/ティッシュ|トイレット|洗剤|柔軟剤|ラップ|ホイル|スポンジ|ゴミ袋|電池|キッチンペーパー|レジ袋|ポリ袋/, '日用品'],
  [/シャンプー|コンディショナー|歯磨|歯ブラシ|化粧|洗顔|乳液|リップ|ファンデ|日焼け|マスク|生理|ばんそうこう|薬/, 'コスメ・衛生'],
  [/シャツ|パンツ|ニット|セーター|ソックス|靴下|コート|ジャケット|スニーカー|靴|下着|パーカ|スカート|ワンピース/, '服・靴'],
  [/本$|文庫|新書|雑誌|ノート|ペン|ファイル|参考書/, '本・文具'],
  [/チケット|公演|ライブ|映画|グッズ|ゲーム/, '趣味・推し'],
];
export const guessTag = (name, cat) => TAG_HINTS.find(([re]) => re.test(String(name || '').normalize('NFKC')))?.[1] || (cat === '外食' || cat === '学食' ? '外食メニュー' : '');

// 保存する形にそろえる(空の行は捨てる)
export function cleanItems(list, cat) {
  return (list || [])
    .map((x) => {
      const n = String(x.n || '').trim().slice(0, 60);
      const a = Math.round(+x.a || 0);
      const q = +x.q > 1 ? Math.round(+x.q) : undefined;
      const tag = x.tag || guessTag(n, cat) || undefined;
      return { n, a, ...(q ? { q } : {}), ...(tag ? { tag } : {}) };
    })
    .filter((x) => x.n || x.a);
}
export const itemsSum = (list) => sum(list || [], (x) => x.a);
export const itemText = (t) => [t.store, ...(t.items || []).map((x) => `${x.n} ${x.tag || ''}`)].filter(Boolean).join(' ');

const toNum = (v) => { const s = String(v).normalize('NFKC').replace(/[^\d\-]/g, ''); return s === '' || s === '-' ? s : +s; };

// ---- 内訳を開いて見る
export function ItemLines({ t, hl = '' }) {
  const list = t.items || [];
  const diff = t.amount - itemsSum(list);
  const f = fold(hl);
  return html`<div class="items">
    ${list.map((x, i) => html`<div key=${i} class=${'it-line' + (f && fold(`${x.n} ${x.tag || ''}`).includes(f) ? ' hit' : '')}>
      <span class="it-i">${tagIcon(x.tag)}</span><span class="it-n">${x.n || '(名前なし)'}${x.q ? ` ×${x.q}` : ''}<small>${x.tag || ''}</small></span><b class="num">${yen(x.a)}</b></div>`)}
    ${Math.abs(diff) >= 1 && html`<div class="it-line rest"><span class="it-i"></span><span class="it-n">${diff > 0 ? '税・そのほか(内訳にない分)' : '値引き・ポイントなど'}</span><b class="num">${yen(diff)}</b></div>`}
  </div>`;
}

// ---- 内訳を直す行の並び
export function ItemRows({ items, onChange, cat }) {
  const upd = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return html`<div class="it-edit">
    ${items.map((x, i) => html`<div key=${i} class="it-row">
      <input class="it-name" value=${x.n || ''} placeholder="品名" maxLength="60" onChange=${(e) => upd(i, { n: e.target.value, tag: x.tag || guessTag(e.target.value, cat) })} />
      <input class="it-amt num" inputmode="numeric" value=${x.a ?? ''} placeholder="円" onChange=${(e) => upd(i, { a: toNum(e.target.value) })} />
      <select class="it-tag" value=${x.tag || ''} onChange=${(e) => upd(i, { tag: e.target.value })} aria-label="タグ"><option value="">タグ</option>${ITEM_TAGS.map((g) => html`<option key=${g.id} value=${g.id}>${g.icon} ${g.id}</option>`)}</select>
      <button class="icon-btn" aria-label="この行を消す" onClick=${() => onChange(items.filter((_, j) => j !== i))}>✕</button>
    </div>`)}
    <button class="text-btn" onClick=${() => onChange([...items, { n: '', a: '', tag: '' }])}>＋ 品目を足す</button>
  </div>`;
}

export function ItemsSheet({ items, cat, amount, onDone, onClose }) {
  const [list, setList] = useState(items?.length ? items : [{ n: '', a: '', tag: '' }]);
  const total = itemsSum(list);
  return html`<${Sheet} title="内訳(買ったもの)" onClose=${onClose} full
    foot=${(close) => html`<button class="btn primary wide" onClick=${() => { onDone(cleanItems(list, cat)); close(); }}>この内訳にする${total ? `(合計 ${yen(total)})` : ''}</button>`}>
    <p class="muted small">品名と金額を1行ずつ。タグは品名から自動でつきます。${amount ? `支出の金額は ${yen(amount)} です。` : '金額を入れていなければ、内訳の合計が支出の金額になります。'}</p>
    <${ItemRows} items=${list} onChange=${setList} cat=${cat} />
  </${Sheet}>`;
}

// ---- 品目をさがす画面
const SPANS = [
  { v: 30, label: '30日' },
  { v: 91, label: '3か月' },
  { v: 365, label: '1年' },
  { v: 0, label: '全部' },
];
export function allItems(list) {
  const out = [];
  for (const t of list) {
    if (t.type !== 'out' || !t.items?.length) continue;
    t.items.forEach((x, i) => out.push({ ...x, tag: x.tag || 'そのほか', key: t.id + ':' + i, date: t.date, cat: t.cat, store: t.store || t.memo || '', t }));
  }
  return out;
}
export function ItemsPage({ initialTag }) {
  const app = useApp();
  const conf = getConf();
  const [span, setSpan] = useState(91);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(initialTag || '');
  const [cat, setCat] = useState('');
  const [view, setView] = useState('new');
  const [limit, setLimit] = useState(100);
  const list = txs();
  const everything = useMemo(() => allItems(list), [list]);
  const since = span ? addDays(today(), -span) : '';
  const f = fold(q);
  const base = everything.filter((x) => x.date >= since && (!cat || x.cat === cat) && (!f || fold(`${x.n} ${x.tag} ${x.store}`).includes(f)));
  const tags = [...groupBy(base, (x) => x.tag)].map(([k, l]) => ({ k, n: l.length, a: sum(l, (x) => x.a) })).sort((a, b) => b.a - a.a);
  const hit = base.filter((x) => !tag || x.tag === tag);
  const names = view === 'name' ? [...groupBy(hit, (x) => fold(x.n))].map(([k, l]) => {
    const latest = l[0];
    const unit = (x) => Math.round(x.a / (x.q || 1));
    return { k, n: latest.n, tag: latest.tag, times: sum(l, (x) => x.q || 1), a: sum(l, (x) => x.a), last: unit(latest), low: Math.min(...l.map(unit)), date: latest.date };
  }).sort((a, b) => b.a - a.a) : [];
  return html`<div class="page itemspage">
    <${PageHead} title="買ったもの" />
    <${Seg} small value=${span} onChange=${setSpan} options=${SPANS} />
    <div class="search">
      <input type="search" placeholder="品名・タグ・お店でさがす" value=${q} onChange=${(e) => setQ(e.target.value)} />
      <select value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="カテゴリでしぼる"><option value="">すべて</option>${catList('out', conf).map((c) => html`<option key=${c.id} value=${c.id}>${c.id}</option>`)}</select>
    </div>
    ${tags.length > 0 && html`<div class="row-chips wrap">${tags.map((g) => html`<button key=${g.k} class=${'chip small' + (tag === g.k ? ' on' : '')} onClick=${() => setTag(tag === g.k ? '' : g.k)}>${tagIcon(g.k)} ${g.k} <small class="num">${yen(g.a)}</small></button>`)}</div>`}
    ${hit.length > 0 ? html`
      <div class="it-sum"><span>${hit.length}点</span><b class="num">${yen(sum(hit, (x) => x.a))}</b></div>
      <${Seg} small value=${view} onChange=${setView} options=${[{ v: 'new', label: '新しい順' }, { v: 'name', label: '品名ごと' }]} />
      <section class="card">
        ${view === 'new' ? hit.slice(0, limit).map((x) => html`<button key=${x.key} class="it-line tap" onClick=${() => app.open('detail', x.t.id)}>
            <span class="it-i">${tagIcon(x.tag)}</span><span class="it-n">${x.n}${x.q ? ` ×${x.q}` : ''}<small>${+x.date.slice(2, 4)}/${md(x.date)}・${x.cat}${x.store ? '・' + x.store : ''}</small></span><b class="num">${yen(x.a)}</b></button>`)
        : names.slice(0, limit).map((x) => html`<div key=${x.k} class="it-line">
            <span class="it-i">${tagIcon(x.tag)}</span><span class="it-n">${x.n}<small>${x.times}個・前回 ${yen(x.last)}(${md(x.date)})${x.low < x.last ? `・いちばん安いとき ${yen(x.low)}` : ''}</small></span><b class="num">${yen(x.a)}</b></div>`)}
        ${(view === 'new' ? hit.length : names.length) > limit && html`<button class="text-btn" onClick=${() => setLimit(limit + 200)}>もっと見る</button>`}
      </section>`
    : html`<${Empty} title=${everything.length ? '見つかりませんでした' : '内訳のある記録はまだありません'} body=${everything.length ? '期間やタグを変えてみてください。' : '「入力」右上のカメラでレシートを読むか、「詳しく」から内訳を足すと、ここに買ったものが並びます。'} />`}
    <div class="bottom-space"></div>
  </div>`;
}
