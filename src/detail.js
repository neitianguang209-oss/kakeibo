// 記録をくわしく: 詳しく残す(店・払い方・タグ・メモ・写真)、記録の中身、よく使う・最近の記録
import React, { useState, useRef, useMemo } from 'react';
import { html, Sheet, Seg, Field, Empty, useApp } from './ui.js';
import { Icon, CatIcon } from './icons.js';
import { ItemLines } from './items.js';
import { txs, getConf } from './calc.js';
import { yen, uid, today, mdw, md, PAY } from './util.js';
import * as S from './store.js';

// ---- 画像を小さくする(写真はクラウドにも送るので、小さめに残す)
export async function shrink(file, max = 2000, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', quality);
    return { data: data.split(',')[1], preview: data };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export const PHOTO_MAX = 1100;
export const photoSrc = (id) => S.getOne(id)?.img || '';

// 保存: 新しい写真を入れて、記録に持たせる番号の並びを返す。外した写真は、ほかの記録が使っていなければ消す
export async function savePhotos(list, before = [], txId = '') {
  const fresh = list.filter((p) => p.fresh);
  if (fresh.length) await S.saveMany('photo', fresh.map((p) => ({ id: p.id, img: p.img, date: today() })));
  const keep = new Set(list.map((p) => p.id));
  for (const id of before) {
    if (keep.has(id)) continue;
    if (!S.all('tx').some((t) => t.id !== txId && (t.photos || []).includes(id))) await S.remove(id);
  }
  return list.map((p) => p.id);
}

export function Viewer({ src, onClose }) {
  return html`<div class="viewer" onClick=${onClose} role="dialog" aria-label="写真"><img src=${src} alt="写真" /></div>`;
}

function PhotoEdit({ photos, onChange }) {
  const app = useApp();
  const ref = useRef(null);
  const add = async (files) => {
    const out = [];
    for (const f of [...files].slice(0, 6)) {
      try {
        const s = await shrink(f, PHOTO_MAX, 0.68);
        out.push({ id: uid('ph'), img: s.preview, fresh: true });
      } catch { app.toast('読みこめない写真がありました'); }
    }
    onChange([...photos, ...out]);
  };
  return html`<div class="photos">
    ${photos.map((p) => html`<div key=${p.id} class="photo"><img src=${p.img || photoSrc(p.id)} alt="写真" /><button class="del" aria-label="この写真を外す" onClick=${() => onChange(photos.filter((x) => x.id !== p.id))}><${Icon} k="close" size="14" w="2.4" /></button></div>`)}
    <button class="photo-add" onClick=${() => ref.current.click()}><${Icon} k="camera" />写真を足す</button>
    <input ref=${ref} type="file" accept="image/*" multiple hidden onChange=${(e) => { add(e.target.files); e.target.value = ''; }} />
  </div>`;
}

// よく使うタグ(多い順)
export function usedTags(list) {
  const m = new Map();
  for (const t of list) for (const g of t.tags || []) m.set(g, (m.get(g) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}
export function TagEdit({ tags, onChange, known, placeholder = '新しいタグ' }) {
  const [v, setV] = useState('');
  const add = () => {
    const g = v.trim().replace(/^#/, '').slice(0, 20);
    if (g && !tags.includes(g)) onChange([...tags, g]);
    setV('');
  };
  const all = [...new Set([...tags, ...known])].slice(0, 20);
  return html`<div>
    ${all.length > 0 && html`<div class="row-chips wrap">${all.map((g) => html`<button key=${g} class=${'chip small' + (tags.includes(g) ? ' on' : '')} onClick=${() => onChange(tags.includes(g) ? tags.filter((x) => x !== g) : [...tags, g])}>${g}</button>`)}</div>`}
    <div class="inline"><input value=${v} onChange=${(e) => setV(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} placeholder=${placeholder} maxLength="20" /><button class="btn small" onClick=${add}>足す</button></div>
  </div>`;
}

// ---- 詳しく残す(どれも空でよい)
export function MoreSheet({ type, value, onChange, onItems, itemCount, onClose }) {
  const [f, setF] = useState(value);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const known = useMemo(() => usedTags(txs()), []);
  const stores = useMemo(() => [...new Set(txs().filter((t) => t.type === type && t.store).map((t) => t.store))].slice(0, 8), []);
  const done = (close) => { onChange(f); close(); };
  return html`<${Sheet} title="詳しく残す" onClose=${onClose} full foot=${(close) => html`<button class="btn primary wide" onClick=${() => done(close)}>この内容にする</button>`}>
    ${(close) => html`<div class="form">
      ${type !== 'inv' && html`<${Field} label="写真(レシート・買ったもの)"><div></div></${Field}><${PhotoEdit} photos=${f.photos} onChange=${(v) => set('photos', v)} />`}
      <${Field} label=${type === 'in' ? '入金元' : type === 'inv' ? '投資先' : 'お店'}><input value=${f.store} onChange=${(e) => set('store', e.target.value)} placeholder=${type === 'in' ? '例: バイト先' : '例: スターバックス'} maxLength="40" /></${Field}>
      ${stores.length > 0 && html`<div class="row-chips">${stores.map((s) => html`<button key=${s} class="chip small ghost" onClick=${() => set('store', s)}>${s}</button>`)}</div>`}
      ${type === 'out' && html`<${Field} label="支払い方法"><div></div></${Field}><div class="row-chips wrap">${PAY.map((p) => html`<button key=${p} class=${'chip small' + (f.pay === p ? ' on' : '')} onClick=${() => set('pay', f.pay === p ? '' : p)}>${p}</button>`)}</div>`}
      <${Field} label="メモ"><textarea rows="3" value=${f.note} onChange=${(e) => set('note', e.target.value)} placeholder="あとで思い出せるように" maxLength="500"></textarea></${Field}>
      <${Field} label="タグ"><div></div></${Field}><${TagEdit} tags=${f.tags} onChange=${(v) => set('tags', v)} known=${known} />
      ${type === 'out' && html`<button class="row" onClick=${() => { onChange(f); close(); onItems(); }}><span class="rm">内訳(買ったものを1つずつ)<small>${itemCount ? `${itemCount}点` : 'まだありません'}</small></span><span class="chev">›</span></button>`}
    </div>`}
  </${Sheet}>`;
}

// ---- よく使う(お気に入り)
const FAV_KEYS = ['type', 'amount', 'cat', 'memo', 'pay', 'store', 'tags', 'items', 'note'];
export const copyOf = (t) => Object.fromEntries(FAV_KEYS.filter((k) => t[k] != null && t[k] !== '').map((k) => [k, t[k]]));
const sameKey = (t) => [t.type, t.cat, t.memo || '', t.amount].join('|');
export const favs = () => S.all('fav').sort((a, b) => (b.used || 0) - (a.used || 0));
export const findFav = (t) => favs().find((f) => sameKey(f) === sameKey(t));
export async function toggleFav(t) {
  const f = findFav(t);
  if (f) { await S.remove(f.id); return false; }
  await S.save('fav', { id: uid('f'), ...copyOf(t), used: Date.now() });
  return true;
}
export const favLabel = (f) => `${f.memo || f.store || f.cat} ${yen(f.amount)}`;

export function PickSheet({ type, onPick, onClose }) {
  const conf = getConf();
  const mine = favs().filter((f) => f.type === type);
  const [view, setView] = useState(mine.length ? 'fav' : 'recent');
  const recent = useMemo(() => {
    const seen = new Set(), out = [];
    for (const t of txs()) {
      if (t.type !== type || t.rec) continue;
      const k = sameKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 40) break;
    }
    return out;
  }, [type]);
  const list = view === 'fav' ? mine : recent;
  return html`<${Sheet} title="前の記録から入れる" onClose=${onClose} full>
    ${(close) => html`<${Seg} value=${view} onChange=${setView} options=${[{ v: 'fav', label: 'よく使う' }, { v: 'recent', label: '最近' }]} />
      ${list.length ? html`<div class="sec">${list.map((t) => html`<button key=${t.id} class="row" onClick=${() => { onPick(copyOf(t)); if (view === 'fav') S.save('fav', { ...t, used: Date.now() }); close(); }}>
        <span class="ri"><${CatIcon} id=${t.cat} conf=${conf} /></span>
        <span class="rm"><span class="rt">${t.memo || t.cat}</span><small>${[t.cat, t.store, view === 'recent' ? md(t.date) : ''].filter(Boolean).join('・')}</small></span>
        <b class="num">${yen(t.amount)}</b></button>`)}</div>`
      : html`<${Empty} title=${view === 'fav' ? 'よく使う記録はまだありません' : '記録はまだありません'} body=${view === 'fav' ? '記録を開いて「よく使う」を押すと、ここに並びます。' : ''} />`}`}
  </${Sheet}>`;
}

// ---- 1件の中身を見る
export function TxDetail({ id, onClose }) {
  const app = useApp();
  const conf = getConf();
  const t = S.getOne(id);
  const [view, setView] = useState(null);
  if (!t) return null;
  const isFav = !!findFav(t);
  const sign = t.type === 'in' ? '+' : '';
  const rows = [
    ['内容', t.memo],
    [t.type === 'in' ? '入金元' : t.type === 'inv' ? '投資先' : 'お店', t.store],
    ['支払い方法', t.pay],
    ['メモ', t.note],
    ['タグ', (t.tags || []).join('・')],
    ['記録の仕方', t.rec ? '固定費の自動記録' : t.src === 'receipt' ? 'レシート読み取り' : t.src === 'claude' ? 'Claude' : t.src === 'plan' ? '積立の自動記録' : ''],
  ].filter((r) => r[1]);
  const del = async (close) => {
    await S.remove(t.id);
    close();
    app.toast('消しました', () => S.restore(t.id));
  };
  const photos = (t.photos || []).map(photoSrc).filter(Boolean);
  return html`<${React.Fragment}><${Sheet} title=${t.type === 'in' ? '収入' : t.type === 'inv' ? '投資へ' : '支出'} onClose=${onClose} full
    foot=${(close) => html`<div class="actions">
      <button class="act" onClick=${() => app.edit(t)}><${Icon} k="edit" size="20" />直す</button>
      <button class="act" onClick=${() => app.edit(null, { ...copyOf(t) })}><${Icon} k="copy" size="20" />コピー</button>
      <button class=${'act' + (isFav ? ' on' : '')} aria-pressed=${isFav} onClick=${async () => app.toast((await toggleFav(t)) ? 'よく使うに入れました' : 'よく使うから外しました')}><${Icon} k="star" size="20" fill=${isFav ? 'currentColor' : 'none'} />よく使う</button>
      <button class="act danger" onClick=${() => del(close)}><${Icon} k="trash" size="20" />消す</button>
    </div>`}>
    <div class="d-head">
      <span class="d-cat"><${CatIcon} id=${t.cat} conf=${conf} />${t.cat}</span>
      <b class=${'num ' + (t.type === 'in' ? 'in' : t.type === 'inv' ? 'inv' : 'out')}>${sign}${yen(t.amount)}</b>
      <small>${t.date.slice(0, 4)}年${mdw(t.date).replace('/', '月').replace('(', '日(')}${t.pending ? '・金額は未確定' : ''}</small>
    </div>
    ${photos.length > 0 && html`<div class="photos">${photos.map((src, i) => html`<button key=${i} class="photo" onClick=${() => setView(src)} aria-label="写真を大きく見る"><img src=${src} alt="写真" /></button>`)}</div>`}
    ${rows.length > 0 && html`<div class="sec">${rows.map(([k, v]) => html`<div key=${k} class="kv"><span>${k}</span><div>${v}</div></div>`)}</div>`}
    ${t.items?.length > 0 && html`<div class="sec"><h3>買ったもの</h3><${ItemLines} t=${t} /></div>`}
    ${!rows.length && !photos.length && !t.items?.length && html`<p class="muted center">「直す」から、お店・写真・メモを足せます。</p>`}
  </${Sheet}>${view && html`<${Viewer} src=${view} onClose=${() => setView(null)} />`}</${React.Fragment}>`;
}
