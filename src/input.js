// 入力: 1件の記録(電卓つき)・レシートをAIで読む・ほかのアプリの記録を貼り付けて取り込む
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { html, Sheet, Seg, Keypad, evalExpr, useApp } from './ui.js';
import * as S from './store.js';
import { fn, getKey, lsGet, lsSet } from './api.js';
import { catList, catInfo, guessCat, INV_CATS, today, addDays, yen, uid, mdw, fold, vibrate, periodKeyOf, PAY, subsOf } from './util.js';
import { Totals } from './records.js';
import { txs, memoHistory, getConf, summary } from './calc.js';
import { ItemsSheet, ItemRows, cleanItems, itemsSum } from './items.js';
import { Icon, CatIcon } from './icons.js';
import { MoreSheet, PickSheet, favs, favLabel, savePhotos, shrink, PHOTO_MAX } from './detail.js';

const TYPES = [
  { v: 'out', label: '支出', color: 'var(--accent)' },
  { v: 'in', label: '収入', color: 'var(--c-in)' },
  { v: 'inv', label: '投資へ', color: 'var(--c-inv)' },
];

const lastCatOf = (type) => lsGet('kakeibo:lastcat:' + type) || null;
// 支払い方法は前回のものを引き継ぐ(「選ばない」で記録したら、次も選ばないまま)
const lastPay = () => {
  const v = lsGet('kakeibo:lastpay');
  if (v != null) return v;
  const hit = txs().filter((t) => t.type === 'out' && PAY.includes(t.pay)).sort((a, b) => (b.t || 0) - (a.t || 0))[0];
  return hit?.pay || '';
};

const PAY_SHORT = { 'QR・電子マネー': 'QR・電子', 口座引き落とし: '引き落とし' };

// 細かい分類(使い道)の候補チップ。足す・外すもここで
function SubPicker({ cat, value, onChange }) {
  const conf = getConf();
  const list = subsOf(cat, conf);
  const [mode, setMode] = useState(null); // null | 'add' | 'edit'
  const [v, setV] = useState('');
  useEffect(() => { setMode(null); setV(''); }, [cat]);
  const store = (next) => S.setConf({ subs: { ...(getConf().subs || {}), [cat]: next } });
  const add = () => {
    const n = v.trim().slice(0, 16);
    if (n) {
      if (!list.includes(n)) store([...list, n]);
      onChange(n);
    }
    setV('');
    setMode(null);
  };
  const shown = value && !list.includes(value) ? [...list, value] : list;
  return html`<div class="pick-row"><span class="fl">分類</span><div class="pick-body">
    <div class="row-chips wrap">
      ${shown.map((x) => (mode === 'edit'
        ? html`<button key=${x} class="chip small del" aria-label=${`${x}を候補から外す`} onClick=${() => { store(list.filter((y) => y !== x)); if (value === x) onChange(''); }}>${x} ✕</button>`
        : html`<button key=${x} class=${'chip small' + (value === x ? ' on' : '')} aria-pressed=${value === x} onClick=${() => { vibrate(5); onChange(value === x ? '' : x); }}>${x}</button>`))}
      ${mode !== 'edit' && html`<button class="chip small ghost" onClick=${() => setMode(mode === 'add' ? null : 'add')}>＋ 足す</button>`}
      ${list.length > 0 && html`<button class="chip small ghost" onClick=${() => setMode(mode === 'edit' ? null : 'edit')}>${mode === 'edit' ? '終わる' : '編集'}</button>`}
    </div>
    ${mode === 'add' && html`<div class="inline"><input autoFocus value=${v} maxLength="16" placeholder=${`${cat}の分類(例: 差し入れ)`} onChange=${(e) => setV(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} /><button class="btn small primary" onClick=${add}>足す</button></div>`}
  </div></div>`;
}

export function EntrySheet({ tx, preset = {}, onClose, page = false }) {
  const app = useApp();
  const conf = getConf();
  const editing = !!tx;
  const init = tx || preset;
  const type0 = init.type || 'out';
  const [type, setType] = useState(type0);
  const [expr, setExpr] = useState(init.amount ? String(init.amount) : '');
  const [cat, setCat] = useState(init.cat || lastCatOf(type0));
  const [catTouched, setCatTouched] = useState(!!init.cat);
  const [date, setDate] = useState(init.date || today());
  const [memo, setMemo] = useState(init.memo || '');
  const moreOf = (x) => ({ store: x.store || '', pay: x.pay || '', note: x.note || '', tags: x.tags || [], photos: (x.photos || []).map((id) => ({ id })) });
  const [more, setMore] = useState(() => moreOf(editing || init.pay ? init : { ...init, pay: lastPay() }));
  const [subcat, setSubcat] = useState(init.sub || '');
  const [kp, setKp] = useState(false); // テンキーは「金額」を押したときだけ
  const midRef = useRef(null);
  const kpRef = useRef(null);
  useEffect(() => {
    if (!kp) return;
    if (page) midRef.current?.scrollTo({ top: 0 });
    else setTimeout(() => kpRef.current?.scrollIntoView({ block: 'end' }), 30);
  }, [kp]);
  const [cont, setCont] = useState(false);
  const [count, setCount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const [items, setItems] = useState(init.items || []);
  const [sub, setSub] = useState(null); // 'more' | 'items' | 'pick'
  const all = useMemo(() => txs(), [S.getVersion()]);
  const hist = useMemo(() => memoHistory(all), [all]);
  const [moreCats, setMoreCats] = useState(false);
  // よく使うカテゴリを前に(ここ90日の回数)
  const usage = useMemo(() => {
    const m = new Map();
    const since = addDays(today(), -90);
    for (const t of all) if (t.date >= since && !t.rec) m.set(t.cat, (m.get(t.cat) || 0) + 1);
    return m;
  }, [all]);
  const baseCats = type === 'inv' ? INV_CATS : catList(type, conf);
  const cats = [...baseCats].map((c, i) => ({ ...c, i })).sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || a.i - b.i);
  const LIMIT = 11;
  const shownCats = moreCats || cats.length <= LIMIT + 1 ? cats : (() => { const top = cats.slice(0, LIMIT); const picked = cats.find((c) => c.id === cat); if (picked && !top.some((c) => c.id === cat)) top[LIMIT - 1] = picked; return top; })();
  const typed = evalExpr(expr);
  // 金額を入れていなければ、内訳の合計を金額にする
  const amount = typed || (type === 'out' ? Math.max(0, itemsSum(items)) : 0);
  const dateRef = useRef(null);

  useEffect(() => {
    if (!catTouched) {
      const g = guessCat(memo, hist);
      if (g && cats.some((c) => c.id === g)) setCat(g);
    }
  }, [memo]);
  useEffect(() => {
    if (!cats.some((c) => c.id === cat)) { const l = lastCatOf(type); setCat(l && cats.some((c) => c.id === l) ? l : null); }
  }, [type]);

  // 前の記録・よく使う記録を、そのまま入れる
  const fill = (x) => {
    setType(x.type || 'out');
    setExpr(x.amount ? String(Math.abs(x.amount)) : '');
    setCat(x.cat);
    setCatTouched(true);
    setMemo(x.memo || '');
    setSubcat(x.sub || '');
    setMore((m) => moreOf({ ...x, pay: x.pay || m.pay }));
    setItems(x.items || []);
  };

  const doSave = async (close) => {
    if (!amount) { setKp(true); return app.toast('金額を入れてください'); }
    const useCat = cat || (type === 'in' ? 'その他収入' : type === 'inv' ? 'その他投資' : 'その他');
    const id = tx?.id || uid('t');
    const rec = { ...(tx || {}), ...(preset.symbol ? { symbol: preset.symbol } : {}), id, type, amount: Math.abs(amount), cat: useCat, date, memo: memo.trim(), pay: type === 'out' ? more.pay : '', t: tx?.t || Date.now(), src: tx?.src || 'manual' };
    delete rec.pending;
    if (type === 'out' && subcat) rec.sub = subcat;
    else delete rec.sub;
    const its = type === 'out' ? cleanItems(items, useCat) : [];
    if (its.length) rec.items = its;
    else delete rec.items;
    const photoIds = await savePhotos(more.photos, tx?.photos || [], id);
    for (const [k, v] of Object.entries({ store: more.store.trim(), note: more.note.trim(), tags: more.tags, photos: photoIds })) {
      if (v.length) rec[k] = v;
      else delete rec[k];
    }
    await S.save('tx', rec);
    if (cat) lsSet('kakeibo:lastcat:' + type, cat);
    if (type === 'out' && !editing) lsSet('kakeibo:lastpay', more.pay);
    vibrate(12);
    const done = `${useCat} ${yen(amount)} を記録`;
    if ((cont || page) && !editing) {
      setCount((c) => c + 1);
      setExpr('');
      setMemo('');
      setItems([]);
      setSubcat('');
      setKp(false);
      setMore((m) => moreOf({ pay: m.pay }));
      setCatTouched(false);
      midRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      app.toast(done, () => S.remove(id));
      return;
    }
    close();
    app.toast(editing ? '直しました' : done, editing ? null : () => S.remove(id));
  };
  const del = async (close) => {
    await S.remove(tx.id);
    close();
    app.toast('消しました', () => S.restore(tx.id));
  };
  const accent = TYPES.find((t) => t.v === type).color;

  if (showReceipt) return html`<${ReceiptSheet} onClose=${() => setShowReceipt(false)} onDone=${page ? () => setShowReceipt(false) : onClose} />`;

  const regLabel = editing ? '直して保存する' : (type === 'in' ? '収入' : type === 'inv' ? '投資' : '支出') + 'を記録する';
  const seg = html`<${Seg} value=${type} onChange=${setType} options=${TYPES} />`;
  const favList = !editing ? favs().filter((f) => f.type === type).slice(0, 8) : [];
  const top = html`
      ${favList.length > 0 && html`<div class="row-chips favs">${favList.map((f) => html`<button key=${f.id} class="chip small" onClick=${() => { vibrate(5); fill(f); }}>${favLabel(f)}</button>`)}</div>`}
      <div class="frow"><span class="fl">日付</span>
        <button class="dn" onClick=${() => setDate(addDays(date, -1))} aria-label="前の日">‹</button>
        <label class="dpill"><b>${+date.slice(5, 7)}月${+date.slice(8)}日(${mdw(date).slice(-2, -1)})</b>${date.slice(0, 4) !== today().slice(0, 4) && html`<small>${date.slice(0, 4)}年</small>`}<input ref=${dateRef} type="date" value=${date} onChange=${(e) => e.target.value && setDate(e.target.value)} class="hidden-date" /></label>
        <button class="dn" onClick=${() => setDate(addDays(date, 1))} aria-label="次の日">›</button>
        ${date !== today() && html`<button class="today-btn" onClick=${() => setDate(today())}>今日</button>`}</div>
      <div class="frow"><span class="fl">内容</span><input class="memo" placeholder="なくてもOK" value=${memo} onFocus=${() => setKp(false)} onChange=${(e) => setMemo(e.target.value)} maxLength="60" />${!editing && html`<button class="hist-btn" onClick=${() => setSub('pick')}>前から</button>`}</div>
      <div class="frow" style=${{ '--ac': accent }}><span class="fl">金額</span>
        <button class=${'afield' + (kp ? ' on' : '')} aria-expanded=${kp} aria-label=${`金額 ${amount}円。押すとテンキー`} onClick=${() => { vibrate(5); document.activeElement?.blur?.(); setKp(!kp); }}><b class="num">${amount ? amount.toLocaleString('ja-JP') : '0'}</b>${/[+\-×÷]/.test(expr) && html`<small class="expr">${expr}</small>`}</button><span class="fu">円</span></div>
      ${tx?.pending && html`<div class="note warn">仮の金額で入っています。明細を見て、金額を直して保存してください。</div>`}
      <div class="cat-grid">
        ${shownCats.map((c) => {
          const ci = catInfo(c.id, conf);
          return html`<button key=${c.id} class=${'cat' + (cat === c.id ? ' on' : '')} aria-pressed=${cat === c.id} style=${{ '--cc': type === 'inv' ? 'var(--c-inv)' : ci.color }} onClick=${() => { vibrate(5); if (c.id !== cat) setSubcat(''); setCat(c.id); setCatTouched(true); }}>
            <${CatIcon} id=${c.id} conf=${conf} /><span class="cn">${c.id}</span></button>`;
        })}
        ${shownCats.length < cats.length
          ? html`<button class="cat more" onClick=${() => setMoreCats(true)}><${Icon} k="list" /><span class="cn">ほか${cats.length - shownCats.length}つ</span></button>`
          : type !== 'inv' && html`<button class="cat more" onClick=${() => { if (!page) onClose(); app.open('cats'); }}><${Icon} k="edit" /><span class="cn">編集</span></button>`}
      </div>
      ${type === 'out' && cat && html`<${SubPicker} cat=${cat} value=${subcat} onChange=${setSubcat} />`}
      ${type === 'out' && html`<div class="pick-row"><span class="fl">払い方</span><div class="pick-body"><div class="row-chips wrap">${[...PAY, ...(more.pay && !PAY.includes(more.pay) ? [more.pay] : [])].map((p) => html`<button key=${p} class=${'chip small' + (more.pay === p ? ' on' : '')} aria-pressed=${more.pay === p} onClick=${() => { vibrate(5); setMore((m) => ({ ...m, pay: m.pay === p ? '' : p })); }}>${PAY_SHORT[p] || p}</button>`)}</div></div></div>`}`;
  const filled = [more.photos.length ? `写真${more.photos.length}` : '', more.store, more.tags.join(' '), more.note ? 'メモ' : '', items.length ? `内訳${items.length}` : ''].filter(Boolean).join('・');
  const tools = html`<div class="ktool">
        <button class="more-btn" onClick=${() => setSub('more')}><${Icon} k="plus" size="16" w="2.2" />詳しく${filled && html`<small>${filled}</small>`}</button>
        ${kp && html`<${React.Fragment}>
        <button class="tax" onClick=${() => amount && setExpr(String(Math.round(amount * 1.08)))}>税込8%</button>
        <button class="tax" onClick=${() => amount && setExpr(String(Math.round(amount * 1.1)))}>税込10%</button>
        <button class="tax kp-close" onClick=${() => { if (/[+\-×÷]/.test(expr)) setExpr(String(evalExpr(expr) || '')); setKp(false); }}>閉じる</button>
        </${React.Fragment}>`}
      </div>`;
  const pad = kp && html`<div ref=${kpRef}><${Keypad} expr=${expr} setExpr=${setExpr} /></div>`;
  const reg = (close) => html`<button class="btn primary wide reg" style=${{ background: accent }} onClick=${() => doSave(close)}>${regLabel}</button>`;

  const subs = html`<${React.Fragment}>
    ${sub === 'more' && html`<${MoreSheet} type=${type} value=${more} onChange=${setMore} itemCount=${items.length} onItems=${() => setTimeout(() => setSub('items'), 220)} onClose=${() => setSub((x) => (x === 'more' ? null : x))} />`}
    ${sub === 'items' && html`<${ItemsSheet} items=${items} cat=${cat} amount=${typed} onDone=${setItems} onClose=${() => setSub(null)} />`}
    ${sub === 'pick' && html`<${PickSheet} type=${type} onPick=${fill} onClose=${() => setSub(null)} />`}
  </${React.Fragment}>`;

  if (page) {
    const key = periodKeyOf(today(), conf.startDay);
    const s = summary(all, key, conf);
    return html`<${React.Fragment}><div class="entry-page">
    <header class="bar"><span class="bar-l"></span>${seg}<button class="icon-btn" onClick=${() => setShowReceipt(true)} aria-label="レシートを読む"><${Icon} k="camera" /></button></header>
    <div class="ep-mid entry" ref=${midRef}>
      <${Totals} compact title="今月の合計" s=${s} onClick=${() => app.go('records')}>${conf.budget > 0 && html`<span class="tt-bud">${conf.budget - s.out >= 0 ? `予算まで あと ${yen(conf.budget - s.out)}` : `予算を ${yen(s.out - conf.budget)} 超過`}</span>`}</${Totals}>
      ${top}</div>
    <div class="ep-bot">${tools}${pad}${reg(() => {})}</div>
  </div>${subs}</${React.Fragment}>`;
  }

  return html`<${React.Fragment}><${Sheet} title=${editing ? '記録を直す' : '記録する'} onClose=${onClose} full
    right=${!editing && html`<button class="icon-btn" onClick=${() => setShowReceipt(true)} aria-label="レシートを読む"><${Icon} k="camera" /></button>`}
    foot=${(close) => reg(close)}>
    ${(close) => html`<div class="entry">
      ${seg}
      ${top}
      ${tools}
      ${pad}
      ${editing && html`<div class="entry-foot"><button class="text-btn danger" onClick=${() => del(close)}>この記録を消す</button></div>`}
      ${!editing && html`<label class="cont"><input type="checkbox" checked=${cont} onChange=${(e) => setCont(e.target.checked)} /> 続けて入力${count ? `(${count})` : ''}</label>`}
    </div>`}
  </${Sheet}>${subs}</${React.Fragment}>`;
}

export function ReceiptSheet({ onClose, onDone }) {
  const app = useApp();
  const conf = getConf();
  const [state, setState] = useState('pick');
  const [img, setImg] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [keepPhoto, setKeepPhoto] = useState(true);
  const fileData = useRef(null);
  const inRef = useRef(null);
  const cats = catList('out', conf).map((c) => c.id);
  const go = async (file) => {
    if (!file) return;
    if (!getKey()) return setErr('レシートを読むには、設定で合言葉を入れてください');
    setState('busy');
    setErr('');
    try {
      const s = await shrink(file);
      fileData.current = file;
      setImg(s.preview);
      const r = await fn('receipt', { image: s.data, mime: 'image/jpeg', categories: cats, today: today() }, 90000);
      if (r.error) throw new Error(r.error);
      const parts = (r.parts?.length ? r.parts : [{ category: 'その他', amount: r.total, memo: '' }]).map((p) => ({ cat: cats.includes(p.category) ? p.category : 'その他', amount: Math.round(+p.amount || 0), memo: p.memo || '', items: (p.items || []).map((x) => ({ n: x.name || '', a: Math.round(+x.price || 0), q: +x.qty || 1, tag: x.tag || '' })) }));
      setRes({ store: r.store || '', date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : today(), total: r.total, pay: r.pay, parts });
      setState('check');
    } catch (e) {
      setErr(e.message || '読めませんでした');
      setState('pick');
    }
  };
  const save = async (close) => {
    const list = res.parts.filter((p) => p.amount > 0).map((p, i) => ({ ...(cleanItems(p.items, p.cat).length ? { items: cleanItems(p.items, p.cat) } : {}), ...(res.store ? { store: res.store.slice(0, 40) } : {}), id: uid('t'), type: 'out', amount: p.amount, cat: p.cat, date: res.date, memo: [res.store, p.memo].filter(Boolean).join(' ').slice(0, 60), pay: /カード/.test(res.pay || '') ? 'カード' : /電子|QR|pay/i.test(res.pay || '') ? 'QR・電子マネー' : /現金/.test(res.pay || '') ? '現金' : '', src: 'receipt', t: Date.now() + i }));
    // レシートの写真も、記録に残す(分けた記録どうしで1枚を共有)
    if (keepPhoto && fileData.current && list.length) {
      const small = await shrink(fileData.current, PHOTO_MAX, 0.68);
      const ids = await savePhotos([{ id: uid('ph'), img: small.preview, fresh: true }]);
      for (const x of list) x.photos = ids;
    }
    await S.saveMany('tx', list);
    close();
    onDone && onDone();
    app.toast(`レシートから ${list.length}件・${yen(list.reduce((s, x) => s + x.amount, 0))} を記録`);
  };
  const upd = (i, k, v) => setRes({ ...res, parts: res.parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const partsSum = res ? res.parts.reduce((s, p) => s + (+p.amount || 0), 0) : 0;
  return html`<${Sheet} title="レシートを読む" onClose=${onClose} full
    foot=${state === 'check' && ((close) => html`<button class="btn primary wide" onClick=${() => save(close)}>この内容で記録(${yen(partsSum)})</button>`)}>
    ${state === 'pick' && html`<div class="receipt-pick">
      <p class="muted">レシート・支払い画面・明細のスクショを撮るか選ぶと、AIが店・日付・金額・カテゴリと、買ったもの(品目)を読み取ります。食料品と日用品が混ざっていれば分けます。</p>
      <button class="btn primary wide big" onClick=${() => inRef.current.click()}>撮る・写真を選ぶ</button>
      <input ref=${inRef} type="file" accept="image/*" hidden onChange=${(e) => go(e.target.files[0])} />
      ${err && html`<div class="note warn">${err}</div>`}
      <div class="note">claude.ai のアプリに写真を貼って「家計簿」と送っても記録できます(設定 → Claudeとの連携)。</div>
    </div>`}
    ${state === 'busy' && html`<div class="receipt-busy">${img && html`<img src=${img} alt="" />`}<div class="spinner"></div><p>読み取り中…</p></div>`}
    ${state === 'check' && res && html`<div class="receipt-check">
      ${img && html`<img class="rc-img" src=${img} alt="レシート" />`}
      <div class="form-grid">
        <label class="field"><span>お店</span><input value=${res.store} onChange=${(e) => setRes({ ...res, store: e.target.value })} /></label>
        <label class="field"><span>日付</span><input type="date" value=${res.date} onChange=${(e) => setRes({ ...res, date: e.target.value })} /></label>
      </div>
      ${res.total && Math.abs(res.total - partsSum) > 1 && html`<div class="note warn">レシートの合計 ${yen(res.total)} と内訳の合計 ${yen(partsSum)} がずれています</div>`}
      ${res.parts.map((p, i) => html`<div key=${i} class="rc-block"><div class="rc-part">
        <select value=${p.cat} onChange=${(e) => upd(i, 'cat', e.target.value)}>${cats.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}</select>
        <input class="rc-memo" value=${p.memo} placeholder="メモ" onChange=${(e) => upd(i, 'memo', e.target.value)} />
        <input class="rc-amt num" inputmode="numeric" value=${p.amount} onChange=${(e) => upd(i, 'amount', +e.target.value.replace(/\D/g, '') || 0)} />
        <button class="icon-btn" aria-label="この行を消す" onClick=${() => setRes({ ...res, parts: res.parts.filter((_, j) => j !== i) })}>✕</button>
      </div>
      <details class="rc-items"><summary>内訳 ${p.items?.length || 0}点</summary><${ItemRows} items=${p.items || []} cat=${p.cat} onChange=${(v) => upd(i, 'items', v)} /></details></div>`)}
      <label class="check"><input type="checkbox" checked=${keepPhoto} onChange=${(e) => setKeepPhoto(e.target.checked)} /> レシートの写真も残す</label>
      <button class="text-btn" onClick=${() => setRes({ ...res, parts: [...res.parts, { cat: 'その他', amount: 0, memo: '' }] })}>＋ 行を足す</button>
    </div>`}
  </${Sheet}>`;
}

// ---- ほかのアプリの記録を貼り付け / CSV で取り込む
function parseLines(text, conf) {
  const cats = [...catList('out', conf), ...catList('in', conf)].map((c) => c.id);
  const hist = memoHistory(txs());
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  const year = today().slice(0, 4);
  for (const ln of lines) {
    const cells = ln.includes('\t') ? ln.split('\t') : ln.includes(',') ? ln.split(',').map((c) => c.replace(/^"|"$/g, '')) : ln.split(/\s+/);
    let date = null, amount = null, cat = null, type = 'out';
    const rest = [];
    for (const raw of cells) {
      const c = raw.trim().normalize('NFKC');
      if (!c) continue;
      let m;
      if (!date && (m = c.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?/))) { date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; continue; }
      if (!date && (m = c.match(/^(\d{1,2})[\/月](\d{1,2})日?$/))) { date = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; continue; }
      if (amount == null && (m = c.match(/^([+\-−]?)[¥￥]?([\d,]+)円?$/))) {
        const v = +m[2].replace(/,/g, '');
        if (v > 0 && v < 1e8) { amount = v; if (m[1] === '+') type = 'in'; continue; }
      }
      if (/^(収入|入金)$/.test(c)) { type = 'in'; continue; }
      if (/^(支出|出金)$/.test(c)) { type = 'out'; continue; }
      const hit = cats.find((x) => x === c);
      if (!cat && hit) { cat = hit; continue; }
      rest.push(c);
    }
    if (!amount) continue;
    const memo = rest.join(' ').slice(0, 60);
    if (!cat) cat = guessCat(memo, hist) || (type === 'in' ? 'その他収入' : 'その他');
    if (['給料', 'メルカリ', '臨時収入', '仕送り', '配当・分配金', 'その他収入'].includes(cat)) type = 'in';
    out.push({ date: date || today(), amount, cat, memo, type, on: true });
  }
  return out;
}
// CSV を1文字ずつ読む(メモの中のカンマ・改行・"" に対応)
function csvRows(text) {
  const out = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
// シンプル家計簿(MoneyNote)の書き出し: #DAILY_DATAS(記録)と #CATEGORIES(カテゴリ名)の2つの表を使う
function parseMoneyNote(text) {
  if (!/^﻿?#DAILY_DATAS/.test(text)) return null;
  const rows = csvRows(text.replace(/^﻿/, ''));
  const sec = {};
  let cur = null;
  for (const r of rows) {
    if (r[0] && r[0].startsWith('#')) { cur = r[0].slice(1); sec[cur] = []; continue; }
    if (cur && r.some((c) => c !== '')) sec[cur].push(r);
  }
  const catName = new Map((sec.CATEGORIES || []).slice(1).map((r) => [r[0], r[1]]));
  const out = [];
  for (const r of (sec.DAILY_DATAS || []).slice(1)) {
    const [d, amt, memo, cid, typ] = r;
    const m = (d || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    const amount = Math.round(+amt);
    if (!m || !(amount > 0)) continue;
    const name = catName.get(cid) || 'その他';
    let type = typ === '1' ? 'in' : 'out';
    let cat = name;
    if (name === '投資') { type = 'out'; cat = '自己投資'; } // 前のアプリの「投資」は自己投資(カメラ・本など)。株の売買ではない
    else if (name === 'バイト' && type === 'out') cat = 'その他';
    out.push({ date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, amount, cat, memo: (memo || '').replace(/\\n/g, ' ').trim().slice(0, 60), type, on: true });
  }
  return out;
}
export function ImportSheet({ onClose }) {
  const app = useApp();
  const conf = getConf();
  const [text, setText] = useState('');
  const mn = useMemo(() => parseMoneyNote(text), [text]);
  const rows = useMemo(() => mn || parseLines(text, conf), [text, mn]);
  const [off, setOff] = useState(new Set());
  const existing = useMemo(() => new Set(txs().map((t) => `${t.date}|${t.amount}|${fold(t.memo)}`)), []);
  // MoneyNote は「日付・種類・金額」が同じ記録を1件ずつ突き合わせる(取り込み済みの分は二重に入れない)
  const mnDup = useMemo(() => {
    if (!mn) return null;
    const have = new Map();
    for (const t of txs()) { const k = `${t.date}|${t.type}|${t.amount}`; have.set(k, (have.get(k) || 0) + 1); }
    return mn.map((r) => { const k = `${r.date}|${r.type}|${r.amount}`; const n = have.get(k) || 0; if (n > 0) { have.set(k, n - 1); return true; } return false; });
  }, [mn]);
  const isDup = (r, i) => (mnDup ? mnDup[i] : existing.has(`${r.date}|${r.amount}|${fold(r.memo)}`));
  const fileRef = useRef(null);
  const loadFile = async (f) => {
    if (!f) return;
    const buf = await f.arrayBuffer();
    let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('shift_jis').decode(buf);
    setText(t);
  };
  const use = rows.filter((r, i) => !off.has(i) && !isDup(r, i));
  const save = async (close) => {
    await S.saveMany('tx', use.map((r, i) => ({ id: uid(mn ? 'mn' : 'i'), type: r.type, amount: r.amount, cat: r.cat, date: r.date, memo: r.memo, src: mn ? 'moneynote' : 'import', t: Date.now() + i })));
    close();
    app.toast(`${use.length}件を取り込みました`);
  };
  return html`<${Sheet} title="まとめて取り込む" onClose=${onClose} full
    foot=${(close) => html`<button class="btn primary wide" disabled=${!use.length} onClick=${() => save(close)}>${use.length}件を記録する</button>`}>
    <p class="muted">今までの家計簿アプリの書き出し(CSV)や、メモ・Claudeの返事を貼り付けてください。1行に「日付・金額・カテゴリ・メモ」があれば、順番はばらばらで大丈夫です。</p>
    <textarea class="paste" rows="6" placeholder=${'例)\n2026/11/20 食費 1280 スーパー\n11/21 ランチ 980\n11/25 給料 +180000'} value=${text} onChange=${(e) => setText(e.target.value)}></textarea>
    <button class="text-btn" onClick=${() => fileRef.current.click()}>CSVファイルを選ぶ</button>
    <input ref=${fileRef} type="file" accept=".csv,.txt,text/*" hidden onChange=${(e) => loadFile(e.target.files[0])} />
    ${mn && html`<div class="note">シンプル家計簿(MoneyNote)の書き出しを見つけました。${mn.length}件のうち、記録ずみ ${mnDup.filter(Boolean).length}件・新しく入れる ${use.length}件です。</div>`}
    ${rows.length > 0 && html`<div class="import-list">
      ${(mn ? rows.map((r, i) => [r, i]).filter(([, i]) => !mnDup[i]).slice(-300) : rows.map((r, i) => [r, i])).map(([r, i]) => {
        const dup = isDup(r, i);
        return html`<label key=${i} class=${'imp-row' + (dup ? ' dup' : '')}>
          <input type="checkbox" checked=${!off.has(i) && !dup} disabled=${dup} onChange=${() => { const n = new Set(off); n.has(i) ? n.delete(i) : n.add(i); setOff(n); }} />
          <span class="d">${r.date.slice(5).replace('-', '/')}</span><span>${r.cat}</span><span class="m">${r.memo}${dup ? '(記録ずみ)' : ''}</span><b class=${'num ' + (r.type === 'in' ? 'in' : '')}>${r.type === 'in' ? '+' : ''}${yen(r.amount)}</b>
        </label>`;
      })}
    </div>`}
  </${Sheet}>`;
}
