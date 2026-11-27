// 設定・固定費とサブスク(自動で記録)
import React, { useState, useMemo } from 'react';
import { html, useApp, Sheet, Seg, Field, NumInput, Empty, PageHead } from './ui.js';
import { Icon, CatIcon } from './icons.js';
import { yen, uid, today, ym, catList, catInfo, addMonths, sum, PAY, periodKeyOf } from './util.js';
import { txs, getConf, monthlyOf, cashAt, upcoming, summary } from './calc.js';
import * as S from './store.js';
import { getKey, setKey, lsSet, lsGet } from './api.js';

export const VERSION = '2.1.0';

// 明るさ: 端末に合わせる / ライト / ダーク(この端末だけの設定)
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t === 'dark' ? true : t === 'light' ? false : null;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const isDark = dark ?? /dark/.test(m.media);
    m.content = isDark ? '#000000' : '#f2f2f0';
  });
}

// アクセントの色の見本
export const SKINS = [
  { id: 'orange', name: 'オレンジ', c: '#f07d0a' },
  { id: 'mono', name: 'モノトーン', c: '#2b2b2b' },
  { id: 'forest', name: 'フォレスト', c: '#2f8f5b' },
  { id: 'pink', name: 'ドリーミーピンク', c: '#e5719c' },
  { id: 'navy', name: 'ネイビー', c: '#3b5fc4' },
];
// 色: アクセント・収入・支出。選んでいないものは styles.css の初期値(収入=青・支出=朱)
const COLOR_VARS = { accent: '--accent', in: '--inc', out: '--out' };
export function applyColors({ skin, colors } = {}) {
  const root = document.documentElement;
  root.dataset.skin = SKINS.some((s) => s.id === skin) ? skin : 'orange';
  for (const [k, v] of Object.entries(COLOR_VARS)) {
    if (/^#[0-9a-f]{6}$/i.test(colors?.[k] || '')) root.style.setProperty(v, colors[k]);
    else root.style.removeProperty(v);
  }
}
const SWATCHES = {
  in: ['#1586cc', '#3b5fc4', '#0f9d9a', '#2f8f5b', '#7a5fd0'],
  out: ['#df4d22', '#f07d0a', '#d23a3a', '#d9487e', '#8a6a4a'],
};
function ColorRow({ label, value, base, list, onPick }) {
  const now = value || base;
  return html`<div class="color-row"><span>${label}</span><div>
    <button class=${'sw def' + (!value ? ' on' : '')} style=${{ background: base }} aria-label=${`${label}を初期の色にする`} onClick=${() => onPick('')}><small>初期</small></button>
    ${list.filter((c) => c !== base).map((c) => html`<button key=${c} class=${'sw' + (value === c ? ' on' : '')} style=${{ background: c }} aria-label=${`${label} ${c}`} onClick=${() => onPick(c)}></button>`)}
    <label class=${'sw pick' + (value && !list.includes(value) ? ' on' : '')} style=${value && !list.includes(value) ? { background: value } : null}>＋<input type="color" value=${now} onChange=${(e) => onPick(e.target.value)} aria-label=${`${label}を自由に選ぶ`} /></label>
  </div></div>`;
}

export function Settings() {
  const app = useApp();
  const conf = getConf();
  const [key, setK] = useState('');
  const [theme, setTheme] = useState(lsGet('kakeibo:theme') || 'auto');
  const pickTheme = (t) => { setTheme(t); lsSet('kakeibo:theme', t); applyTheme(t); };
  const cash = cashAt(txs(), conf);
  const st = S.sync;
  const skin = conf.skin || 'orange';
  const colors = conf.colors || {};
  const saveColors = (patch) => { applyColors({ ...conf, ...patch }); S.setConf(patch); };
  const pickSkin = (id) => saveColors({ skin: id, colors: { ...colors, accent: '' } });
  const pickColor = (k, v) => saveColors({ colors: { ...colors, [k]: v } });
  const trash = S.purgeable().length;
  const saveKey = async () => {
    setKey(key.trim());
    S.resetPull();
    setK('');
    await S.pull();
    app.toast(S.sync.state === 'err' ? S.sync.msg : '合言葉を保存して同期しました');
  };
  const exportFile = () => {
    const blob = new Blob([S.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kakeibo-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importFile = (f) => {
    if (!f) return;
    f.text().then(async (t) => {
      try {
        const n = await S.importJson(t);
        app.toast(`${n}件を読みこみました`);
      } catch {
        app.toast('読みこめませんでした');
      }
    });
  };
  const goal = conf.goal;
  return html`<div class="page settings">
    <header class="bar"><span class="bar-l"></span><h1>その他</h1><span class="bar-r"></span></header>

    <h4 class="grp">家計の管理</h4>
    <div class="sec flush">
      <button class="row" onClick=${() => app.go('budget')}><span class="rm"><span class="rt">予算</span><small>${conf.budget ? yen(conf.budget) + (Object.keys(conf.catBudgets || {}).length ? `・カテゴリ別 ${Object.keys(conf.catBudgets).length}つ` : '') : '未設定'}</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('recs')}><span class="rm"><span class="rt">固定費・サブスク・給料</span><small>${S.all('rec').filter((r) => r.active !== false).length}件・毎回自動で記録</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('items')}><span class="rm"><span class="rt">買ったものをさがす</span></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.open('cats')}><span class="rm"><span class="rt">カテゴリを足す・隠す</span></span><span class="chev">›</span></button>
      <label class="row"><span class="rm"><span class="rt">月の始まり</span><small>給料日にすると、給料日から1か月</small></span>
        <select value=${conf.startDay} onChange=${(e) => S.setConf({ startDay: +e.target.value })}>${Array.from({ length: 28 }, (_, i) => html`<option key=${i} value=${i + 1}>${i + 1}日から</option>`)}</select></label>
      <button class="row" onClick=${() => app.open('cash')}><span class="rm"><span class="rt">手元のお金</span><small>${cash == null ? '未設定(総資産に入れるなら設定)' : yen(cash)}</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.open('goal')}><span class="rm"><span class="rt">貯める目標</span><small>${goal?.amount ? `${goal.name || '目標'} ${yen(goal.amount)}` : '未設定'}</small></span><span class="chev">›</span></button>
    </div>

    <h4 class="grp">見た目</h4>
    <section class="card">
      <${Seg} value=${theme} onChange=${pickTheme} options=${[{ v: 'auto', label: '端末に合わせる' }, { v: 'light', label: 'ライト' }, { v: 'dark', label: 'ダーク' }]} />
      <h4 class="sub-h">アクセントの色</h4>
      <div class="skin-row" role="radiogroup" aria-label="アクセントの色">${SKINS.map((s) => html`<button key=${s.id} role="radio" aria-checked=${!colors.accent && skin === s.id} class=${'skin' + (!colors.accent && skin === s.id ? ' on' : '')} onClick=${() => pickSkin(s.id)}><i style=${{ background: s.c }}></i><span>${s.name}</span></button>`)}
        <label class=${'skin' + (colors.accent ? ' on' : '')}><i style=${{ background: colors.accent || 'conic-gradient(#e55, #eb5, #5b6, #58d, #a5d, #e55)' }}></i><span>自由に選ぶ</span><input class="color-hidden" type="color" value=${colors.accent || '#f07d0a'} onChange=${(e) => pickColor('accent', e.target.value)} /></label></div>
      <h4 class="sub-h">金額の色</h4>
      <${ColorRow} label="収入" value=${colors.in} base="#1586cc" list=${SWATCHES.in} onPick=${(v) => pickColor('in', v)} />
      <${ColorRow} label="支出" value=${colors.out} base="#df4d22" list=${SWATCHES.out} onPick=${(v) => pickColor('out', v)} />
    </section>

    <h4 class="grp">データ</h4>
    <section class="card">
      <div class="card-h"><h3>同期</h3></div>
      ${getKey()
        ? html`<div class="row"><span class="rm">スマホとパソコンで同じ記録<small>${st.state === 'err' ? st.msg : st.last ? '最後に同期: ' + new Date(st.last).toLocaleString('ja-JP') : 'まだ'}</small></span><button class="btn small" onClick=${() => S.pull()}>今すぐ</button></div>
          <details><summary class="muted small">合言葉を変える</summary><div class="inline"><input type="password" value=${key} onChange=${(e) => setK(e.target.value)} placeholder="合言葉" /><button class="btn small" onClick=${saveKey}>保存</button></div></details>`
        : html`<p class="muted">じぶんノート・就活アプリと同じ合言葉を入れると、記録がクラウドに保存されて、スマホとパソコンで同じものが見られます。株価の取り寄せとレシートの読み取りにも必要です。</p>
          <div class="inline"><input type="password" value=${key} onChange=${(e) => setK(e.target.value)} placeholder="合言葉" /><button class="btn small primary" onClick=${saveKey}>保存</button></div>`}
    </section>
    <section class="card">
      <button class="row" onClick=${() => app.open('import')}><span class="rm"><span class="rt">ほかの家計簿から取り込む</span><small>CSV・貼り付け</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${exportFile}><span class="rm"><span class="rt">控えを書き出す</span><small>写真もふくめて1つのファイルに</small></span><span class="chev">›</span></button>
      <label class="row"><span class="rm"><span class="rt">控えから戻す</span></span><span class="chev">›</span><input type="file" accept=".json,application/json" hidden onChange=${(e) => importFile(e.target.files[0])} /></label>
      <button class="row" onClick=${() => app.open('purge')}><span class="rm"><span class="rt">消した記録を完全に削除</span><small>${trash ? `${trash.toLocaleString('ja-JP')}件が残っています` : '残っていません'}</small></span><span class="chev">›</span></button>
    </section>

    <h4 class="grp">ヘルプ</h4>
    <section class="card">
      <div class="card-h"><h3>Claudeとの連携</h3></div>
      <p class="muted">claude.ai のアプリにレシートや支払い画面のスクショを貼って「家計簿」と送ると、Claudeが読み取ってこのアプリに記録します(Claudeへの指示に家計簿のルールを入れてある場合)。記録には「Claude」の印がつきます。</p>
      <p class="muted">入力画面の右上のカメラでも、その場でAIが読み取れます。</p>
    </section>
    <section class="card">
      <div class="card-h"><h3>ホーム画面に置く</h3></div>
      <p class="muted">iPhone: Safari で開いて 共有 →「ホーム画面に追加」。Android: Chrome のメニュー →「ホーム画面に追加」。</p>
    </section>
    <p class="fine center">家計簿 v${VERSION}・記録 ${S.all('tx').length}件</p>
    <div class="bottom-space"></div>
  </div>`;
}

export function BudgetSheet({ onClose }) {
  const app = useApp();
  const conf = getConf();
  const [b, setB] = useState(conf.budget ? String(conf.budget) : '');
  const [cb, setCb] = useState({ ...(conf.catBudgets || {}) });
  // 直近3か月(今月より前)の平均を、決めるときの目安に出す。多い順に並べる
  const avg = useMemo(() => {
    const list = txs();
    const cur = periodKeyOf(today(), conf.startDay);
    const prevs = [1, 2, 3].map((i) => summary(list, addMonths(cur, -i), conf)).filter((p) => p.out > 0);
    const m = new Map();
    for (const p of prevs) for (const c of p.byCat) m.set(c.cat, (m.get(c.cat) || 0) + c.amount / prevs.length);
    return { cat: m, total: prevs.length ? sum(prevs, (p) => p.out) / prevs.length : 0 };
  }, []);
  const cats = useMemo(() => [...catList('out', conf)].sort((a, b) => (avg.cat.get(b.id) || 0) - (avg.cat.get(a.id) || 0)), []);
  const sumCat = sum(Object.values(cb), (v) => +v || 0);
  const save = async (close) => {
    const clean = Object.fromEntries(Object.entries(cb).filter(([, v]) => +v > 0).map(([k, v]) => [k, +v]));
    await S.setConf({ budget: +b || 0, catBudgets: clean });
    close();
    app.toast('予算を保存しました');
  };
  return html`<${Sheet} title="月の予算" onClose=${onClose} full foot=${(close) => html`<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <div class="form">
      <${Field} label="1か月の支出の予算(固定費もふくむ)" hint=${avg.total ? `直近3か月の支出の平均は ${yen(avg.total)}` : '手取りから、残したい額と投資の額を引いた金額がおすすめ'}><${NumInput} value=${b} onChange=${setB} placeholder="例: 120000" suffix="円" /></${Field}>
    </div>
    <h4 class="sub-h">カテゴリごと(使いすぎやすいものだけでOK)${sumCat ? html` <small>合計 ${yen(sumCat)}</small>` : ''}</h4>
    ${cats.map((c) => html`<div key=${c.id} class="bud-row"><span><${CatIcon} id=${c.id} conf=${conf} size="20" /><span class="bud-n">${c.id}${avg.cat.get(c.id) > 0 && html`<small class="num">3か月平均 ${yen(avg.cat.get(c.id))}</small>`}</span></span><${NumInput} value=${cb[c.id] || ''} onChange=${(v) => setCb({ ...cb, [c.id]: v })} placeholder="—" suffix="円" /></div>`)}
  </${Sheet}>`;
}

// ---- 消した記録を、端末とクラウドから完全に取りのぞく(戻せないので、控えを保存してから)
export function PurgeSheet({ onClose }) {
  const app = useApp();
  const [saved, setSaved] = useState(false);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows = S.purgeable();
  const kinds = { tx: '収支の記録', lot: '株の売り買い', rec: '固定費', plan: '積立', photo: '写真', fav: 'よく使う', asset: '資産', watch: '気になる株', holding: '銘柄のタグ' };
  const by = rows.reduce((m, r) => m.set(r.kind, (m.get(r.kind) || 0) + 1), new Map());
  const backup = () => {
    const blob = new Blob([JSON.stringify({ app: 'kakeibo', deletedOnly: true, exported: new Date().toISOString(), count: rows.length, items: rows.map(({ id, kind, data, at }) => ({ id, kind, data, at })) })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kakeibo-deleted-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setSaved(true);
  };
  const run = async (close) => {
    setBusy(true);
    setErr('');
    try {
      const n = await S.purge();
      close();
      app.toast(`${n.toLocaleString('ja-JP')}件を完全に削除しました`);
    } catch (e) {
      setErr(e.message || '削除できませんでした');
      setBusy(false);
    }
  };
  return html`<${Sheet} title="消した記録を完全に削除" onClose=${onClose} full
    foot=${(close) => html`<button class="btn wide purge-go" disabled=${!rows.length || !saved || !ok || busy} onClick=${() => run(close)}>${busy ? '削除しています…' : `${rows.length.toLocaleString('ja-JP')}件を完全に削除する`}</button>`}>
    ${rows.length ? html`<${React.Fragment}>
      <p class="muted">アプリで「消した」記録は、画面に出ないだけで、端末とクラウドに残っています。ここで完全に取りのぞきます。<b>元に戻せません。</b>今ある記録は変わりません。</p>
      <div class="sec">${[...by].map(([k, n]) => html`<div key=${k} class="kv"><span>${kinds[k] || k}</span><div class="num right">${n.toLocaleString('ja-JP')}件</div></div>`)}</div>
      <button class="btn wide" onClick=${backup}>${saved ? '控えを保存しました(もう一度保存)' : '1. 削除する分の控えを保存'}</button>
      <label class="check"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /> 2. 元に戻せないことを確認した</label>
      <p class="fine">固定費・積立が自動で入れた記録を消した分は、同じものが作り直されないように残します。</p>
    </${React.Fragment}>` : html`<${Empty} title="削除済みの記録は残っていません" />`}
    ${err && html`<div class="note warn">${err}</div>`}
  </${Sheet}>`;
}

export function CatsSheet({ onClose }) {
  const app = useApp();
  const conf = getConf();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🔖');
  const [type, setType] = useState('out');
  const mine = conf.cats || [];
  const hidden = new Set(mine.filter((c) => c.hidden).map((c) => c.id));
  const add = () => {
    if (!name.trim()) return;
    S.setConf({ cats: [...mine.filter((c) => c.id !== name.trim()), { id: name.trim(), icon, type, g: type === 'in' ? 'in' : 'other' }] });
    setName('');
    app.toast('カテゴリを足しました');
  };
  const toggle = (id) => {
    const has = mine.find((c) => c.id === id);
    if (has && !has.type) S.setConf({ cats: mine.filter((c) => c.id !== id) });
    else if (has) S.setConf({ cats: mine.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)) });
    else S.setConf({ cats: [...mine, { id, hidden: true }] });
  };
  return html`<${Sheet} title="カテゴリ" onClose=${onClose} full>
    <div class="inline"><input class="emoji-in" value=${icon} onChange=${(e) => setIcon([...e.target.value].slice(-1).join('') || '🔖')} aria-label="絵文字" /><input value=${name} onChange=${(e) => setName(e.target.value)} placeholder="新しいカテゴリ名(例: 推し活)" />
      <select value=${type} onChange=${(e) => setType(e.target.value)}><option value="out">支出</option><option value="in">収入</option></select><button class="btn small primary" onClick=${add}>足す</button></div>
    <p class="muted small">押すと入力画面に出す/隠すを切りかえます(記録は消えません)。</p>
    <div class="row-chips wrap">${[...catList('out', { cats: mine.filter((c) => !c.hidden) }), ...catList('in', { cats: mine.filter((c) => !c.hidden) }), ...[...hidden].map((id) => ({ id, icon: catInfo(id, conf).icon }))].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i).map((c) => html`<button key=${c.id} class=${'chip' + (hidden.has(c.id) ? ' off' : ' on')} onClick=${() => toggle(c.id)}>${c.icon} ${c.id}</button>`)}</div>
  </${Sheet}>`;
}

// ---- 固定費・サブスク・給料
const PRESETS = [
  { name: 'ボイトレ', cat: '習い事', amount: 11000, day: 1 },
  { name: '家賃', cat: '住まい', amount: 70000, day: 27 },
  { name: '携帯代', cat: '通信', amount: 3000, day: 26 },
  { name: '電気代', cat: '光熱費', amount: 4000, day: 20, variable: true },
  { name: 'ガス代', cat: '光熱費', amount: 3000, day: 20, variable: true },
  { name: '水道代', cat: '光熱費', amount: 4000, day: 20, variable: true, every: 2 },
  { name: 'Netflix', cat: 'サブスク', amount: 1590, day: 1 },
  { name: 'Spotify', cat: 'サブスク', amount: 980, day: 1 },
  { name: 'Amazonプライム', cat: 'サブスク', amount: 5900, day: 1, every: 12 },
  { name: 'iCloud', cat: 'サブスク', amount: 150, day: 1 },
  { name: 'Claude', cat: 'サブスク', amount: 3000, day: 1 },
  { name: '給料', cat: '給料', amount: 0, day: 25, type: 'in', variable: true },
];
export function Recs() {
  const app = useApp();
  const conf = getConf();
  const recs = S.all('rec');
  const outs = recs.filter((r) => (r.type || 'out') === 'out').sort((a, b) => monthlyOf(b) - monthlyOf(a));
  const ins = recs.filter((r) => r.type === 'in');
  const act = outs.filter((r) => r.active !== false);
  const m = sum(act, monthlyOf);
  const up = upcoming(31);
  const row = (r) => html`<button key=${r.id} class=${'row' + (r.active === false ? ' off' : '')} onClick=${() => app.open('rec', r)}>
    <span class="ri"><${CatIcon} id=${r.cat} conf=${conf} /></span>
    <span class="rm">${r.name}${r.variable && html`<em class="tag">金額は毎回ちがう</em>`}${r.active === false && html`<em class="tag">止めた</em>`}
      <small>${(+r.every || 1) === 12 ? `毎年${+String(r.start || '').slice(5) || ''}月` : (+r.every || 1) === 2 ? '2か月ごと' : '毎月'}${r.day === 'end' ? '末' : r.day + '日'}・${r.cat}${(() => { const u = up.find((x) => x.rec?.id === r.id); return u ? `・次は${+u.date.slice(5, 7)}/${+u.date.slice(8)}` : ''; })()}</small></span>
    <span class="rv"><b class=${'num ' + (r.type === 'in' ? 'in' : '')}>${yen(r.amount)}</b>${(+r.every || 1) > 1 && html`<small>月 ${yen(monthlyOf(r))}</small>`}</span></button>`;
  return html`<div class="page recs">
    <${PageHead} title="固定費・サブスク" right=${html`<button class="icon-btn" onClick=${() => app.open('rec')} aria-label="追加"><${Icon} k="plus" /></button>`} />
    <section class="card hero small">
      <div class="label">毎月かならず出ていくお金</div>
      <div class="num hero-num">${yen(m)}</div>
      <div class="sub">年にすると <b class="num">${yen(m * 12)}</b>・登録した日に自動で記録します</div>
    </section>
    <section class="card">
      <div class="card-h"><h3>支出</h3></div>
      ${outs.length ? outs.map(row) : html`<${Empty} title="まだ登録がありません" body="ボイトレ・家賃・スマホ代・サブスクなど、毎月決まって払うものを入れておくと、その日に自動で家計簿に入ります。水道代のように金額が変わるものは、仮の金額で入って「確認してほしいこと」に出ます。" />`}
    </section>
    <section class="card">
      <div class="card-h"><h3>収入(給料など)</h3></div>
      ${ins.length ? ins.map(row) : html`<p class="muted">給料日を登録すると、給料日に「金額を確認」として入ります。</p>`}
    </section>
    <section class="card">
      <div class="card-h"><h3>よくあるものから追加</h3></div>
      <div class="row-chips wrap">${PRESETS.filter((p) => !recs.some((r) => r.name === p.name)).map((p) => html`<button key=${p.name} class="chip" onClick=${() => app.open('rec', { ...p, preset: true })}>${p.name}</button>`)}</div>
    </section>
    <div class="bottom-space"></div>
  </div>`;
}

export function RecSheet({ rec, onClose }) {
  const app = useApp();
  const conf = getConf();
  const editing = !!rec?.id;
  const [f, setF] = useState({ type: 'out', every: 1, day: 1, start: ym(today()), cat: 'サブスク', pay: '', variable: false, active: true, name: '', amount: '', ...(rec || {}), amount: rec?.amount ? String(rec.amount) : '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const cats = catList(f.type, conf);
  const save = async (close) => {
    if (!f.name.trim()) return app.toast('名前を入れてください');
    if (!+f.amount && !f.variable) return app.toast('金額を入れてください');
    const id = rec?.id || uid('r');
    const { preset, ...rest } = f;
    void preset;
    await S.save('rec', { ...rest, id, name: f.name.trim(), amount: +f.amount || 0, created: rec?.created || today() });
    const { ensureAuto } = await import('./calc.js');
    const n = await ensureAuto();
    close();
    app.toast(editing ? '直しました' : n ? `登録しました(今月の分 ${n}件を記録)` : '登録しました');
  };
  const del = async (close) => {
    await S.remove(rec.id);
    close();
    app.toast('消しました(記録済みの分は残ります)', () => S.restore(rec.id));
  };
  return html`<${Sheet} title=${editing ? '定期の支払いを直す' : '定期の支払いを登録'} onClose=${onClose} full
    foot=${(close) => html`${editing && html`<button class="btn ghost danger" onClick=${() => del(close)}>消す</button>`}<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <div class="form">
      <${Seg} value=${f.type} onChange=${(v) => setF({ ...f, type: v, cat: v === 'in' ? '給料' : 'サブスク' })} options=${[{ v: 'out', label: '支出' }, { v: 'in', label: '収入' }]} />
      <${Field} label="名前"><input value=${f.name} onChange=${(e) => set('name', e.target.value)} placeholder="例: ボイトレ" /></${Field}>
      <${Field} label=${f.variable ? '金額(目安)' : '金額'}><${NumInput} value=${f.amount} onChange=${(v) => set('amount', v)} placeholder="例: 11000" suffix="円" /></${Field}>
      <label class="check"><input type="checkbox" checked=${f.variable} onChange=${(e) => set('variable', e.target.checked)} /> 金額は毎回ちがう(電気・水道・給料など)→ 仮の金額で入れて、確認を知らせる</label>
      <${Field} label="カテゴリ"><div class="row-chips wrap">${cats.map((c) => html`<button key=${c.id} class=${'chip small' + (f.cat === c.id ? ' on' : '')} onClick=${() => set('cat', c.id)}>${c.id}</button>`)}</div></${Field}>
      <div class="form-grid">
        <${Field} label="くり返し"><select value=${f.every} onChange=${(e) => set('every', +e.target.value)}><option value="1">毎月</option><option value="2">2か月ごと</option><option value="3">3か月ごと</option><option value="6">半年ごと</option><option value="12">毎年</option></select></${Field}>
        <${Field} label="日"><select value=${f.day} onChange=${(e) => set('day', e.target.value === 'end' ? 'end' : +e.target.value)}>${Array.from({ length: 31 }, (_, i) => html`<option key=${i} value=${i + 1}>${i + 1}日</option>`)}<option value="end">月末</option></select></${Field}>
      </div>
      <${Field} label=${(+f.every || 1) > 1 ? '最初の月(ここから数えます)' : 'いつから'}><input type="month" value=${f.start} onChange=${(e) => set('start', e.target.value)} /></${Field}>
      ${f.type === 'out' && html`<${Field} label="払い方"><div class="row-chips wrap">${PAY.map((p) => html`<button key=${p} class=${'chip small' + (f.pay === p ? ' on' : '')} onClick=${() => set('pay', f.pay === p ? '' : p)}>${p}</button>`)}</div></${Field}>`}
      ${editing && html`<label class="check"><input type="checkbox" checked=${f.active === false} onChange=${(e) => set('active', !e.target.checked)} /> もう払っていない(解約した)</label>`}
    </div>
  </${Sheet}>`;
}
