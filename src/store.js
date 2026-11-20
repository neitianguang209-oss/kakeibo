// 記録の置き場所。端末の IndexedDB が正本で、合言葉があれば Supabase と1件ずつ同期する(ローカルファースト)。
// 決めごと: クラウドが空でも端末のデータを消さない / 古い時刻の書き込みで新しい中身を上書きしない / 消すのは「消した印」だけ
import { rpc, getKey, lsGet, lsSet } from './api.js';

const DB_NAME = 'kakeibo';
let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idbAll() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction('items').objectStore('items').getAll();
    t.onsuccess = () => res(t.result || []);
    t.onerror = () => rej(t.error);
  });
}
async function idbPut(list) {
  if (!list.length) return;
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('items', 'readwrite');
    const st = tx.objectStore('items');
    for (const x of list) st.put(x);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ---- メモリ上の写し
const items = new Map(); // id -> {id, kind, data, deleted, at, dirty}
let version = 0;
const subs = new Set();
export const sync = { state: 'idle', msg: '', last: lsGet('kakeibo:lastSync') || '' };
function emit() {
  version++;
  for (const f of subs) f(version);
}
export function subscribe(f) {
  subs.add(f);
  return () => subs.delete(f);
}
export const getVersion = () => version;

export function all(kind) {
  const out = [];
  for (const x of items.values()) if (x.kind === kind && !x.deleted) out.push({ id: x.id, ...x.data });
  return out;
}
export function getOne(id) {
  const x = items.get(id);
  return x && !x.deleted ? { id: x.id, ...x.data } : null;
}
export const exists = (id) => items.has(id); // 消した印があるものも true(定期の自動記録を作り直さないため)

const nowIso = () => new Date().toISOString();

export async function save(kind, obj) {
  const { id, ...data } = obj;
  const row = { id, kind, data, deleted: false, at: nowIso(), dirty: 1 };
  items.set(id, row);
  emit();
  await idbPut([row]);
  schedulePush();
  return id;
}
export async function saveMany(kind, list) {
  const at = nowIso();
  const rows = list.map(({ id, ...data }) => ({ id, kind, data, deleted: false, at, dirty: 1 }));
  for (const r of rows) items.set(r.id, r);
  emit();
  await idbPut(rows);
  schedulePush();
}
export async function remove(id) {
  const x = items.get(id);
  if (!x) return;
  const row = { ...x, deleted: true, at: nowIso(), dirty: 1 };
  items.set(id, row);
  emit();
  await idbPut([row]);
  schedulePush();
}
export async function restore(id) {
  const x = items.get(id);
  if (!x) return;
  const row = { ...x, deleted: false, at: nowIso(), dirty: 1 };
  items.set(id, row);
  emit();
  await idbPut([row]);
  schedulePush();
}

// ---- 設定(1件だけの記録)
export function conf() {
  return getOne('conf') || {};
}
export function setConf(patch) {
  return save('conf', { ...conf(), ...patch, id: 'conf' });
}

// ---- 起動
export async function boot() {
  try {
    for (const r of await idbAll()) items.set(r.id, r);
  } catch {
    // IndexedDB が使えない(プライベートモード等)→ メモリだけで動く
  }
  emit();
}

// ---- 同期
let pushTimer = 0;
let pushing = false;
function setSync(state, msg = '') {
  sync.state = state;
  sync.msg = msg;
  emit();
}
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 700);
}
export async function push() {
  if (!getKey() || pushing) return;
  const dirty = [...items.values()].filter((x) => x.dirty);
  if (!dirty.length) return;
  pushing = true;
  setSync('busy');
  try {
    for (let i = 0; i < dirty.length; i += 300) {
      const part = dirty.slice(i, i + 300);
      await rpc('push', { items: part.map(({ id, kind, data, deleted, at }) => ({ id, kind, data, deleted, at })) });
      const done = [];
      for (const p of part) {
        const cur = items.get(p.id);
        if (cur && cur.at === p.at && cur.dirty) {
          cur.dirty = 0;
          done.push(cur);
        }
      }
      await idbPut(done);
    }
    setSync('ok');
  } catch (e) {
    setSync('err', e.message);
  } finally {
    pushing = false;
  }
  if ([...items.values()].some((x) => x.dirty)) schedulePush();
}

let pulling = null;
export function pull() {
  if (!getKey()) return Promise.resolve();
  if (pulling) return pulling;
  pulling = (async () => {
    setSync('busy');
    try {
      const since = lsGet('kakeibo:lastPull') || '';
      const r = await rpc('pull', { since });
      const got = r.items || [];
      // クラウドが空っぽ(初めて or 消えた)なのに端末に記録がある → 端末の記録を全部送り直す。消さない
      if (!since || !got.length) {
        if (!since && !got.length && items.size) {
          const all = [...items.values()].map((x) => ({ ...x, dirty: 1 }));
          for (const x of all) items.set(x.id, x);
          await idbPut(all);
        }
      }
      const changed = [];
      for (const g of got) {
        const cur = items.get(g.id);
        if (cur && cur.dirty && cur.at > g.at) continue; // 端末の方が新しい
        if (cur && !cur.dirty && cur.at >= g.at && cur.deleted === g.deleted) continue;
        const row = { id: g.id, kind: g.kind, data: g.data || {}, deleted: !!g.deleted, at: g.at, dirty: 0 };
        items.set(g.id, row);
        changed.push(row);
      }
      await idbPut(changed);
      lsSet('kakeibo:lastPull', r.now);
      sync.last = new Date().toISOString();
      lsSet('kakeibo:lastSync', sync.last);
      setSync('ok');
      if (changed.length) emit();
    } catch (e) {
      setSync('err', e.message);
    } finally {
      pulling = null;
    }
    await push();
  })();
  return pulling;
}
export function resetPull() {
  lsSet('kakeibo:lastPull', null);
}

// ---- 書き出し・読み込み(合言葉も通信もなしで動く)
export function exportJson() {
  const rows = [...items.values()].filter((x) => !x.deleted).map(({ id, kind, data, at }) => ({ id, kind, data, at }));
  return JSON.stringify({ app: 'kakeibo', exported: new Date().toISOString(), count: rows.length, items: rows }, null, 1);
}
export async function importJson(text) {
  const j = JSON.parse(text);
  const rows = (j.items || []).filter((r) => r.id && r.kind);
  const at = nowIso();
  const list = rows.map((r) => ({ id: r.id, kind: r.kind, data: r.data || {}, deleted: false, at, dirty: 1 }));
  for (const r of list) items.set(r.id, r);
  emit();
  await idbPut(list);
  schedulePush();
  return list.length;
}
