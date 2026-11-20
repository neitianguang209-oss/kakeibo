// 共通の小物: 日付・金額の書き方・カテゴリ
export const yen = (n, sign = false) => {
  const v = Math.round(Number(n) || 0);
  const s = '¥' + Math.abs(v).toLocaleString('ja-JP');
  if (v < 0) return '−' + s;
  return sign && v > 0 ? '+' + s : s;
};
// 損益は日本の証券アプリと同じく ▲(プラス)/▼(マイナス)
export const pm = (n, digits = 0) => {
  const v = Number(n) || 0;
  const a = Math.abs(v).toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return v > 0 ? '+' + a : v < 0 ? '−' + a : a;
};
export const pct = (r, d = 1) => (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r * 100).toFixed(d) + '%';
export const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
export const short = (n) => {
  const v = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (v >= 1e8) return s + (v / 1e8).toFixed(v >= 1e9 ? 0 : 1) + '億';
  if (v >= 1e4) return s + (v / 1e4).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '万';
  return s + Math.round(v).toLocaleString('ja-JP');
};

// ---- 日付(文字列 YYYY-MM-DD で持つ。端末の時刻=日本時間の前提)
const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseD = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const addDays = (s, n) => {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const ym = (s) => s.slice(0, 7);
export const addMonths = (ymStr, n) => {
  const [y, m] = ymStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
};
export const daysInMonth = (ymStr) => {
  const [y, m] = ymStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
// その月の d 日(月末を超えたら月末)
export const dayOf = (ymStr, d) => `${ymStr}-${p2(Math.min(d === 'end' ? 31 : d, daysInMonth(ymStr)))}`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const wd = (s) => WD[parseD(s).getDay()];
export const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
export const mdw = (s) => `${md(s)}(${wd(s)})`;
export const jpDay = (s) => {
  const t = today();
  if (s === t) return '今日';
  if (s === addDays(t, -1)) return '昨日';
  if (s === addDays(t, 1)) return '明日';
  return mdw(s);
};

// 「月」は締め日(startDay)から。startDay=25 なら 11月 = 10/25〜11/24
export function periodOf(ymStr, startDay = 1) {
  if (startDay <= 1) return { key: ymStr, start: `${ymStr}-01`, end: dayOf(ymStr, 'end'), label: `${+ymStr.slice(5)}月` };
  const prev = addMonths(ymStr, -1);
  const start = dayOf(prev, startDay);
  const end = addDays(dayOf(ymStr, startDay), -1);
  return { key: ymStr, start, end, label: `${+ymStr.slice(5)}月` };
}
export function periodKeyOf(dateStr, startDay = 1) {
  const k = ym(dateStr);
  if (startDay <= 1) return k;
  return +dateStr.slice(8) >= Math.min(startDay, daysInMonth(k)) ? addMonths(k, 1) : k;
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
export const fold = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

// ---- カテゴリ。色はグループ(ものの性質)ごとに固定。並べ替えても色は変わらない
export const GROUPS = {
  food: { name: '食べる', color: 'var(--c-food)' },
  life: { name: '暮らし', color: 'var(--c-life)' },
  fixed: { name: '固定費', color: 'var(--c-fixed)' },
  fun: { name: '楽しむ', color: 'var(--c-fun)' },
  grow: { name: '自分みがき', color: 'var(--c-grow)' },
  move: { name: '移動', color: 'var(--c-move)' },
  care: { name: '健康・美容', color: 'var(--c-care)' },
  other: { name: 'その他', color: 'var(--c-other)' },
};
export const OUT_CATS = [
  { id: '食費', icon: '🍙', g: 'food' },
  { id: '外食', icon: '🍜', g: 'food' },
  { id: 'カフェ', icon: '☕', g: 'food' },
  { id: 'コンビニ', icon: '🏪', g: 'food' },
  { id: '日用品', icon: '🧻', g: 'life' },
  { id: '衣服', icon: '👕', g: 'life' },
  { id: '住まい', icon: '🏠', g: 'fixed' },
  { id: '水道光熱', icon: '💡', g: 'fixed' },
  { id: '通信', icon: '📶', g: 'fixed' },
  { id: 'サブスク', icon: '📱', g: 'fixed' },
  { id: '習い事', icon: '🎤', g: 'grow' },
  { id: '本・学び', icon: '📚', g: 'grow' },
  { id: '就活', icon: '💼', g: 'grow' },
  { id: '趣味', icon: '🎸', g: 'fun' },
  { id: '交際', icon: '🍻', g: 'fun' },
  { id: '旅行', icon: '✈️', g: 'fun' },
  { id: '交通', icon: '🚃', g: 'move' },
  { id: '美容', icon: '💇', g: 'care' },
  { id: '医療', icon: '💊', g: 'care' },
  { id: 'その他', icon: '📦', g: 'other' },
];
export const IN_CATS = [
  { id: '給料', icon: '💴', g: 'in' },
  { id: 'メルカリ', icon: '🛍️', g: 'in' },
  { id: '臨時収入', icon: '🎁', g: 'in' },
  { id: '仕送り', icon: '📮', g: 'in' },
  { id: '配当・分配金', icon: '🌱', g: 'in' },
  { id: 'その他収入', icon: '✨', g: 'in' },
];
// 自分で足したカテゴリ(conf.cats)も混ぜる
export function catList(type, conf) {
  const extra = (conf?.cats || []).filter((c) => c.type === type && !c.hidden);
  const hidden = new Set((conf?.cats || []).filter((c) => c.hidden).map((c) => c.id));
  return [...(type === 'in' ? IN_CATS : OUT_CATS).filter((c) => !hidden.has(c.id)), ...extra.map((c) => ({ id: c.id, icon: c.icon || '🔖', g: c.g || (type === 'in' ? 'in' : 'other') }))];
}
export function catInfo(id, conf) {
  const all = [...OUT_CATS, ...IN_CATS, ...(conf?.cats || [])];
  const c = all.find((x) => x.id === id);
  if (!c) return { id, icon: '🔖', g: 'other', color: GROUPS.other.color };
  const g = c.g || 'other';
  return { ...c, icon: c.icon || '🔖', g, color: g === 'in' ? 'var(--c-in)' : (GROUPS[g] || GROUPS.other).color };
}
// 収入より支出のほうに入れるべき言葉から、カテゴリを推し量る(過去の記録が無いとき用)
const HINTS = [
  [/ボイトレ|レッスン|スクール|教室|ジム/, '習い事'],
  [/netflix|spotify|youtube|prime|アマプラ|apple ?music|icloud|chatgpt|claude|サブスク|hulu|disney|u-next/i, 'サブスク'],
  [/水道|電気|ガス|光熱/, '水道光熱'],
  [/家賃|管理費/, '住まい'],
  [/携帯|スマホ代|wifi|wi-fi|通信|ahamo|povo|楽天モバイル|linemo/i, '通信'],
  [/セブン|ローソン|ファミマ|ファミリーマート|コンビニ|ミニストップ/, 'コンビニ'],
  [/スタバ|スターバックス|ドトール|タリーズ|カフェ|コーヒー|コメダ/, 'カフェ'],
  [/ランチ|ディナー|ラーメン|居酒屋|マック|マクドナルド|すき家|松屋|吉野家|サイゼ|外食|焼肉|寿司|定食/, '外食'],
  [/スーパー|イオン|西友|ライフ|まいばすけっと|業務スーパー|オーケー|食材|野菜/, '食費'],
  [/電車|バス|suica|pasmo|タクシー|交通|定期券|新幹線/i, '交通'],
  [/ユニクロ|gu|zara|服|靴/i, '衣服'],
  [/ドラッグ|マツキヨ|ウエルシア|ダイソー|無印|日用品|洗剤|ティッシュ/, '日用品'],
  [/病院|薬|クリニック|歯医者/, '医療'],
  [/美容院|ヘア|ネイル|コスメ|化粧/, '美容'],
  [/本|書店|参考書|kindle|紀伊國屋|丸善|ジュンク/i, '本・学び'],
  [/飲み会|プレゼント|誕生日|お祝い/, '交際'],
  [/ホテル|旅館|旅行|航空|ana|jal/i, '旅行'],
  [/面接|スーツ|説明会|就活/, '就活'],
  [/メルカリ/, 'メルカリ'],
  [/給料|給与|バイト代/, '給料'],
];
export function guessCat(memo, history) {
  const f = fold(memo);
  if (!f) return null;
  if (history) {
    const hit = history.get(f);
    if (hit) return hit;
  }
  for (const [re, c] of HINTS) if (re.test(memo)) return c;
  return null;
}

export const PAY = ['現金', 'カード', 'QR・電子マネー', '口座引き落とし'];

export function vibrate(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* なし */ }
}
