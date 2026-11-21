// 設定・固定費とサブスク(自動で記録)
import React, { useState } from 'react';
import { html, useApp, Sheet, Seg, Field, NumInput, Empty } from './ui.js';
import { yen, uid, today, ym, catList, catInfo, addMonths, sum, PAY } from './util.js';
import { txs, getConf, monthlyOf, cashAt, upcoming } from './calc.js';
import * as S from './store.js';
import { getKey, setKey, lsSet, lsGet } from './api.js';

export const VERSION = '1.1.0';

// テーマ(色合い)。収入=青・支出=朱などの「意味のある色」は、どのテーマでも変えない
export const SKINS = [
  { id: 'orange', name: 'オレンジ', c: '#ff8a00' },
  { id: 'mono', name: 'モノトーン', c: '#2b2b2b' },
  { id: 'forest', name: 'フォレスト', c: '#2f8f5b' },
  { id: 'pink', name: 'ドリーミーピンク', c: '#e5719c' },
  { id: 'navy', name: 'ネイビー', c: '#3b5fc4' },
];
export function applySkin(id) {
  document.documentElement.dataset.skin = SKINS.some((s) => s.id === id) ? id : 'orange';
}

export function Settings() {
  const app = useApp();
  const conf = getConf();
  const [key, setK] = useState('');
  const cash = cashAt(txs(), conf);
  const st = S.sync;
  const skin = conf.skin || lsGet('kakeibo:skin') || 'orange';
  const pickSkin = (id) => { applySkin(id); lsSet('kakeibo:skin', id); S.setConf({ skin: id }); };
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
    <header class="bar"><span class="bar-l"></span><h1>メニュー</h1><span class="bar-r"></span></header>

    <h4 class="grp">資産</h4>
    <section class="card">
      <button class="row" onClick=${() => app.go('assets')}><span class="ri">📈</span><span class="rm">資産・株・積立<small>総資産の推移、持っている株、積立の損益</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.open('goal')}><span class="ri">🎯</span><span class="rm">貯める目標<small>${goal?.amount ? `${goal.name || '目標'} ${yen(goal.amount)}` : '未設定'}</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.open('cash')}><span class="ri">👛</span><span class="rm">手元のお金<small>${cash == null ? '未設定(総資産に入れるなら設定)' : yen(cash)}</small></span><span class="chev">›</span></button>
    </section>

    <h4 class="grp">家計の管理</h4>
    <section class="card">
      <button class="row" onClick=${() => app.go('budget')}><span class="rm">予算<small>${conf.budget ? yen(conf.budget) + (Object.keys(conf.catBudgets || {}).length ? `・カテゴリ別 ${Object.keys(conf.catBudgets).length}つ` : '') : '未設定'}</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('recs')}><span class="rm">固定費・サブスク・給料<small>${S.all('rec').filter((r) => r.active !== false).length}件・毎回自動で記録</small></span><span class="chev">›</span></button>
      <label class="row"><span class="rm">月の始まり<small>給料日にすると「給料日〜次の給料日の前日」で1か月</small></span>
        <select value=${conf.startDay} onChange=${(e) => S.setConf({ startDay: +e.target.value })}>${Array.from({ length: 28 }, (_, i) => html`<option key=${i} value=${i + 1}>${i + 1}日から</option>`)}</select></label>
      <button class="row" onClick=${() => app.open('cats')}><span class="rm">カテゴリを足す・隠す</span><span class="chev">›</span></button>
    </section>

    <h4 class="grp">くわしいレポート</h4>
    <section class="card">
      <button class="row" onClick=${() => app.go('report/year')}><span class="rm">年間のレポート<small>1年の収支・月ごとの一覧・カテゴリ</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('report/all')}><span class="rm">全期間のレポート<small>はじめてから今まで</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('assets')}><span class="rm">残高・資産の推移<small>資産のグラフへ</small></span><span class="chev">›</span></button>
    </section>

    <h4 class="grp">見た目</h4>
    <section class="card">
      <div class="skin-row" role="radiogroup" aria-label="テーマ">${SKINS.map((s) => html`<button key=${s.id} role="radio" aria-checked=${skin === s.id} class=${'skin' + (skin === s.id ? ' on' : '')} onClick=${() => pickSkin(s.id)}><i style=${{ background: s.c }}></i><span>${s.name}</span></button>`)}</div>
      <p class="muted small">色合いだけが変わります。収入(青)と支出(朱)の色は、どのテーマでも同じです。</p>
    </section>

    <h4 class="grp">データ</h4>
    <section class="card">
      <div class="card-h"><h3>☁️ 同期</h3></div>
      ${getKey()
        ? html`<div class="row"><span class="rm">スマホとパソコンで同じ記録<small>${st.state === 'err' ? '⚠️ ' + st.msg : st.last ? '最後に同期: ' + new Date(st.last).toLocaleString('ja-JP') : 'まだ'}</small></span><button class="btn small" onClick=${() => S.pull()}>今すぐ</button></div>
          <details><summary class="muted small">合言葉を変える</summary><div class="inline"><input type="password" value=${key} onChange=${(e) => setK(e.target.value)} placeholder="合言葉" /><button class="btn small" onClick=${saveKey}>保存</button></div></details>`
        : html`<p class="muted">じぶんノート・就活アプリと同じ合言葉を入れると、記録がクラウドに保存されて、スマホとパソコンで同じものが見られます。株価の取り寄せとレシートの読み取りにも必要です。</p>
          <div class="inline"><input type="password" value=${key} onChange=${(e) => setK(e.target.value)} placeholder="合言葉" /><button class="btn small primary" onClick=${saveKey}>保存</button></div>`}
    </section>
    <section class="card">
      <button class="row" onClick=${() => app.open('import')}><span class="rm">ほかの家計簿アプリから取り込む<small>シンプル家計簿(MoneyNote)のCSV・貼り付け</small></span><span class="chev">›</span></button>
      <button class="row" onClick=${exportFile}><span class="rm">控えを書き出す(JSON)<small>通信なしでも動きます</small></span><span class="chev">›</span></button>
      <label class="row"><span class="rm">控えから戻す</span><span class="chev">›</span><input type="file" accept=".json,application/json" hidden onChange=${(e) => importFile(e.target.files[0])} /></label>
    </section>

    <h4 class="grp">ヘルプ</h4>
    <section class="card">
      <div class="card-h"><h3>🤖 Claudeとの連携</h3></div>
      <p class="muted">claude.ai のアプリにレシートや支払い画面のスクショを貼って「家計簿」と送ると、Claudeが読み取ってこのアプリに記録します(Claudeへの指示に家計簿のルールを入れてある場合)。記録には「Claude」の印がつきます。</p>
      <p class="muted">アプリの中の 📷 レシート ボタンでも、その場でAIが読み取れます。</p>
    </section>
    <section class="card">
      <div class="card-h"><h3>📱 ホーム画面に置く</h3></div>
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
  const cats = catList('out', conf);
  const sumCat = sum(Object.values(cb), (v) => +v || 0);
  const save = async (close) => {
    const clean = Object.fromEntries(Object.entries(cb).filter(([, v]) => +v > 0).map(([k, v]) => [k, +v]));
    await S.setConf({ budget: +b || 0, catBudgets: clean });
    close();
    app.toast('予算を保存しました');
  };
  return html`<${Sheet} title="月の予算" onClose=${onClose} full foot=${(close) => html`<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <div class="form">
      <${Field} label="1か月の支出の予算(固定費もふくむ)" hint="手取りから、残したい額(目安は2割)と投資の額を引いた金額がおすすめ"><${NumInput} value=${b} onChange=${setB} placeholder="例: 120000" suffix="円" /></${Field}>
    </div>
    <h4 class="sub-h">カテゴリごと(使いすぎやすいものだけでOK)${sumCat ? html` <small>合計 ${yen(sumCat)}</small>` : ''}</h4>
    ${cats.map((c) => html`<div key=${c.id} class="bud-row"><span>${c.icon} ${c.id}</span><${NumInput} value=${cb[c.id] || ''} onChange=${(v) => setCb({ ...cb, [c.id]: v })} placeholder="—" suffix="円" /></div>`)}
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
    <span class="ri" style=${{ '--cc': catInfo(r.cat, conf).color }}>${catInfo(r.cat, conf).icon}</span>
    <span class="rm">${r.name}${r.variable && html`<em class="tag">金額は毎回ちがう</em>`}${r.active === false && html`<em class="tag">止めた</em>`}
      <small>${(+r.every || 1) === 12 ? `毎年${+String(r.start || '').slice(5) || ''}月` : (+r.every || 1) === 2 ? '2か月ごと' : '毎月'}${r.day === 'end' ? '末' : r.day + '日'}・${r.cat}${(() => { const u = up.find((x) => x.rec?.id === r.id); return u ? `・次は${+u.date.slice(5, 7)}/${+u.date.slice(8)}` : ''; })()}</small></span>
    <span class="rv"><b class=${'num ' + (r.type === 'in' ? 'in' : '')}>${yen(r.amount)}</b>${(+r.every || 1) > 1 && html`<small>月 ${yen(monthlyOf(r))}</small>`}</span></button>`;
  return html`<div class="page recs">
    <header class="top"><button class="icon-btn" onClick=${() => history.back()} aria-label="もどる">‹</button><h1>固定費・サブスク</h1><button class="icon-btn" onClick=${() => app.open('rec')} aria-label="追加">＋</button></header>
    <section class="card hero small">
      <div class="label">毎月かならず出ていくお金</div>
      <div class="num hero-num">${yen(m)}</div>
      <div class="sub">年にすると <b class="num">${yen(m * 12)}</b>・登録した日に自動で記録します</div>
    </section>
    <section class="card">
      <div class="card-h"><h3>支出</h3></div>
      ${outs.length ? outs.map(row) : html`<${Empty} icon="📱" title="まだ登録がありません" body="ボイトレ・家賃・スマホ代・サブスクなど、毎月決まって払うものを入れておくと、その日に自動で家計簿に入ります。水道代のように金額が変わるものは、仮の金額で入って「確認してほしいこと」に出ます。" />`}
    </section>
    <section class="card">
      <div class="card-h"><h3>収入(給料など)</h3></div>
      ${ins.length ? ins.map(row) : html`<p class="muted">給料日を登録すると、給料日に「金額を確認」として入ります。</p>`}
    </section>
    <section class="card">
      <div class="card-h"><h3>よくあるものから追加</h3></div>
      <div class="row-chips wrap">${PRESETS.filter((p) => !recs.some((r) => r.name === p.name)).map((p) => html`<button key=${p.name} class="chip" onClick=${() => app.open('rec', { ...p, preset: true })}>${catInfo(p.cat, conf).icon} ${p.name}</button>`)}</div>
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
      <${Field} label="カテゴリ"><div class="row-chips wrap">${cats.map((c) => html`<button key=${c.id} class=${'chip small' + (f.cat === c.id ? ' on' : '')} onClick=${() => set('cat', c.id)}>${c.icon} ${c.id}</button>`)}</div></${Field}>
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
