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
// MoneyNote(シンプル家計簿)と同じ名前・色。色はカテゴリごとに固定(並べ替えても変わらない)
export const OUT_CATS = [
  { id: '食費', icon: '🍙', g: 'food', color: '#ff8700' },
  { id: '外食', icon: '🍽️', g: 'food', color: '#ffd500' },
  { id: '日用品', icon: '🧴', g: 'life', color: '#00b547' },
  { id: '衣服', icon: '👕', g: 'life', color: '#1638a7' },
  { id: '美容', icon: '💄', g: 'care', color: '#ff54a8' },
  { id: '医療費', icon: '💊', g: 'care', color: '#61e396' },
  { id: '教育費', icon: '📚', g: 'grow', color: '#ff4950' },
  { id: '光熱費', icon: '💡', g: 'fixed', color: '#09ceff' },
  { id: '交通費', icon: '🚃', g: 'move', color: '#a9673c' },
  { id: '遊び', icon: '🎮', g: 'fun', color: '#ff2d2d' },
  { id: '甘え', icon: '🍰', g: 'fun', color: '#ffc94d' },
  { id: '学食', icon: '🍱', g: 'food', color: '#ff7a59' },
  { id: 'ゼミ', icon: '🎓', g: 'grow', color: '#7de3c8' },
  { id: '引っ越し諸々', icon: '📦', g: 'other', color: '#e6c84d' },
  { id: '住まい', icon: '🏠', g: 'fixed', color: '#6250d6' },
  { id: '通信', icon: '📶', g: 'fixed', color: '#7b6df0' },
  { id: 'サブスク', icon: '📱', g: 'fixed', color: '#9085e9' },
  { id: '習い事', icon: '🎤', g: 'grow', color: '#1baf7a' },
  { id: '自己投資', icon: '🎯', g: 'grow', color: '#e0902a' },
  { id: 'その他', icon: '🔖', g: 'other', color: '#007f86' },
];
export const IN_CATS = [
  { id: '給料', icon: '💴', g: 'in', color: '#4eb46a' },
  { id: '賞与', icon: '🎁', g: 'in', color: '#ff2e00' },
  { id: '仕送り', icon: '📮', g: 'in', color: '#ffb27f' },
  { id: 'メルカリ', icon: '🛍️', g: 'in', color: '#00c7ff' },
  { id: '臨時収入', icon: '✨', g: 'in', color: '#f98bbe' },
  { id: '配当・分配金', icon: '🌱', g: 'in', color: '#42d2c1' },
  { id: 'その他収入', icon: '💫', g: 'in', color: '#8e8e93' },
];
export const INV_CATS = [
  { id: '投資', icon: '💹', g: 'inv', color: '#1b9a6c' },
  { id: '積立', icon: '🌱', g: 'inv', color: '#1b9a6c' },
  { id: '株', icon: '📈', g: 'inv', color: '#1b9a6c' },
  { id: '投資信託', icon: '🧺', g: 'inv', color: '#1b9a6c' },
];
// 自分で足したカテゴリ(conf.cats)も混ぜる
export function catList(type, conf) {
  const extra = (conf?.cats || []).filter((c) => c.type === type && !c.hidden);
  const hidden = new Set((conf?.cats || []).filter((c) => c.hidden).map((c) => c.id));
  return [...(type === 'in' ? IN_CATS : type === 'inv' ? INV_CATS : OUT_CATS).filter((c) => !hidden.has(c.id)), ...extra.map((c) => ({ id: c.id, icon: c.icon || '🔖', g: c.g || (type === 'in' ? 'in' : 'other'), color: c.color }))];
}
export function catInfo(id, conf) {
  const all = [...OUT_CATS, ...IN_CATS, ...INV_CATS, ...(conf?.cats || [])];
  const c = all.find((x) => x.id === id);
  if (!c) return { id, icon: '🔖', g: 'other', color: GROUPS.other.color };
  const g = c.g || 'other';
  return { ...c, icon: c.icon || '🔖', g, color: c.color || (g === 'in' ? 'var(--c-in)' : (GROUPS[g] || GROUPS.other).color) };
}
// 言葉から、カテゴリを推し量る(過去の記録が無いとき用)
const HINTS = [
  [/ボイトレ|レッスン|スクール|教室|ジム/, '習い事'],
  [/netflix|spotify|youtube|prime|アマプラ|apple ?music|icloud|chatgpt|claude|サブスク|hulu|disney|u-next/i, 'サブスク'],
  [/水道|電気|ガス|光熱/, '光熱費'],
  [/家賃|管理費/, '住まい'],
  [/携帯|スマホ代|wifi|wi-fi|通信|ahamo|povo|楽天モバイル|linemo/i, '通信'],
  [/セブン|ローソン|ファミマ|ファミリーマート|コンビニ|ミニストップ|スタバ|スターバックス|ドトール|タリーズ|カフェ|コーヒー|コメダ/, '食費'],
  [/ランチ|ディナー|ラーメン|居酒屋|マック|マクドナルド|すき家|松屋|吉野家|サイゼ|外食|焼肉|寿司|定食/, '外食'],
  [/学食/, '学食'],
  [/スーパー|イオン|西友|ライフ|まいばすけっと|業務スーパー|オーケー|食材|野菜/, '食費'],
  [/電車|バス|suica|pasmo|タクシー|交通|定期券|新幹線|駐輪/i, '交通費'],
  [/ユニクロ|gu|zara|服|靴/i, '衣服'],
  [/ドラッグ|マツキヨ|ウエルシア|ダイソー|無印|日用品|洗剤|ティッシュ/, '日用品'],
  [/病院|薬|クリニック|歯医者/, '医療費'],
  [/美容院|ヘア|ネイル|コスメ|化粧/, '美容'],
  [/本|書店|参考書|kindle|紀伊國屋|丸善|ジュンク|授業|プリント/i, '教育費'],
  [/飲み会|プレゼント|誕生日|お祝い|ホテル|旅館|旅行|航空|ライブ|カラオケ|ゲーム/, '遊び'],
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

// 細かい分類(使い道)の候補。自分で足したり外したりした分は conf.subs[カテゴリ] に入る
export const SUBS = {
  食費: ['スーパー', 'コンビニ', '飲み物', 'お菓子', 'パン・主食'],
  外食: ['ランチ', '夜ごはん', 'カフェ', 'ラーメン', '飲み会'],
  日用品: ['消耗品', '衛生用品', '雑貨', '100均'],
  衣服: ['トップス', 'ボトムス', 'アウター', '靴', '小物'],
  美容: ['美容院', 'コスメ', 'スキンケア', 'ネイル'],
  医療費: ['病院', '薬', '歯医者'],
  教育費: ['本', '参考書', 'プリント・コピー', '資格'],
  光熱費: ['電気', 'ガス', '水道'],
  交通費: ['定期', '電車・バス', 'タクシー', '新幹線'],
  遊び: ['ライブ', '映画', 'カラオケ', '旅行', 'プレゼント'],
  甘え: ['お菓子', 'カフェ', 'コンビニ'],
  学食: ['昼ごはん', '軽食'],
  住まい: ['家賃', '家具・家電'],
  通信: ['スマホ', 'ネット'],
  サブスク: ['音楽', '動画', 'AI・アプリ'],
  習い事: ['ボイトレ'],
  自己投資: ['本', 'カメラ', 'プリント', 'プレゼント'],
};
export const subsOf = (cat, conf) => conf?.subs?.[cat] || SUBS[cat] || [];

export function vibrate(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* なし */ }
}
