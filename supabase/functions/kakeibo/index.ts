// 家計簿アプリ(kakeibo)の Edge Function。合言葉(x-kb-key)で守る。
//  quote    : 株・指数(Yahoo Finance)と投資信託(三菱UFJアセットの公開データ / Yahoo!ファイナンス)の値段と推移
//  earnings : 決算発表日(日本株は Yahoo!ファイナンス、米国株は Nasdaq)
//  search   : 銘柄をさがす(コード・会社名)
//  receipt  : レシートの写真を Gemini が読んで、店・日付・合計・カテゴリを返す(キーは あさよみ と共用)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-kb-key, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function authOk(req: Request) {
  const key = req.headers.get('x-kb-key') || '';
  if (key.length < 6) return false;
  const { data } = await db.from('jibun_access').select('token_hash').eq('token_hash', await sha256(key)).maybeSingle();
  return !!data;
}

// ---- 一時置き場
async function cacheGet(k: string, ttlMs: number) {
  const { data } = await db.from('kakeibo_cache').select('v,at').eq('k', k).maybeSingle();
  if (data && Date.now() - new Date(data.at).getTime() < ttlMs) return data.v;
  return null;
}
async function cachePut(k: string, v: unknown) {
  await db.from('kakeibo_cache').upsert({ k, v, at: new Date().toISOString() });
}
async function get(url: string, ms = 12000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// 投資信託の協会コード(例 0331418A)。株は 8035.T、指数は ^SOX、米国株は NVDA
const isFund = (s: string) => /^[0-9A-Z]{8}$/.test(s) && !/^\d{4}\.T$/.test(s);

const deEnt = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s・･()（）株式会社]/g, '');

// ---- 日本語の名前(Yahoo!ファイナンスのページの題名から)
async function jpName(sym: string) {
  const k = 'name:' + sym;
  const c = await cacheGet(k, 30 * 864e5);
  if (c) return c as string;
  try {
    const h = await (await get(`https://finance.yahoo.co.jp/quote/${encodeURIComponent(sym)}`, 8000)).text();
    const t = h.match(/<title>([^<【]+)【/)?.[1]?.trim();
    if (t) {
      const n = deEnt(t.replace(/\(株\)|（株）/g, '').replace(/･/g, '・').trim());
      await cachePut(k, n);
      return n;
    }
  } catch { /* 名前なし */ }
  return '';
}

const INTERVAL: Record<string, string> = { '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1wk', '5y': '1wk', max: '1mo' };

// ---- 株・指数・ETF(Yahoo Finance のチャート)
async function yahooChart(sym: string, range: string) {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${INTERVAL[range] || '1d'}&includePrePost=false`);
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error('not found');
  const ts: number[] = res.timestamp || [];
  const cl: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
  const points: [number, number][] = [];
  ts.forEach((t, i) => { if (cl[i] != null) points.push([t * 1000, Math.round(cl[i]! * 1000) / 1000]); });
  const m = res.meta || {};
  const cur = m.regularMarketPrice ?? points.at(-1)?.[1];
  // 前日比: 日足なら最後のひとつ前、細かい足なら前日の終値
  const iv = INTERVAL[range] || '1d';
  const prev = m.previousClose ?? (iv === '1d' && points.length > 1 ? points.at(-2)![1] : /m$/.test(iv) ? m.chartPreviousClose : null);
  let name = '';
  if (/\.T$/.test(sym)) name = await jpName(sym);
  return { name: name || m.longName || m.shortName || sym, cur, prev, currency: m.currency || 'JPY', type: m.instrumentType || '', points };
}

// ---- 三菱UFJアセット(eMAXIS)の投信: 設定来の基準価額 CSV
async function mufgFund(code: string) {
  const k = 'mufg:' + code;
  let fundCd = await cacheGet(k, 365 * 864e5) as string | null;
  if (fundCd === null) {
    try {
      // deno-lint-ignore no-explicit-any
      const j: any = await (await get(`https://developer.am.mufg.jp/fund_information_latest/association_fund_cd/${code}`, 8000)).json();
      fundCd = j?.datasets?.[0]?.fund_cd || '';
    } catch { fundCd = ''; }
    await cachePut(k, fundCd);
  }
  if (!fundCd) return null;
  const buf = await (await get(`https://www.am.mufg.jp/fund_file/setteirai/${fundCd}.csv`, 15000)).arrayBuffer();
  const text = new TextDecoder('shift_jis').decode(buf);
  const lines = text.split(/\r?\n/);
  const name = lines[0].trim().normalize('NFKC');
  const points: [number, number][] = [];
  for (const ln of lines.slice(2)) {
    const m = ln.match(/^(\d{4})\/(\d{2})\/(\d{2}),(\d+)/);
    if (m) points.push([Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 3600e3, +m[4]]);
  }
  if (!points.length) return null;
  return { name, points };
}

// ---- それ以外の投信: Yahoo!ファイナンスの最新の基準価額を、毎日 kakeibo_prices に記録していく
async function yjFundLatest(code: string) {
  const h = await (await get(`https://finance.yahoo.co.jp/quote/${code}`, 10000)).text();
  const name = deEnt((h.match(/<title>([^<【]+)【/)?.[1] || code).replace(/･/g, '・').trim());
  const m = h.match(/\\"price\\":\{\\"value\\":\\"([\d,.]+)\\",\\"changePrice\\":\\"([-+\d,.]+)\\"[^}]*?\\"updateDate\\":\\"(\d{1,2})\/(\d{1,2})\\"/);
  if (!m) return { name, cur: null, prev: null };
  const cur = +m[1].replace(/,/g, '');
  const prev = cur - +m[2].replace(/,/g, '');
  const now = new Date(Date.now() + 9 * 3600e3);
  let y = now.getUTCFullYear();
  if (+m[3] > now.getUTCMonth() + 1) y -= 1;
  const d = `${y}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
  await db.from('kakeibo_prices').upsert({ symbol: code, d, close: cur });
  return { name, cur, prev };
}

const RANGE_DAYS: Record<string, number> = { '1d': 3, '5d': 7, '1mo': 31, '3mo': 92, '6mo': 183, '1y': 366, '2y': 731, '5y': 1827, max: 99999 };

async function fundQuote(code: string, range: string) {
  const since = Date.now() - (RANGE_DAYS[range] ?? 366) * 864e5;
  const mu = await mufgFund(code).catch(() => null);
  if (mu) {
    const pts = mu.points;
    const cur = pts.at(-1)![1];
    const prev = pts.at(-2)?.[1] ?? cur;
    return { name: (await jpName(code)) || mu.name, cur, prev, currency: 'JPY', type: 'FUND', points: pts.filter((p) => p[0] >= since) };
  }
  const lt = await yjFundLatest(code);
  const { data } = await db.from('kakeibo_prices').select('d,close').eq('symbol', code).order('d');
  const points: [number, number][] = (data || []).map((r: { d: string; close: number }) => [Date.parse(r.d + 'T00:00:00+09:00'), +r.close]);
  return { name: lt.name, cur: lt.cur ?? points.at(-1)?.[1] ?? null, prev: lt.prev, currency: 'JPY', type: 'FUND', points: points.filter((p) => p[0] >= since) };
}

async function quoteOne(sym: string, range: string) {
  const k = `q:${sym}:${range}`;
  const ttl = range === '1d' || range === '5d' ? 5 * 60e3 : 30 * 60e3;
  const c = await cacheGet(k, ttl);
  if (c) return c;
  try {
    const v = isFund(sym) ? await fundQuote(sym, range === 'all' ? 'max' : range) : await yahooChart(sym, range === 'all' ? 'max' : range);
    await cachePut(k, v);
    return v;
  } catch (e) {
    return { error: String((e as Error).message || e) };
  }
}

// ---- 決算発表日(日本株: Yahoo!ファイナンスの決算発表スケジュール / 米国株: Nasdaq の公開データ)
//  next: 次の決算発表日(会社の予定 or 前回から約3か月後の目安), est: 目安なら true, last: 前回の決算発表日
const ymdJ = (y: string | number, m: string | number, d: string | number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addD = (s: string, n: number) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const todayJ = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function nextFromLast(last: string | null) {
  if (!last) return null;
  let n = addD(last, 91);
  while (n < todayJ()) n = addD(n, 91);
  return n;
}
async function earningsOne(sym: string) {
  if (isFund(sym) || /^\^|=X$/.test(sym)) return null;
  const k = 'earn:' + sym;
  const c = await cacheGet(k, 12 * 3600e3);
  if (c) return c;
  let out: { next: string | null; est: boolean; last: string | null; note?: string } = { next: null, est: true, last: null };
  try {
    if (/\.T$/.test(sym)) {
      const h = await (await get(`https://finance.yahoo.co.jp/quote/${encodeURIComponent(sym)}`, 10000)).text();
      const blk = h.match(/pressReleaseSchedule\\":\{([^}]*)\}/)?.[1] || '';
      const msg = (blk.match(/pressReleaseScheduleMessage\\":\\"([^\\]*)/)?.[1] || '');
      const dm = msg.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const pd = blk.match(/pressReleaseDate\\":\\"(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
      const announced = /resultsAnnounced/.test(blk) || /でした/.test(msg);
      if (pd) out = { next: ymdJ(pd[1], pd[2], pd[3]), est: false, last: null };
      else if (dm && !announced) out = { next: ymdJ(dm[1], dm[2], dm[3]), est: false, last: null };
      else if (dm) { const last = ymdJ(dm[1], dm[2], dm[3]); out = { next: nextFromLast(last), est: true, last }; }
      out.note = msg.replace(/\\u[0-9a-f]{4}/g, '');
    } else {
      const H = { 'User-Agent': UA, Accept: 'application/json' };
      // deno-lint-ignore no-explicit-any
      const a: any = await (await fetch(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(sym)}/earnings-date`, { headers: H, signal: AbortSignal.timeout(10000) })).json().catch(() => null);
      const t = String(a?.data?.reportText || '');
      const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      // deno-lint-ignore no-explicit-any
      const s: any = await (await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(sym)}/earnings-surprise`, { headers: H, signal: AbortSignal.timeout(10000) })).json().catch(() => null);
      const rows = s?.data?.earningsSurpriseTable?.rows || [];
      const lm = String(rows[0]?.dateReported || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const last = lm ? ymdJ(lm[3], lm[1], lm[2]) : null;
      if (m && ymdJ(m[3], m[1], m[2]) >= todayJ()) out = { next: ymdJ(m[3], m[1], m[2]), est: false, last };
      else out = { next: nextFromLast(last), est: true, last };
    }
  } catch { /* 取れないときは空 */ }
  await cachePut(k, out);
  return out;
}

// ---- 銘柄さがし
async function search(q: string) {
  q = q.trim().normalize('NFKC');
  if (!q) return [];
  const out: { symbol: string; name: string; kind: string }[] = [];
  const add = (symbol: string, name: string, kind: string) => { if (!out.some((o) => o.symbol === symbol)) out.push({ symbol, name, kind }); };
  if (/^\d{3}[0-9A-Z]$/i.test(q)) {
    const s = q.toUpperCase() + '.T';
    const n = await jpName(s);
    if (n) add(s, n, 'stock');
  } else if (/^[0-9A-Z]{8}$/i.test(q)) {
    const n = await jpName(q.toUpperCase());
    if (n) add(q.toUpperCase(), n, 'fund');
  }
  if (!out.length) try {
    const h = await (await get(`https://finance.yahoo.co.jp/search/?query=${encodeURIComponent(q)}`, 8000)).text();
    const syms = [...new Set([...h.matchAll(/\/quote\/([0-9A-Z^.]{2,12})[\\"?/]/g)].map((m) => m[1]))].slice(0, 6);
    const names = await Promise.all(syms.map((s) => jpName(s)));
    // ページの横の「人気の銘柄」などが混ざるので、名前に探した言葉を含むものだけ
    syms.forEach((s, i) => { if (names[i] && fold(names[i]).includes(fold(q))) add(s, names[i], isFund(s) ? 'fund' : 'stock'); });
  } catch { /* 次へ */ }
  // コードで探して見つかったときは、英語の検索はしない(関係ない銘柄が混ざるので)
  if (out.length < 3 && !(out.length && /^[0-9A-Z]{4}$|^[0-9A-Z]{8}$/i.test(q))) {
    try {
      // deno-lint-ignore no-explicit-any
      const j: any = await (await get(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`, 8000)).json();
      for (const x of j?.quotes || []) if (x.symbol) add(x.symbol, x.longname || x.shortname || x.symbol, x.quoteType === 'INDEX' ? 'index' : 'stock');
    } catch { /* なし */ }
  }
  return out.slice(0, 8);
}

// ---- レシートを読む(Gemini)
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/';
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
// キーと使えるモデルの一覧は、あさよみが毎日確かめているもの(asayomi_secret)を借りる
async function geminiSetup() {
  const { data } = await db.from('asayomi_secret').select('k,v').in('k', ['gemini_key', 'gemini_models']);
  const get = (k: string) => (data || []).find((r: { k: string }) => r.k === k)?.v || '';
  let models = MODELS;
  try {
    const m = JSON.parse(get('gemini_models') || '{}');
    if (Array.isArray(m.text) && m.text.length) models = [...new Set([...m.text.slice(0, 4), ...MODELS])];
  } catch { /* 決まった順で */ }
  return { key: Deno.env.get('GEMINI_API_KEY') || get('gemini_key'), models };
}
async function receipt(image: string, mime: string, cats: string[], today: string) {
  const { key, models } = await geminiSetup();
  if (!key) return { error: 'AIのキーがありません' };
  const sys = [
    'あなたは家計簿の入力係です。レシート(または支払い画面・明細)の写真から、支出を読み取ってください。',
    `カテゴリは次から1つ選ぶ: ${cats.join(' / ')}`,
    '1枚のレシートに性質の違う物(例: 食料品と日用品)が混ざっていたら、カテゴリごとに分けて合計してよい(最大5つ)。',
    `日付が読めなければ ${today}。年が書いていなければ ${today.slice(0, 4)} 年。金額は税込の整数(円)。`,
    '答えは JSON だけ: {"store":"店名","date":"YYYY-MM-DD","total":1234,"pay":"現金/カード/電子マネー/不明","parts":[{"category":"食費","amount":1000,"memo":"お弁当・お茶"}]}',
  ].join('\n');
  for (const model of models) {
    const r = await fetch(`${GEMINI}models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: image } }, { text: 'このレシートを読んで' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(45000),
    }).catch(() => null);
    if (!r) continue;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return { error: 'AIのキーが使えませんでした' };
      continue; // 混んでいる・そのモデルが無い → 次のモデル
    }
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const raw = (j?.candidates?.[0]?.content?.parts || []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('');
    try {
      return JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
    } catch { continue; }
  }
  return { error: 'AIが混んでいます。少しあとでもう一度' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await authOk(req))) return json({ error: 'bad key' }, 401);
  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { /* 空 */ }
  try {
    if (b.action === 'quote') {
      const syms: string[] = (Array.isArray(b.symbols) ? b.symbols : []).map(String).filter(Boolean).slice(0, 30);
      const range = String(b.range || '1y');
      const vals = await Promise.all(syms.map((s) => quoteOne(s, range)));
      return json(Object.fromEntries(syms.map((s, i) => [s, vals[i]])));
    }
    if (b.action === 'earnings') {
      const syms: string[] = (Array.isArray(b.symbols) ? b.symbols : []).map(String).filter(Boolean).slice(0, 30);
      const vals = await Promise.all(syms.map((s) => earningsOne(s)));
      return json(Object.fromEntries(syms.map((s, i) => [s, vals[i]])));
    }
    if (b.action === 'search') return json({ results: await search(String(b.q || '')) });
    if (b.action === 'receipt') {
      if (!b.image || String(b.image).length > 6_000_000) return json({ error: '画像が大きすぎます' }, 400);
      return json(await receipt(String(b.image), String(b.mime || 'image/jpeg'), (b.categories || []).map(String).slice(0, 40), String(b.today || '')));
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
