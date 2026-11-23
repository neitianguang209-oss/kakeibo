// 株価・基準価額の取り寄せ。端末に控えを置き、15分たったら取り直す(オフラインでも前回の値で見られる)
import { fn, getKey, lsJson, lsSet } from './api.js';

const LS = 'kakeibo:quotes:';
const mem = {}; // `${range}` -> {sym: data}
const subs = new Set();
let ver = 0;
const emit = () => { ver++; subs.forEach((f) => f(ver)); };
export const onQuotes = (f) => (subs.add(f), () => subs.delete(f));

function bucket(range) {
  if (!mem[range]) mem[range] = lsJson(LS + range, {});
  return mem[range];
}
function persist(range) {
  // 細かい足は大きいので、控えには点を間引いて残す
  const b = mem[range];
  const slim = {};
  for (const [k, v] of Object.entries(b)) {
    const pts = v.points || [];
    const stepN = Math.ceil(pts.length / 800) || 1;
    slim[k] = { ...v, points: stepN > 1 ? pts.filter((_, i) => i % stepN === 0 || i === pts.length - 1) : pts };
  }
  try { lsSet(LS + range, JSON.stringify(slim)); } catch { /* いっぱい */ }
}

export function getQuotes(range = '1y') {
  return bucket(range);
}
const inflight = {};
export async function loadQuotes(symbols, range = '1y', force = false) {
  if (!getKey()) return bucket(range);
  const b = bucket(range);
  const ttl = range === '1d' || range === '5d' ? 5 * 60e3 : 15 * 60e3;
  const need = [...new Set(symbols)].filter((s) => s && (force || !b[s] || Date.now() - (b[s]._at || 0) > ttl));
  if (!need.length) return b;
  const key = range + ':' + need.join(',');
  if (!inflight[key]) {
    inflight[key] = fn('quote', { symbols: need, range }, 40000)
      .then((r) => {
        for (const [s, v] of Object.entries(r || {})) {
          if (v && !v.error) b[s] = { ...v, _at: Date.now() };
          else if (b[s]) b[s]._err = v?.error;
        }
        persist(range);
        emit();
        return b;
      })
      .catch(() => b)
      .finally(() => delete inflight[key]);
  }
  return inflight[key];
}

// 半導体・指数のよく見るもの(初期のウォッチリスト)
export const PRESET_WATCH = [
  { symbol: '^SOX', name: 'フィラデルフィア半導体株指数(SOX)' },
  { symbol: '^N225', name: '日経平均株価' },
  { symbol: '^GSPC', name: 'S&P500' },
];
export const PRESET_FUNDS = [
  { symbol: '0331418A', name: 'eMAXIS Slim 全世界株式(オール・カントリー)', nick: 'オルカン' },
  { symbol: '03311187', name: 'eMAXIS Slim 米国株式(S&P500)', nick: 'S&P500' },
  { symbol: '89311199', name: 'SBI・V・S&P500インデックス・ファンド', nick: 'SBI・V・S&P500' },
  { symbol: '9I312179', name: '楽天・全米株式インデックス・ファンド', nick: '楽天VTI' },
];
export const PRESET_SEMI = [
  { symbol: '8035.T', name: '東京エレクトロン' },
  { symbol: '6857.T', name: 'アドバンテスト' },
  { symbol: '6920.T', name: 'レーザーテック' },
  { symbol: '6146.T', name: 'ディスコ' },
  { symbol: '4063.T', name: '信越化学工業' },
  { symbol: '6723.T', name: 'ルネサスエレクトロニクス' },
  { symbol: '285A.T', name: 'キオクシアホールディングス' },
  { symbol: 'NVDA', name: 'エヌビディア' },
  { symbol: 'TSM', name: 'TSMC(ADR)' },
];

// ---- 決算発表日(半日ごとに取り直す)。{ sym: { next, est, last, _at } }
const LE = 'kakeibo:earnings';
let earn = null;
export function getEarnings() {
  if (!earn) earn = lsJson(LE, {});
  return earn;
}
let earnBusy = null;
export async function loadEarnings(symbols, force = false) {
  const e = getEarnings();
  if (!getKey()) return e;
  const need = [...new Set(symbols)].filter((s) => s && !/^\^|=X$/.test(s) && !/^[0-9A-Z]{8}$/.test(s) && (force || !e[s] || Date.now() - (e[s]._at || 0) > 12 * 3600e3));
  if (!need.length || earnBusy) return e;
  earnBusy = fn('earnings', { symbols: need }, 40000)
    .then((r) => {
      for (const [s, v] of Object.entries(r || {})) if (!v?.error) e[s] = { next: null, ...(v || {}), _at: Date.now() };
      try { lsSet(LE, JSON.stringify(e)); } catch { /* いっぱい */ }
      emit();
    })
    .catch(() => {})
    .finally(() => { earnBusy = null; });
  await earnBusy;
  return e;
}
