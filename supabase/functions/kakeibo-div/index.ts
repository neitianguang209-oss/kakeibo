// 家計簿: 配当の実績(1株あたり・権利落ち日ごと)を Yahoo Finance から取る。合言葉(x-kb-key)で守る。
// 本体の関数 kakeibo と分けてあるのは、本体に手を入れずに足せるようにするため。
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-kb-key, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

async function authOk(req: Request) {
  const key = req.headers.get('x-kb-key') || '';
  if (key.length < 6) return false;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data } = await db.from('jibun_access').select('token_hash').eq('token_hash', hash).maybeSingle();
  return !!data;
}

async function dividends(sym: string) {
  // 投資信託・指数・為替には配当の情報がない
  if ((/^[0-9A-Z]{8}$/.test(sym)) || /^\^|=X$/.test(sym)) return null;
  const k = 'div:' + sym;
  const { data } = await db.from('kakeibo_cache').select('v,at').eq('k', k).maybeSingle();
  if (data && Date.now() - new Date(data.at).getTime() < 24 * 3600e3) return data.v;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3y&interval=1mo&events=div`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) throw new Error('not found');
    // deno-lint-ignore no-explicit-any
    const events = Object.values(res.events?.dividends || {}).map((x: any) => [x.date * 1000, x.amount]).sort((a: any, b: any) => a[0] - b[0]);
    const v = { events, currency: res.meta?.currency || 'JPY' };
    await db.from('kakeibo_cache').upsert({ k, v, at: new Date().toISOString() });
    return v;
  } catch (e) {
    return { error: String((e as Error).message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await authOk(req))) return json({ error: 'bad key' }, 401);
  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { /* 空 */ }
  const syms: string[] = (Array.isArray(b.symbols) ? b.symbols : []).map(String).filter((s: string) => /^[0-9A-Za-z.^=-]{1,15}$/.test(s)).slice(0, 30);
  const vals = await Promise.all(syms.map(dividends));
  return json(Object.fromEntries(syms.map((s, i) => [s, vals[i]])));
});
