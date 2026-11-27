// 資産: 「推移 / 内訳 / 株・投信 / 配当」の4つ。家計簿の手元のお金から、投資と配当までを1か所で見る
import React, { useState, useEffect, useMemo } from 'react';
import { html, useApp, Seg, Sheet, Empty, Field, NumInput } from './ui.js';
import { Icon } from './icons.js';
import { StackChart, Donut, Bars } from './charts.js';
import { yen, pm, pct, tone, today, sum, short, uid, groupBy, md } from './util.js';
import { txs, getConf, cashAt, positions, assetSeries, assetValueAt, assetsAt, unitOf } from './calc.js';
import { Holdings } from './portfolio.js';
import { loadDividends, getDividends } from './quotes.js';
import { quotesForCalc, refreshQuotes, shortName, acctSplit, Watch, NisaCard, GoalCard } from './assets.js';
import { TagEdit } from './detail.js';
import { TxRow } from './home.js';
import * as S from './store.js';
import { getKey } from './api.js';

const TABS = [{ v: 'trend', label: '推移' }, { v: 'split', label: '内訳' }, { v: 'port', label: '株・投信' }, { v: 'div', label: '配当' }];
const RANGES = [{ v: 30, label: '1か月' }, { v: 91, label: '3か月' }, { v: 182, label: '6か月' }, { v: 365, label: '1年' }];
const PAL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', '#d99400', '#e0709f', '#09a5cc', '#a9673c', '#7a9a1e', 'var(--ink3)'];
const KIND = { cash: { label: '現金・預金', color: 'var(--c-cash)' }, fund: { label: '投資信託', color: 'var(--c-fund)' }, stock: { label: '個別株', color: 'var(--c-stock)' }, other: { label: 'その他の資産', color: 'var(--c-oasset)' } };
export const TAG_IDEAS = ['長期保有', '配当目的', '成長株', '優待', 'NISA', '貯金'];

export const holdingMeta = (sym) => S.getOne('h_' + sym) || { symbol: sym, tags: [], dps: null };
export const saveMeta = (sym, patch) => S.save('holding', { ...holdingMeta(sym), ...patch, id: 'h_' + sym, symbol: sym });
export const assetTags = () => [...new Set([...S.all('holding').flatMap((h) => h.tags || []), ...S.all('asset').flatMap((a) => a.tags || []), ...TAG_IDEAS])];

// いまの資産のまとめ
function useWealth() {
  const conf = getConf();
  const list = txs();
  const q = quotesForCalc();
  const fx = q['JPY=X']?.cur;
  const pos = positions(q, fx);
  const open = pos.filter((p) => !p.closed);
  const cash = cashAt(list, conf);
  const by = {
    cash: (cash || 0) + assetsAt('cash'),
    fund: sum(open.filter((p) => p.kind === 'fund'), (p) => p.value || 0),
    stock: sum(open.filter((p) => p.kind === 'stock'), (p) => p.value || 0),
    other: assetsAt('other'),
  };
  return { conf, list, q, fx, pos, open, cash, by, total: sum(Object.values(by)), inv: by.fund + by.stock };
}

export function Wealth({ tab = 'trend', qv }) {
  const app = useApp();
  const w = useWealth();
  const [busy, setBusy] = useState(false);
  useEffect(() => { refreshQuotes(); }, [S.all('lot').length, S.all('plan').length]);
  const reload = async () => { setBusy(true); await refreshQuotes(true); setBusy(false); };
  const t = TABS.some((x) => x.v === tab) ? tab : 'trend';
  return html`<div class="page assets">
    <header class="bar"><span class="bar-l"></span><h1>資産</h1><button class=${'icon-btn' + (busy ? ' spin' : '')} onClick=${reload} aria-label="値段を取り直す"><${Icon} k="reload" size="20" /></button></header>
    <div class="utabs" role="tablist">${TABS.map((x) => html`<button key=${x.v} role="tab" aria-selected=${t === x.v} class=${t === x.v ? 'on' : ''} onClick=${() => { history.replaceState(null, '', '#/assets/' + x.v); window.dispatchEvent(new HashChangeEvent('hashchange')); }}>${x.label}</button>`)}</div>
    ${!getKey() && html`<div class="note">株価・基準価額を取ってくるには、「その他」で合言葉を入れてください。</div>`}
    ${t === 'trend' ? html`<${Trend} w=${w} qv=${qv} />` : t === 'split' ? html`<${Split} w=${w} />` : t === 'port' ? html`<${Port} w=${w} />` : html`<${Dividends} w=${w} qv=${qv} />`}
    <div class="bottom-space"></div>
  </div>`;
}

// ---- 推移: 総資産が主役
function Trend({ w, qv }) {
  const app = useApp();
  const [range, setRange] = useState(91);
  const series = useMemo(() => assetSeries(w.list, w.conf, w.q, w.fx, range), [S.getVersion(), range, qv, Object.keys(w.q).length]);
  const first = series[0]?.total || 0;
  const diff = w.total - first;
  const day = sum(w.open, (p) => p.dayChange || 0);
  const keys = ['cash', 'other', 'fund', 'stock'].filter((k) => series.some((x) => x[k] > 0));
  const label = RANGES.find((r) => r.v === range).label;
  const go = { cash: () => app.go('assets/split'), fund: () => app.go('port/fund'), stock: () => app.go('port/stock'), other: () => app.go('assets/split') };
  const pl = (k) => { const l = w.open.filter((p) => p.kind === k && p.value != null); return l.length ? sum(l, (p) => p.value - p.cost) : null; };
  return html`<${React.Fragment}>
    <div class="totalbox"><div class="label">総資産</div><div class="num hero-num">${yen(w.total)}</div>
      <div class="deltas">
        ${first > 0 && html`<span>${label}前から<b class=${'num ' + tone(diff)}>${pm(diff)}円</b></span>`}
        ${w.open.length > 0 && html`<span>前日の値動き<b class=${'num ' + tone(day)}>${pm(day)}円</b></span>`}
      </div></div>
    <section class="card">
      <${Seg} small value=${range} onChange=${setRange} options=${RANGES} />
      <${StackChart} xs=${series.map((x) => x.ts)} height=${190}
        fmtX=${(t, full) => { const d = new Date(t); return (full ? d.getFullYear() + '/' : '') + `${d.getMonth() + 1}/${d.getDate()}`; }}
        fmtY=${(v, full) => (full ? yen(v) : short(v))}
        series=${keys.map((k) => ({ key: k, label: KIND[k].label, color: KIND[k].color, values: series.map((x) => x[k]) }))} />
    </section>
    <div class="sec flush">${['cash', 'fund', 'stock', 'other'].map((k) => {
      const p = k === 'fund' || k === 'stock' ? pl(k) : null;
      return html`<button key=${k} class="row" onClick=${go[k]}><span class="dot-c" style=${{ background: KIND[k].color }}></span><span class="rm"><span class="rt">${KIND[k].label}</span></span>
        <span class="rv"><b class="num">${yen(w.by[k])}</b>${p != null && html`<em class=${'num ' + tone(p)}>損益 ${pm(p)}円</em>`}</span><span class="chev">›</span></button>`;
    })}</div>
    ${w.cash == null && html`<button class="text-btn" onClick=${() => app.open('cash')}>手元のお金(口座・財布の残高)を入れると、総資産に入ります ›</button>`}
  </${React.Fragment}>`;
}

// ---- 内訳: 何がどれだけあるか。現金・預金とその他の資産はここで直す
function Split({ w }) {
  const app = useApp();
  const [by, setBy] = useState('kind');
  const [picked, setPicked] = useState(null);
  const assets = S.all('asset');
  const priced = w.open.filter((p) => p.value > 0);
  const pairs = () => {
    if (by === 'kind') return Object.keys(KIND).map((k) => [KIND[k].label, w.by[k], KIND[k].color]);
    const cashRow = w.cash > 0 ? [['手元のお金', w.cash]] : [];
    if (by === 'name') return [...cashRow, ...assets.map((a) => [a.name, assetValueAt(a, today())]), ...priced.map((p) => [shortName(p.name), p.value])];
    if (by === 'acct') return [...cashRow, ...assets.map((a) => [a.group === 'other' ? 'その他の資産' : '預金', assetValueAt(a, today())]), ...priced.flatMap((p) => acctSplit(p))];
    const tagged = [...priced.map((p) => [holdingMeta(p.symbol).tags, p.value]), ...assets.map((a) => [a.tags, assetValueAt(a, today())]), ...(w.cash > 0 ? [[['現金'], w.cash]] : [])];
    return tagged.flatMap(([tags, v]) => (tags?.length ? tags.map((g) => [g, v]) : [['タグなし', v]]));
  };
  const parts = [...groupBy(pairs().filter((x) => x[1] > 0), (x) => x[0])].map(([label, l]) => ({ key: label, label, value: sum(l, (x) => x[1]), color: l[0][2] }))
    .sort((a, b) => b.value - a.value).map((x, i) => ({ ...x, color: x.color || PAL[i % PAL.length], fmt: yen(x.value) }));
  const tot = sum(parts, (x) => x.value);
  return html`<${React.Fragment}>
    <${Seg} small value=${by} onChange=${(v) => { setBy(v); setPicked(null); }} options=${[{ v: 'kind', label: '種類' }, { v: 'name', label: '銘柄' }, { v: 'acct', label: '口座' }, { v: 'tag', label: 'タグ' }]} />
    ${parts.length ? html`<div class="donut-wrap"><${Donut} data=${parts} size=${220} thick=${46} labels center=${yen(w.total)} sub="総資産" picked=${picked} onPick=${setPicked} /></div>
      <div class="sec">${parts.map((x) => html`<button key=${x.key} class=${'bd-row' + (picked === x.key ? ' on' : '')} onClick=${() => setPicked(picked === x.key ? null : x.key)}><span><i style=${{ background: x.color }}></i>${x.label}</span><b class="num">${yen(x.value)}</b><em>${Math.round((x.value / (w.total || tot || 1)) * 100)}%</em></button>`)}
      ${by === 'tag' && tot > w.total + 1 && html`<p class="fine">タグを2つ以上つけた資産は、それぞれのタグに数えるので、合計は100%をこえます。</p>`}</div>`
      : html`<${Empty} title="まだ資産がありません" body="下から、手元のお金や口座の残高を入れてください。" />`}
    <h4 class="grp">現金・預金・その他</h4>
    <div class="sec flush">
      <button class="row" onClick=${() => app.open('cash')}><span class="rm"><span class="rt">手元のお金</span><small>記録に合わせて自動で増減</small></span><b class="num">${w.cash == null ? '未設定' : yen(w.cash)}</b><span class="chev">›</span></button>
      ${assets.map((a) => html`<button key=${a.id} class="row" onClick=${() => app.open('asset', a)}><span class="rm"><span class="rt">${a.name}</span><small>${[a.group === 'other' ? 'その他' : '預金', ...(a.tags || [])].join('・')}・${md((a.history || []).at(-1)?.[0] || today())}に更新</small></span><b class="num">${yen(assetValueAt(a, today()))}</b><span class="chev">›</span></button>`)}
      <button class="row" onClick=${() => app.open('asset')}><span class="rm"><span class="rt" style=${{ color: 'var(--accent)' }}>＋ 口座・資産を足す</span></span></button>
    </div>
    <${GoalCard} total=${w.total} list=${w.list} conf=${w.conf} />
    <${NisaCard} q=${w.q} open=${w.open} />
  </${React.Fragment}>`;
}

// ---- 株・投信: 持っているもの。タグでしぼると、自分だけのポートフォリオになる
function Port({ w }) {
  const app = useApp();
  const [tag, setTag] = useState('');
  const tags = [...new Set(w.open.flatMap((p) => holdingMeta(p.symbol).tags || []))];
  const pos = tag ? w.pos.filter((p) => (holdingMeta(p.symbol).tags || []).includes(tag)) : w.pos;
  const open = pos.filter((p) => !p.closed && p.value != null);
  const value = sum(open, (p) => p.value), cost = sum(open, (p) => p.cost);
  const loose = sum(w.list.filter((t) => t.type === 'inv' && !['lot', 'plan', 'moneynote', 'import'].includes(t.src) && !String(t.id).startsWith('l_')), (t) => t.amount);
  return html`<${React.Fragment}>
    ${value > 0 && html`<div class="totalbox"><div class="label">${tag || '投資ぜんぶ'}の評価額</div><div class="num hero-num">${yen(value)}</div>
      <div class="deltas"><span>元本<b class="num">${yen(cost)}</b></span><span>含み損益<b class=${'num ' + tone(value - cost)}>${pm(value - cost)}円 ${cost ? pct((value - cost) / cost) : ''}</b></span></div></div>`}
    ${tags.length > 0 && html`<div class="row-chips"><button class=${'chip small' + (!tag ? ' on' : '')} onClick=${() => setTag('')}>すべて</button>${tags.map((g) => html`<button key=${g} class=${'chip small' + (tag === g ? ' on' : '')} onClick=${() => setTag(g)}>${g}</button>`)}</div>`}
    ${tag && html`<p class="fine">タグは、銘柄を開いた画面でつけられます。</p>`}
    <${Holdings} pos=${pos} q=${w.q} />
    ${loose > 0 && html`<div class="note">家計簿で「投資へ」と記録した ${yen(loose)} は、まだ株・投信として登録されていないので、評価額に入っていません。<button class="text-btn" onClick=${() => app.open('lot')}>持っている株・投信を登録する ›</button></div>`}
    <${Watch} q=${w.q} />
    <div class="sec flush">
      <button class="row" onClick=${() => app.go('earnings')}><span class="rm"><span class="rt">決算の予定</span></span><span class="chev">›</span></button>
      <button class="row" onClick=${() => app.go('compare')}><span class="rm"><span class="rt">指数とくらべる</span></span><span class="chev">›</span></button>
    </div>
    <p class="fine">値段は Yahoo!ファイナンス・三菱UFJアセットマネジメントの公開データ。株価は約20分遅れ、投信は前営業日の基準価額。積立の口数は計算した目安で、「口数を合わせる」で直せます。</p>
  </${React.Fragment}>`;
}

// ---- 配当: 予想(直近1年の1株配当 × いまの数)と、実際に受け取った額
export function dividendOf(p, divs, fx) {
  const meta = holdingMeta(p.symbol);
  const d = divs[p.symbol];
  const since = Date.now() - 366 * 864e5;
  const last = (d?.events || []).filter((e) => e[0] > since && e[0] <= Date.now());
  const auto = sum(last, (e) => e[1]);
  const manual = meta.dps != null && meta.dps !== '';
  const dps = manual ? +meta.dps : auto;
  const rate = p.currency === 'USD' ? fx || 150 : 1;
  const annual = (dps * p.qty * rate) / unitOf(p.symbol);
  // 入金の月の目安: 日本株は権利落ちのおよそ3か月後、米国株は1か月後
  const lag = /\.T$/.test(p.symbol) ? 3 : 1;
  const months = Array(12).fill(0);
  if (annual > 0) {
    if (auto > 0) for (const [ts, a] of last) months[(new Date(ts).getMonth() + lag) % 12] += (annual * a) / auto;
    else for (const m of [5, 11]) months[m] += annual / 2;
  }
  return { auto, dps, manual, annual, months, known: manual || !!d?.events };
}

function Dividends({ w, qv }) {
  const app = useApp();
  const syms = w.open.map((p) => p.symbol);
  useEffect(() => { loadDividends(syms); }, [syms.join()]);
  const divs = getDividends();
  const rows = w.open.map((p) => ({ p, ...dividendOf(p, divs, w.fx) })).sort((a, b) => b.annual - a.annual);
  const paying = rows.filter((r) => r.annual > 0);
  const annual = sum(paying, (r) => r.annual);
  const value = sum(w.open, (p) => p.value || 0), cost = sum(w.open, (p) => p.cost || 0);
  const got = w.list.filter((t) => t.type === 'in' && (t.cat === '配当・分配金' || t.sub === '配当・分配金'));
  const [year, setYear] = useState(+today().slice(0, 4));
  const gotYear = got.filter((t) => t.date.startsWith(String(year)));
  const months = Array.from({ length: 12 }, (_, i) => sum(paying, (r) => r.months[i]));
  const actual = Array.from({ length: 12 }, (_, i) => sum(gotYear.filter((t) => +t.date.slice(5, 7) === i + 1), (t) => t.amount));
  const thisYear = +today().slice(0, 4);
  return html`<${React.Fragment}>
    <div class="totalbox"><div class="label">1年間の予想配当(税引前)</div><div class="num hero-num">${yen(annual)}</div>
      <div class="deltas">
        ${annual > 0 && html`<span>ひと月あたり<b class="num">${yen(annual / 12)}</b></span>`}
        ${annual > 0 && value > 0 && html`<span>利回り<b class="num">${((annual / value) * 100).toFixed(2)}%</b></span>`}
        ${annual > 0 && cost > 0 && html`<span>買値に対して<b class="num">${((annual / cost) * 100).toFixed(2)}%</b></span>`}
      </div></div>
    <section class="card">
      <div class="card-h"><h3>月ごと</h3><${Seg} small value=${year} onChange=${setYear} options=${[{ v: thisYear - 1, label: `${thisYear - 1}年` }, { v: thisYear, label: `${thisYear}年` }]} /></div>
      <${Bars} labels=${Array.from({ length: 12 }, (_, i) => String(i + 1))} fmt=${(v, full) => (full ? yen(v) : short(v))}
        series=${[...(year === thisYear ? [{ key: 'f', label: '予想(入金の目安)', color: 'var(--ink3)', values: months.map(Math.round) }] : []), { key: 'a', label: '受け取った', color: 'var(--inc)', values: actual }]} />
    </section>
    <h4 class="grp">銘柄ごと</h4>
    ${rows.length ? html`<div class="sec flush">${rows.map((r) => html`<button key=${r.p.symbol} class="row" onClick=${() => app.go('stock/' + encodeURIComponent(r.p.symbol))}>
      <span class="rm"><span class="rt">${shortName(r.p.name)}</span><small>${r.annual > 0 ? `${r.p.kind === 'fund' ? '1万口' : '1株'}あたり年 ${r.p.currency === 'USD' ? '$' : ''}${(+r.dps.toFixed(2)).toLocaleString()}${r.p.currency === 'USD' ? '' : '円'}${r.manual ? '(自分で入力)' : ''}` : r.p.kind === 'fund' ? '分配金なし(入力もできます)' : r.known ? '直近1年の配当なし' : '調べています…'}</small></span>
      <span class="rv"><b class="num">${yen(r.annual)}</b>${r.annual > 0 && r.p.value > 0 && html`<em class="num">${((r.annual / r.p.value) * 100).toFixed(2)}%</em>`}</span><span class="chev">›</span></button>`)}</div>`
      : html`<${Empty} title="持っている株がまだありません" body="「株・投信」で登録すると、予想の配当がここに出ます。" />`}
    <h4 class="grp">受け取った配当${got.length ? `(合計 ${yen(sum(got, (t) => t.amount))})` : ''}</h4>
    <div class="sec flush">
      ${got.slice(0, 20).map((t) => html`<${TxRow} key=${t.id} t=${{ ...t, memo: `${t.date.slice(0, 4)}/${md(t.date)} ${t.memo || ''}` }} conf=${w.conf} />`)}
      <button class="row" onClick=${() => app.edit(null, { type: 'in', cat: 'その他収入', sub: '配当・分配金' })}><span class="rm"><span class="rt" style=${{ color: 'var(--accent)' }}>＋ 受け取った配当を記録する</span></span></button>
    </div>
    <p class="fine">予想は「直近1年の1株配当 × いま持っている数」の目安です(会社の発表前の変更は入りません)。入金の月は、日本株は権利落ちの約3か月後、米国株は約1か月後として置いています。NISA以外は約20%の税金が引かれます。</p>
  </${React.Fragment}>`;
}

// ---- 銘柄の画面に出す「タグと配当」
export function HoldingCard({ p }) {
  const app = useApp();
  const meta = holdingMeta(p.symbol);
  useEffect(() => { loadDividends([p.symbol]); }, [p.symbol]);
  const d = dividendOf(p, getDividends(), quotesForCalc()['JPY=X']?.cur);
  const [dps, setDps] = useState(meta.dps != null ? String(meta.dps) : '');
  const unit = p.kind === 'fund' ? '1万口' : '1株';
  return html`<section class="card">
    <div class="card-h"><h3>配当</h3><button class="text-btn" onClick=${() => app.edit(null, { type: 'in', cat: 'その他収入', sub: '配当・分配金', symbol: p.symbol, memo: shortName(p.name) })}>受け取りを記録 ›</button></div>
    <div class="pl-grid"><div><span>1年の予想(税引前)</span><b class="num">${yen(d.annual)}</b></div><div><span>利回り</span><b class="num">${d.annual && p.value ? ((d.annual / p.value) * 100).toFixed(2) + '%' : '—'}</b></div></div>
    <${Field} label=${`${unit}あたりの年間配当(${p.currency === 'USD' ? 'ドル' : '円'})`} hint=${d.auto ? `空にすると、直近1年の実績 ${+d.auto.toFixed(2)} を使います` : '自動で取れないときは、ここに入れると予想に使います'}>
      <div class="inline" style=${{ margin: 0 }}><${NumInput} value=${dps} onChange=${setDps} placeholder=${d.auto ? String(+d.auto.toFixed(2)) : ''} /><button class="btn small" onClick=${async () => { await saveMeta(p.symbol, { dps: dps === '' ? null : +dps }); app.toast('配当を保存しました'); }}>保存</button></div></${Field}>
    <${Field} label="タグ(自分の分け方)"><div></div></${Field}>
    <${TagEdit} tags=${meta.tags || []} known=${assetTags()} onChange=${(tags) => saveMeta(p.symbol, { tags })} />
  </section>`;
}

// ---- 口座・その他の資産を足す・直す
export function AssetSheet({ asset, onClose }) {
  const app = useApp();
  const editing = !!asset?.id;
  const [name, setName] = useState(asset?.name || '');
  const [group, setGroup] = useState(asset?.group || 'cash');
  const [amount, setAmount] = useState(editing ? String(assetValueAt(asset, today())) : '');
  const [tags, setTags] = useState(asset?.tags || []);
  const save = async (close) => {
    if (!name.trim() || amount === '') return app.toast('名前と残高を入れてください');
    const history = [...(asset?.history || []).filter((h) => h[0] !== today()), [today(), +amount || 0]];
    await S.save('asset', { ...(asset || {}), id: asset?.id || uid('as'), name: name.trim(), group, tags, history });
    close();
    app.toast('保存しました');
  };
  const del = async (close) => {
    await S.remove(asset.id);
    close();
    app.toast('消しました', () => S.restore(asset.id));
  };
  return html`<${Sheet} title=${editing ? '残高を直す' : '口座・資産を足す'} onClose=${onClose} full
    foot=${(close) => html`${editing && html`<button class="btn ghost danger" onClick=${() => del(close)}>消す</button>`}<button class="btn primary wide" onClick=${() => save(close)}>保存</button>`}>
    <div class="note">「手元のお金」にふくめていない口座だけを足してください(同じお金を2回数えないように)。ここの残高は、直したときだけ変わります。</div>
    <div class="form">
      <${Seg} value=${group} onChange=${setGroup} options=${[{ v: 'cash', label: '現金・預金' }, { v: 'other', label: 'その他' }]} />
      <${Field} label="名前"><input value=${name} onChange=${(e) => setName(e.target.value)} placeholder=${group === 'cash' ? '例: ゆうちょ貯金' : '例: ポイント'} maxLength="30" /></${Field}>
      <${Field} label="今の残高"><${NumInput} value=${amount} onChange=${setAmount} placeholder="例: 100000" suffix="円" /></${Field}>
      <${Field} label="タグ"><div></div></${Field}><${TagEdit} tags=${tags} onChange=${setTags} known=${assetTags()} />
    </div>
  </${Sheet}>`;
}
