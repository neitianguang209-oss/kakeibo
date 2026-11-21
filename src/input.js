// 入力: 1件の記録(電卓つき)・レシートをAIで読む・ほかのアプリの記録を貼り付けて取り込む
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { html, Sheet, Seg, Keypad, evalExpr, useApp } from './ui.js';
import * as S from './store.js';
import { fn, getKey } from './api.js';
import { catList, catInfo, guessCat, INV_CATS, today, addDays, yen, uid, jpDay, mdw, PAY, fold, vibrate } from './util.js';
import { txs, memoHistory, memoSuggest, getConf } from './calc.js';

const TYPES = [
  { v: 'out', label: '支出', color: 'var(--accent)' },
  { v: 'in', label: '収入', color: 'var(--c-in)' },
  { v: 'inv', label: '投資へ', color: 'var(--c-inv)' },
];

export function EntrySheet({ tx, preset = {}, onClose }) {
  const app = useApp();
  const conf = getConf();
  const editing = !!tx;
  const [type, setType] = useState(tx?.type || preset.type || 'out');
  const [expr, setExpr] = useState(tx ? String(tx.amount) : preset.amount ? String(preset.amount) : '');
  const [cat, setCat] = useState(tx?.cat || preset.cat || null);
  const [catTouched, setCatTouched] = useState(!!tx?.cat);
  const [date, setDate] = useState(tx?.date || preset.date || today());
  const [memo, setMemo] = useState(tx?.memo || '');
  const [pay, setPay] = useState(tx?.pay || '');
  const [cont, setCont] = useState(false);
  const [count, setCount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const all = useMemo(() => txs(), []);
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
  const LIMIT = 14;
  const shownCats = moreCats || cats.length <= LIMIT + 1 ? cats : (() => { const top = cats.slice(0, LIMIT); if (cat && !top.some((c) => c.id === cat)) top[LIMIT - 1] = cats.find((c) => c.id === cat); return top; })();
  const sugg = useMemo(() => memoSuggest(all, null, type), [all, type]);
  const amount = evalExpr(expr);
  const dateRef = useRef(null);

  useEffect(() => {
    if (!catTouched) {
      const g = guessCat(memo, hist);
      if (g && cats.some((c) => c.id === g)) setCat(g);
    }
  }, [memo]);
  useEffect(() => {
    if (!cats.some((c) => c.id === cat)) setCat(null);
  }, [type]);

  const doSave = async (close) => {
    if (!amount) return app.toast('金額を入れてください');
    const useCat = cat || (type === 'in' ? 'その他収入' : type === 'inv' ? 'その他投資' : 'その他');
    const id = tx?.id || uid('t');
    const rec = { ...(tx || {}), id, type, amount: Math.abs(amount), cat: useCat, date, memo: memo.trim(), pay, t: tx?.t || Date.now(), src: tx?.src || 'manual' };
    delete rec.pending;
    await S.save('tx', rec);
    vibrate(12);
    if (cont && !editing) {
      setCount((c) => c + 1);
      setExpr('');
      setMemo('');
      setCatTouched(false);
      app.toast(`${useCat} ${yen(amount)} を記録しました`);
      return;
    }
    close();
    app.toast(editing ? '直しました' : `${catInfo(useCat, conf).icon} ${useCat} ${yen(amount)} を記録`, editing ? null : () => S.remove(id));
  };
  const del = async (close) => {
    await S.remove(tx.id);
    close();
    app.toast('消しました', () => S.restore(tx.id));
  };
  const accent = TYPES.find((t) => t.v === type).color;

  if (showReceipt) return html`<${ReceiptSheet} onClose=${() => setShowReceipt(false)} onDone=${onClose} />`;

  return html`<${Sheet} title=${editing ? '記録を直す' : '記録する'} onClose=${onClose} full
    right=${!editing && html`<button class="chip-btn" onClick=${() => setShowReceipt(true)}>📷 レシート</button>`}>
    ${(close) => html`<div class="entry">
      <${Seg} value=${type} onChange=${setType} options=${TYPES} />
      <div class="frow"><span class="fl">日付</span>
        <button class="dn" onClick=${() => setDate(addDays(date, -1))} aria-label="前の日">‹</button>
        <label class="dpill"><b>${date.slice(0, 4)}年${+date.slice(5, 7)}月${+date.slice(8)}日(${mdw(date).slice(-2, -1)})</b><input ref=${dateRef} type="date" value=${date} onChange=${(e) => e.target.value && setDate(e.target.value)} class="hidden-date" /></label>
        <button class="dn" onClick=${() => setDate(addDays(date, 1))} aria-label="次の日">›</button></div>
      <div class="frow"><span class="fl">メモ</span><input class="memo" placeholder="未入力" value=${memo} onChange=${(e) => setMemo(e.target.value)} maxLength="60" /></div>
      <div class="frow amt" style=${{ '--ac': accent }}><span class="fl">${type === 'in' ? '収入' : type === 'inv' ? '投資' : '支出'}</span>
        <div class="afield"><b class="num">${amount ? amount.toLocaleString('ja-JP') : '0'}</b>${/[+\-×÷]/.test(expr) && html`<small class="expr">${expr}</small>`}</div><span class="fu">円</span></div>
      ${tx?.pending && html`<div class="note warn">仮の金額で入っています。明細を見て、金額を直して保存してください。</div>`}
      ${!memo && sugg.length > 0 && html`<div class="row-chips sugg">${sugg.map((s) => html`<button key=${s.memo} class="chip ghost small" onClick=${() => { setMemo(s.memo); if (!catTouched) setCat(s.cat); if (!expr) setExpr(String(s.amount)); }}>${s.memo}</button>`)}</div>`}
      <div class="fl2">カテゴリー</div>
      <div class="cat-grid">
        ${shownCats.map((c) => {
          const ci = catInfo(c.id, conf);
          return html`<button key=${c.id} class=${'cat' + (cat === c.id ? ' on' : '')} style=${{ '--cc': ci.color }} onClick=${() => { vibrate(5); setCat(c.id); setCatTouched(true); }}>
            <span class="ci">${c.icon}</span><span class="cn">${c.id}</span></button>`;
        })}
        ${shownCats.length < cats.length && html`<button class="cat more" onClick=${() => setMoreCats(true)}><span class="ci">⋯</span><span class="cn">ほか${cats.length - shownCats.length}つ</span></button>`}
      </div>
      ${type === 'out' && html`<div class="row-chips">${PAY.map((p) => html`<button key=${p} class=${'chip small' + (pay === p ? ' on' : '')} onClick=${() => setPay(pay === p ? '' : p)}>${p}</button>`)}</div>`}
      ${editing && html`<div class="entry-foot"><button class="text-btn danger" onClick=${() => del(close)}>この記録を消す</button></div>`}
      <div class="ktool">
        ${!editing ? html`<label class="cont"><input type="checkbox" checked=${cont} onChange=${(e) => setCont(e.target.checked)} /> 続けて入力${count ? `(${count})` : ''}</label>` : html`<span></span>`}
        <button class="tax" onClick=${() => amount && setExpr(String(Math.round(amount * 1.08)))}>税込8%</button>
        <button class="tax" onClick=${() => amount && setExpr(String(Math.round(amount * 1.1)))}>税込10%</button>
      </div>
      <${Keypad} expr=${expr} setExpr=${setExpr} onDone=${() => doSave(close)} doneLabel=${editing ? '直す' : '完了'} accent=${accent} />
    </div>`}
  </${Sheet}>`;
}

// ---- 画像を小さくして送る
async function shrink(file, max = 1600) {
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
    const data = c.toDataURL('image/jpeg', 0.82);
    return { data: data.split(',')[1], preview: data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ReceiptSheet({ onClose, onDone }) {
  const app = useApp();
  const conf = getConf();
  const [state, setState] = useState('pick');
  const [img, setImg] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const inRef = useRef(null);
  const cats = catList('out', conf).map((c) => c.id);
  const go = async (file) => {
    if (!file) return;
    if (!getKey()) return setErr('レシートを読むには、設定で合言葉を入れてください');
    setState('busy');
    setErr('');
    try {
      const s = await shrink(file);
      setImg(s.preview);
      const r = await fn('receipt', { image: s.data, mime: 'image/jpeg', categories: cats, today: today() }, 60000);
      if (r.error) throw new Error(r.error);
      const parts = (r.parts?.length ? r.parts : [{ category: 'その他', amount: r.total, memo: '' }]).map((p) => ({ cat: cats.includes(p.category) ? p.category : 'その他', amount: Math.round(+p.amount || 0), memo: p.memo || '' }));
      setRes({ store: r.store || '', date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : today(), total: r.total, pay: r.pay, parts });
      setState('check');
    } catch (e) {
      setErr(e.message || '読めませんでした');
      setState('pick');
    }
  };
  const save = async (close) => {
    const list = res.parts.filter((p) => p.amount > 0).map((p, i) => ({ id: uid('t'), type: 'out', amount: p.amount, cat: p.cat, date: res.date, memo: [res.store, p.memo].filter(Boolean).join(' ').slice(0, 60), pay: /カード/.test(res.pay || '') ? 'カード' : /電子|QR|pay/i.test(res.pay || '') ? 'QR・電子マネー' : /現金/.test(res.pay || '') ? '現金' : '', src: 'receipt', t: Date.now() + i }));
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
      <p class="muted">レシート・支払い画面・明細のスクショを撮るか選ぶと、AIが店・日付・金額・カテゴリを読み取ります。食料品と日用品が混ざっていれば分けます。</p>
      <button class="btn primary wide big" onClick=${() => inRef.current.click()}>📷 撮る・写真を選ぶ</button>
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
      ${res.parts.map((p, i) => html`<div key=${i} class="rc-part">
        <select value=${p.cat} onChange=${(e) => upd(i, 'cat', e.target.value)}>${cats.map((c) => html`<option key=${c} value=${c}>${catInfo(c, conf).icon} ${c}</option>`)}</select>
        <input class="rc-memo" value=${p.memo} placeholder="メモ" onChange=${(e) => upd(i, 'memo', e.target.value)} />
        <input class="rc-amt num" inputmode="numeric" value=${p.amount} onChange=${(e) => upd(i, 'amount', +e.target.value.replace(/\D/g, '') || 0)} />
        <button class="icon-btn" aria-label="この行を消す" onClick=${() => setRes({ ...res, parts: res.parts.filter((_, j) => j !== i) })}>✕</button>
      </div>`)}
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
export function ImportSheet({ onClose }) {
  const app = useApp();
  const conf = getConf();
  const [text, setText] = useState('');
  const rows = useMemo(() => parseLines(text, conf), [text]);
  const [off, setOff] = useState(new Set());
  const existing = useMemo(() => new Set(txs().map((t) => `${t.date}|${t.amount}|${fold(t.memo)}`)), []);
  const fileRef = useRef(null);
  const loadFile = async (f) => {
    if (!f) return;
    const buf = await f.arrayBuffer();
    let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('shift_jis').decode(buf);
    setText(t);
  };
  const use = rows.filter((r, i) => !off.has(i) && !existing.has(`${r.date}|${r.amount}|${fold(r.memo)}`));
  const save = async (close) => {
    await S.saveMany('tx', use.map((r, i) => ({ id: uid('i'), type: r.type, amount: r.amount, cat: r.cat, date: r.date, memo: r.memo, src: 'import', t: Date.now() + i })));
    close();
    app.toast(`${use.length}件を取り込みました`);
  };
  return html`<${Sheet} title="まとめて取り込む" onClose=${onClose} full
    foot=${(close) => html`<button class="btn primary wide" disabled=${!use.length} onClick=${() => save(close)}>${use.length}件を記録する</button>`}>
    <p class="muted">今までの家計簿アプリの書き出し(CSV)や、メモ・Claudeの返事を貼り付けてください。1行に「日付・金額・カテゴリ・メモ」があれば、順番はばらばらで大丈夫です。</p>
    <textarea class="paste" rows="6" placeholder=${'例)\n2026/11/20 食費 1280 スーパー\n11/21 ランチ 980\n11/25 給料 +180000'} value=${text} onChange=${(e) => setText(e.target.value)}></textarea>
    <button class="text-btn" onClick=${() => fileRef.current.click()}>📄 CSVファイルを選ぶ</button>
    <input ref=${fileRef} type="file" accept=".csv,.txt,text/*" hidden onChange=${(e) => loadFile(e.target.files[0])} />
    ${rows.length > 0 && html`<div class="import-list">
      ${rows.map((r, i) => {
        const dup = existing.has(`${r.date}|${r.amount}|${fold(r.memo)}`);
        return html`<label key=${i} class=${'imp-row' + (dup ? ' dup' : '')}>
          <input type="checkbox" checked=${!off.has(i) && !dup} disabled=${dup} onChange=${() => { const n = new Set(off); n.has(i) ? n.delete(i) : n.add(i); setOff(n); }} />
          <span class="d">${r.date.slice(5).replace('-', '/')}</span><span>${catInfo(r.cat, conf).icon} ${r.cat}</span><span class="m">${r.memo}${dup ? '(記録ずみ)' : ''}</span><b class=${'num ' + (r.type === 'in' ? 'in' : '')}>${r.type === 'in' ? '+' : ''}${yen(r.amount)}</b>
        </label>`;
      })}
    </div>`}
  </${Sheet}>`;
}
