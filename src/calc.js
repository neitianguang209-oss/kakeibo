// 計算: 月のまとめ・定期の自動記録・積立・資産の評価・見直しのヒント
import * as S from './store.js';
import { today, ym, addMonths, dayOf, periodOf, periodKeyOf, addDays, sum, groupBy, parseD, daysInMonth, fold, catInfo, yen, short } from './util.js';

export const DEFAULT_CONF = { startDay: 1, budget: 0, catBudgets: {}, cashStart: null, planCash: true };
export const getConf = () => ({ ...DEFAULT_CONF, ...S.conf() });

export const isFundSym = (s) => /^[0-9A-Z]{8}$/.test(s || '');
export const unitOf = (sym) => (isFundSym(sym) ? 10000 : 1); // 投信の基準価額は1万口あたり

// ---- 記録
export function txs() {
  return S.all('tx').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.t || 0) - (a.t || 0)));
}
export function txIn(list, start, end) {
  return list.filter((t) => t.date >= start && t.date <= end);
}

// ---- 定期(固定費・サブスク・給料)
// 毎月(every=1)・2か月ごと(2)・毎年(12)。day は 1〜31 か 'end'
function recDue(rec, m) {
  const start = rec.start || ym(rec.created || today());
  if (m < start) return null;
  if (rec.end && m > rec.end) return null;
  const every = +rec.every || 1;
  const [sy, sm] = start.split('-').map(Number);
  const [y, mm] = m.split('-').map(Number);
  const diff = (y - sy) * 12 + (mm - sm);
  if (diff % every) return null;
  return dayOf(m, rec.day === 'end' ? 'end' : +rec.day || 1);
}
// 期日が来たものを記録に入れる(id が決まっているので、2台で同時に開いても1件)
export async function ensureAuto() {
  const t = today();
  const cur = ym(t);
  const add = [];
  for (const r of S.all('rec')) {
    if (r.active === false) continue;
    let m = r.start || ym(r.created || t);
    for (let i = 0; i < 400 && m <= cur; i++, m = addMonths(m, 1)) {
      const due = recDue(r, m);
      if (!due || due > t) continue;
      const id = `r_${r.id}_${m}`;
      if (S.exists(id)) continue;
      add.push({ id, date: due, type: r.type || 'out', amount: +r.amount || 0, cat: r.cat, memo: r.name, rec: r.id, pending: !!r.variable, src: 'rec', pay: r.pay || '' });
    }
  }
  const conf = getConf();
  if (conf.planCash !== false) {
    for (const p of S.all('plan')) {
      if (p.active === false || p.cash === false) continue;
      for (const b of planBuys(p, null)) {
        const id = `p_${p.id}_${ym(b.date)}`;
        if (S.exists(id) || b.date < (p.cashFrom || p.start)) continue;
        add.push({ id, date: b.date, type: 'inv', amount: b.amount, cat: '積立', memo: `${p.name} 積立`, plan: p.id, src: 'plan' });
      }
    }
  }
  if (add.length) await S.saveMany('tx', add);
  return add.length;
}
// これから来る定期の支払い(予定)
export function upcoming(days = 35) {
  const t = today();
  const until = addDays(t, days);
  const out = [];
  for (const r of S.all('rec')) {
    if (r.active === false) continue;
    for (let m = ym(t), i = 0; i < 3; i++, m = addMonths(m, 1)) {
      const due = recDue(r, m);
      if (due && due > t && due <= until) out.push({ date: due, rec: r, amount: +r.amount || 0 });
    }
  }
  for (const p of S.all('plan')) {
    if (p.active === false) continue;
    for (let m = ym(t), i = 0; i < 2; i++, m = addMonths(m, 1)) {
      const d = dayOf(m, +p.day || 1);
      if (d > t && d <= until && d >= p.start) out.push({ date: d, plan: p, amount: +p.amount || 0 });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
// 月額にならす(年払いは12で割る)
export const monthlyOf = (r) => (+r.amount || 0) / (+r.every || 1);

// ---- 投資(表示用)は積立がもと: その期間の積立日が来た分 + 手で「投資へ」と記録した分。
// 株の売り買い(lot)にともなう記録は、手元のお金の計算には使うが、投資の合計には入れない
export const isLotTx = (t) => t.src === 'lot' || String(t.id).startsWith('l_');
export function investIn(list, start, end) {
  const rows = [];
  for (const p of S.all('plan')) {
    if (p.active === false && !p.stopFrom) continue;
    for (const b of planBuys(p, null)) if (b.date >= start && b.date <= end) rows.push({ date: b.date, amount: b.amount, name: p.name, symbol: p.symbol });
  }
  for (const t of txIn(list, start, end)) {
    if (t.type !== 'inv' || t.src === 'plan' || t.plan || isLotTx(t)) continue;
    rows.push({ date: t.date, amount: +t.amount || 0, name: t.memo || t.cat, tx: t.id });
  }
  return rows;
}

// ---- 月のまとめ
export function summary(list, key, conf) {
  const p = periodOf(key, conf.startDay);
  const inP = txIn(list, p.start, p.end);
  const out = inP.filter((t) => t.type === 'out');
  const inc = inP.filter((t) => t.type === 'in');
  const invRows = investIn(list, p.start, p.end);
  const byCat = [...groupBy(out, (t) => t.cat || 'その他')].map(([cat, l]) => ({ cat, amount: sum(l, (t) => t.amount), n: l.length })).sort((a, b) => b.amount - a.amount);
  const incByCat = [...groupBy(inc, (t) => t.cat || 'その他収入')].map(([cat, l]) => ({ cat, amount: sum(l, (t) => t.amount), n: l.length })).sort((a, b) => b.amount - a.amount);
  const fixed = sum(out.filter((t) => t.rec), (t) => t.amount);
  // 定期(固定費)を除いた、ふだんの出費のカテゴリ別
  const byCatVar = [...groupBy(out.filter((t) => !t.rec), (t) => t.cat || 'その他')].map(([cat, l]) => ({ cat, amount: sum(l, (t) => t.amount), n: l.length })).sort((a, b) => b.amount - a.amount);
  return {
    ...p, list: inP, outList: out,
    out: sum(out, (t) => t.amount), in: sum(inc, (t) => t.amount), inv: sum(invRows, (t) => t.amount), invRows,
    fixed, variable: sum(out, (t) => t.amount) - fixed, byCat, byCatVar, incByCat,
    pending: inP.filter((t) => t.pending),
  };
}

// 手元のお金(現金+口座)。最初の残高から、収入を足し、支出と投資に回した分を引く。「残高あわせ」(adj)で実際に合わせられる
export function cashAt(list, conf, date = today()) {
  const cs = conf.cashStart;
  if (!cs || cs.amount == null) return null;
  let v = +cs.amount || 0;
  for (const t of list) {
    if (t.date < cs.date || t.date > date) continue;
    if (t.type === 'in') v += +t.amount || 0;
    else if (t.type === 'out' || t.type === 'inv') v -= +t.amount || 0;
    else if (t.type === 'adj') v += +t.amount || 0;
  }
  return v;
}

// ---- 値段の推移から、その日の値段(その日より前で一番近い終値)
export function priceAt(q, dateStr) {
  const pts = q?.points;
  if (!pts?.length) return q?.cur ?? null;
  const ts = parseD(dateStr).getTime() + 86399e3;
  let lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= ts) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? pts[ans][1] : pts[0][1];
}
// 買った日の値段(その日以降で一番近い値段 = 約定の目安)
function priceOnOrAfter(q, dateStr) {
  const pts = q?.points;
  if (!pts?.length) return q?.cur ?? null;
  const ts = parseD(dateStr).getTime() - 12 * 3600e3;
  const hit = pts.find((p) => p[0] >= ts);
  return hit ? hit[1] : q.cur ?? pts.at(-1)[1];
}

// ---- 積立: 毎月 day 日に amount 円ずつ買ったとして、口数を数える
export function planBuys(p, q) {
  const t = today();
  const out = [];
  if (!p.start) return out;
  let m = ym(p.start);
  const endM = p.end ? ym(p.end) : ym(t);
  for (let i = 0; i < 600 && m <= endM; i++, m = addMonths(m, 1)) {
    const d = dayOf(m, +p.day || 1);
    if (d < p.start || d > t) continue;
    if (p.stopFrom && d >= p.stopFrom) break;
    const amt = (p.changes || []).filter((c) => c.from <= d).sort((a, b) => (a.from < b.from ? 1 : -1))[0]?.amount ?? +p.amount;
    if (!amt) continue;
    const nav = q ? priceOnOrAfter(q, d) : null;
    out.push({ date: d, amount: +amt, nav, units: nav ? (+amt / nav) * unitOf(p.symbol) : 0 });
  }
  return out;
}

// ---- 保有(買った・売った記録 lot と 積立 plan をまとめて、銘柄ごとに)
export function positions(quotes, fx) {
  const map = new Map();
  const getPos = (sym, name, acct) => {
    if (!map.has(sym)) map.set(sym, { symbol: sym, name: name || sym, qty: 0, cost: 0, realized: 0, buys: [], accts: new Set(), byAcct: {}, plan: null });
    const p = map.get(sym);
    if (acct) p.accts.add(acct);
    return p;
  };
  const lots = S.all('lot').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t || 0) - (b.t || 0)));
  for (const l of lots) {
    const p = getPos(l.symbol, l.name, l.acct);
    const u = unitOf(l.symbol);
    const rate = l.currency === 'USD' ? +l.fx || fx || 150 : 1;
    if (l.side === 'sell') {
      const q = Math.min(+l.qty, p.qty);
      const avg = p.qty ? p.cost / p.qty : 0;
      p.realized += (q * +l.price * rate) / u - avg * q - (+l.fee || 0);
      p.cost -= avg * q;
      p.qty -= q;
      // 売った分は、その口座の持ち分から引く
      const a = l.acct || '';
      p.byAcct[a] = (p.byAcct[a] || 0) - q;
    } else {
      p.byAcct[l.acct || ''] = (p.byAcct[l.acct || ''] || 0) + +l.qty;
      p.qty += +l.qty;
      p.cost += (+l.qty * +l.price * rate) / u + (+l.fee || 0);
      p.buys.push({ date: l.date, price: +l.price, qty: +l.qty, from: 'lot' });
    }
  }
  for (const pl of S.all('plan')) {
    const q = quotes[pl.symbol];
    const p = getPos(pl.symbol, pl.name, pl.acct || 'NISA つみたて');
    const buys = planBuys(pl, q);
    const pa = pl.acct || 'NISA つみたて';
    p.byAcct[pa] = (p.byAcct[pa] || 0) + (+pl.base?.units || 0) + sum(buys.filter((b) => !(pl.base?.date && b.date <= pl.base.date)), (b) => b.units);
    if (pl.base && +pl.base.units) {
      p.qty += +pl.base.units;
      p.cost += +pl.base.cost || 0;
    }
    for (const b of buys) {
      if (pl.base?.date && b.date <= pl.base.date) continue; // 口数を合わせた日より前は、合わせた数に含まれている
      p.qty += b.units;
      p.cost += b.amount;
    }
    p.plan = pl;
    p.planBuys = buys;
    p.estimated = !q?.points?.length;
  }
  const out = [];
  for (const p of map.values()) {
    if (p.qty <= 1e-9 && !p.plan) {
      if (p.realized) out.push({ ...p, value: 0, closed: true, accts: [...p.accts], kind: isFundSym(p.symbol) ? 'fund' : 'stock' });
      continue;
    }
    const q = quotes[p.symbol];
    const u = unitOf(p.symbol);
    const rate = q?.currency === 'USD' ? fx || 150 : 1;
    const price = q?.cur ?? null;
    const value = price != null ? (p.qty * price * rate) / u : null;
    const dayChange = price != null && q?.prev ? (p.qty * (price - q.prev) * rate) / u : 0;
    const held = Object.keys(p.byAcct).filter((a) => a && p.byAcct[a] > 1e-9);
    out.push({ ...p, accts: held.length || !p.plan ? held : [...p.accts], name: q?.name || p.name, price, prev: q?.prev, currency: q?.currency || 'JPY', value, dayChange, pl: value != null ? value - p.cost : null, plRate: value != null && p.cost ? (value - p.cost) / p.cost : null, kind: isFundSym(p.symbol) ? 'fund' : 'stock' });
  }
  return out.sort((a, b) => (b.value || 0) - (a.value || 0));
}

// その日に持っていた数(推移グラフ用)
export function qtyAt(symbol, dateStr, quotes) {
  let qty = 0;
  for (const l of S.all('lot')) {
    if (l.symbol !== symbol || l.date > dateStr) continue;
    qty += l.side === 'sell' ? -l.qty : +l.qty;
  }
  for (const pl of S.all('plan')) {
    if (pl.symbol !== symbol) continue;
    if (pl.base?.date && pl.base.date <= dateStr) qty += +pl.base.units || 0;
    for (const b of planBuys(pl, quotes[symbol])) if (b.date <= dateStr && !(pl.base?.date && b.date <= pl.base.date)) qty += b.units;
  }
  return Math.max(0, qty);
}
export function costAt(symbol, dateStr, quotes, fx) {
  let cost = 0, qty = 0;
  for (const l of S.all('lot').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t || 0) - (b.t || 0)))) {
    if (l.symbol !== symbol || l.date > dateStr) continue;
    const rate = l.currency === 'USD' ? +l.fx || fx || 150 : 1;
    if (l.side === 'sell') {
      const avg = qty ? cost / qty : 0;
      cost -= avg * Math.min(+l.qty, qty);
      qty -= Math.min(+l.qty, qty);
    } else {
      cost += (+l.qty * +l.price * rate) / unitOf(symbol) + (+l.fee || 0);
      qty += +l.qty;
    }
  }
  for (const pl of S.all('plan')) {
    if (pl.symbol !== symbol) continue;
    if (pl.base?.date && pl.base.date <= dateStr) cost += +pl.base.cost || 0;
    for (const b of planBuys(pl, quotes[symbol])) if (b.date <= dateStr && !(pl.base?.date && b.date <= pl.base.date)) cost += b.amount;
  }
  return cost;
}

// ---- 自分で足した資産(別の貯金口座・ポイントなど)。残高を直すたびに、その日の値を覚える
export function assetValueAt(a, date) {
  let v = 0;
  for (const [d, x] of a.history || []) if (d <= date) v = +x;
  return v;
}
export const assetsAt = (group, date = today()) => sum(S.all('asset').filter((a) => (a.group || 'cash') === group), (a) => assetValueAt(a, date));

// 資産の推移(日付ごと: 現金・預金 / 投資信託 / 個別株 / その他)
export function assetSeries(list, conf, quotes, fx, days = 365) {
  const t = today();
  const syms = [...new Set([...S.all('lot').map((l) => l.symbol), ...S.all('plan').map((p) => p.symbol)])];
  const step = days > 400 ? 14 : days > 100 ? 7 : 1;
  const out = [];
  for (let i = days; i >= 0; i -= step) {
    const d = addDays(t, -i);
    let inv = 0, cost = 0, fund = 0;
    for (const s of syms) {
      const qty = qtyAt(s, d, quotes);
      if (!qty) continue;
      const q = quotes[s];
      const px = priceAt(q, d);
      const rate = q?.currency === 'USD' ? fx || 150 : 1;
      if (px != null) {
        const v = (qty * px * rate) / unitOf(s);
        inv += v;
        if (isFundSym(s)) fund += v;
      }
      cost += costAt(s, d, quotes, fx);
    }
    const cash = cashAt(list, conf, d);
    const saving = assetsAt('cash', d), other = assetsAt('other', d);
    out.push({ date: d, ts: parseD(d).getTime(), cash: (cash ?? 0) + saving, fund, stock: inv - fund, other, inv, cost, total: (cash ?? 0) + saving + inv + other });
  }
  return out;
}

// 選んだ銘柄だけの推移(評価額と、投資した元本)。最初に買った日より前は出さない
export function holdingSeries(syms, quotes, fx, days = 365) {
  const t = today();
  const firsts = [
    ...S.all('lot').filter((l) => syms.includes(l.symbol)).map((l) => l.date),
    ...S.all('plan').filter((p) => syms.includes(p.symbol)).map((p) => p.start),
  ].filter(Boolean).sort();
  if (!firsts.length) return [];
  const span = Math.min(days, Math.max(1, Math.round((parseD(t) - parseD(firsts[0])) / 864e5) + 1));
  const step = Math.max(1, Math.ceil(span / 120));
  const dates = [];
  for (let i = 0; i <= span; i += step) dates.unshift(addDays(t, -i));
  return dates.map((d) => {
    let value = 0, cost = 0;
    for (const s of syms) {
      const qty = qtyAt(s, d, quotes);
      if (!qty) continue;
      const q = quotes[s];
      const px = d === t ? q?.cur ?? priceAt(q, d) : priceAt(q, d);
      const rate = q?.currency === 'USD' ? fx || 150 : 1;
      if (px == null) continue; // 値段がまだ無い銘柄は、元本にも入れない(見かけの損にならないように)
      value += (qty * px * rate) / unitOf(s);
      cost += costAt(s, d, quotes, fx);
    }
    return { date: d, ts: parseD(d).getTime(), value, cost };
  });
}

// ---- 見直しのヒント(ルールで。数字の根拠つき)
export function insights(list, conf) {
  const t = today();
  const curKey = periodKeyOf(t, conf.startDay);
  const cur = summary(list, curKey, conf);
  const prevs = [1, 2, 3].map((i) => summary(list, addMonths(curKey, -i), conf));
  const hasHistory = prevs.some((p) => p.out > 0);
  const out = [];
  const elapsed = Math.max(1, (parseD(t) - parseD(cur.start)) / 864e5 + 1);
  const total = (parseD(cur.end) - parseD(cur.start)) / 864e5 + 1;
  const ratio = elapsed / total;

  // 1) 予算のペース
  if (conf.budget > 0) {
    const varOut = cur.out;
    const proj = cur.fixed + (cur.variable / ratio);
    if (proj > conf.budget * 1.03 && ratio > 0.15) {
      out.push({ k: 'pace', icon: '🏃', level: 'warn', title: `このペースだと月末に予算を ${yen(proj - conf.budget)} こえそう`, body: `いま ${yen(varOut)} 使っていて、月の ${Math.round(ratio * 100)}% が過ぎたところ。残り ${Math.ceil(total - elapsed)} 日は 1日 ${yen(Math.max(0, (conf.budget - varOut) / Math.max(1, total - elapsed)))} までにすると予算内です。` });
    }
  }
  // 2) いつもより増えたカテゴリ
  if (hasHistory) {
    for (const c of cur.byCatVar) {
      const avg = sum(prevs, (p) => p.byCatVar.find((x) => x.cat === c.cat)?.amount || 0) / prevs.filter((p) => p.out > 0).length;
      // 月1回の請求(光熱費・通信など)は、日割りで伸ばさない
      const projected = ratio < 0.9 && catInfo(c.cat, conf).g !== 'fixed' ? c.amount / ratio : c.amount;
      if (ratio >= 0.3 && avg >= 1000 && projected > avg * 1.3 && projected - avg >= 3000 && c.amount >= avg * 0.6) {
        out.push({ k: 'up:' + c.cat, icon: catInfo(c.cat, conf).icon, level: 'warn', save: Math.round((projected - avg) / 100) * 100, title: `${c.cat}がいつもより多め`, body: `今月 ${yen(c.amount)}${ratio < 0.9 ? `(このままだと月 ${yen(projected)})` : ''}。ここ3か月の平均は ${yen(avg)} です。平均まで戻すと ${yen(projected - avg)} 浮きます。` });
      }
    }
  }
  // 3) 小さな出費の積み重ね(1回1,000円以下が多いもの)
  const last30 = list.filter((x) => x.type === 'out' && x.date > addDays(t, -30) && !x.rec);
  for (const [cat, l] of groupBy(last30.filter((x) => x.amount <= 1000), (x) => x.cat)) {
    if (l.length >= 6) {
      const s = sum(l, (x) => x.amount);
      out.push({ k: 'small:' + cat, icon: catInfo(cat, conf).icon, level: 'tip', save: Math.round(s / 2 / 100) * 100, title: `${cat} 30日で ${l.length}回・${yen(s)}`, body: `1回は小さくても、月 ${yen(s)} は年に直すと ${yen(s * 12)}。回数を半分にすると年 ${yen(s * 6)} 浮きます。` });
    }
  }
  // 4) 固定費・サブスク(年額で見る)
  const recs = S.all('rec').filter((r) => r.active !== false && (r.type || 'out') === 'out');
  const subs = recs.filter((r) => ['サブスク', '習い事'].includes(r.cat));
  if (subs.length) {
    const m = sum(subs, monthlyOf);
    out.push({ k: 'subs', icon: '📱', level: 'tip', title: `サブスク・習い事は月 ${yen(m)}(年 ${yen(m * 12)})`, body: subs.map((r) => `${r.name} 年${short(monthlyOf(r) * 12)}円`).join('・') + '。最近使っていないものがないか、ひと月に一度だけ見直すのがおすすめ。', go: 'recs' });
  }
  // 5) 記録し忘れ(金額が毎回ちがう固定費・いつも記録しているのに今月まだのもの)
  for (const p of cur.pending) {
    out.push({ k: 'pend:' + p.id, icon: '📝', level: 'todo', title: `${p.memo || p.cat} の金額が未確定`, body: `${+p.date.slice(5, 7)}/${+p.date.slice(8)} に仮の金額 ${yen(p.amount)} で入れてあります。明細を見て直してください。`, tx: p.id });
  }
  if (ratio > 0.6 && hasHistory) {
    const usual = new Map();
    for (const p of prevs) for (const c of p.byCat) usual.set(c.cat, (usual.get(c.cat) || 0) + 1);
    for (const cat of ['光熱費', '通信', '住まい']) {
      if ((usual.get(cat) || 0) >= 2 && !cur.byCat.some((c) => c.cat === cat) && !recs.some((r) => r.cat === cat)) {
        out.push({ k: 'miss:' + cat, icon: catInfo(cat, conf).icon, level: 'todo', title: `${cat}、今月まだ記録がありません`, body: `ここ3か月は毎月ついていました。「固定費・サブスク」に登録すると、次から自動で入ります(金額が毎回ちがうものは「金額は毎回ちがう」にすると、仮の金額で入って確認を促します)。`, go: 'recs' });
      }
    }
  }
  // 6) 貯められた割合
  const lastFull = prevs[0];
  if (lastFull.in > 0) {
    const kept = lastFull.in - lastFull.out;
    const r = kept / lastFull.in;
    out.push({ k: 'rate', icon: r >= 0.2 ? '🌱' : '🪴', level: 'info', title: `先月は収入の ${Math.round(r * 100)}% を残せました`, body: `収入 ${yen(lastFull.in)} − 支出 ${yen(lastFull.out)} = ${yen(kept)}。そのうち ${yen(lastFull.inv)} を投資へ。目安は手取りの2割残すこと。` });
  }
  return out;
}

// 来月の見通し(固定費の合計と、ふだんの変動費)
export function nextMonthPlan(list, conf) {
  const key = addMonths(periodKeyOf(today(), conf.startDay), 1);
  const p = periodOf(key, conf.startDay);
  const items = [];
  for (const r of S.all('rec')) {
    if (r.active === false) continue;
    for (let m = addMonths(ym(p.start), -1), i = 0; i < 3; i++, m = addMonths(m, 1)) {
      const due = recDue(r, m);
      if (due && due >= p.start && due <= p.end) items.push({ date: due, rec: r, amount: +r.amount || 0 });
    }
  }
  const prevs = [1, 2, 3].map((i) => summary(list, addMonths(key, -1 - i), conf)).filter((s) => s.out > 0);
  const variable = prevs.length ? sum(prevs, (s) => s.variable) / prevs.length : 0;
  return { ...p, items: items.sort((a, b) => (a.date < b.date ? -1 : 1)), fixedOut: sum(items.filter((i) => (i.rec.type || 'out') === 'out'), (i) => i.amount), fixedIn: sum(items.filter((i) => i.rec.type === 'in'), (i) => i.amount), variable };
}

// メモ → カテゴリ の覚え(過去の記録から)
export function memoHistory(list) {
  const m = new Map();
  for (const t of [...list].reverse()) if (t.memo && t.cat) m.set(fold(t.memo), t.cat);
  return m;
}
// よく使うメモ(入力の候補)
export function memoSuggest(list, cat, type) {
  const c = new Map();
  for (const t of list.slice(0, 600)) {
    if (!t.memo || t.type !== type || (cat && t.cat !== cat) || t.rec) continue;
    const k = t.memo;
    const o = c.get(k) || { memo: k, n: 0, amount: t.amount, cat: t.cat };
    o.n++;
    c.set(k, o);
  }
  return [...c.values()].sort((a, b) => b.n - a.n).slice(0, 8);
}

export const monthLabel = (key) => `${key.slice(0, 4)}年${+key.slice(5)}月`;
export { daysInMonth };
