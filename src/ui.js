// 画面の部品: 下から出る窓・切りかえ・電卓・お知らせ
import React, { useState, useEffect, useRef, useContext, createContext, useSyncExternalStore } from 'react';
import htm from 'htm';
import * as S from './store.js';
import { vibrate } from './util.js';
export const html = htm.bind(React.createElement);

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// 記録が変わったら描き直す
export function useStore() {
  return useSyncExternalStore(S.subscribe, S.getVersion);
}

// ---- 下から出る窓
export function Sheet({ title, onClose, children, full, foot, right }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('noscroll');
    };
  }, []);
  return html`<div class=${'sheet-wrap' + (closing ? ' closing' : '')} onClick=${(e) => e.target === e.currentTarget && close()}>
    <div class=${'sheet' + (full ? ' full' : '')} role="dialog" aria-label=${title}>
      <div class="sheet-head">
        <div class="sheet-title"><button class="icon-btn" onClick=${close} aria-label="閉じる">✕</button><h2>${title}</h2><div class="sheet-right">${right}</div></div>
      </div>
      <div class="sheet-body">${typeof children === 'function' ? children(close) : children}</div>
      ${foot && html`<div class="sheet-foot">${typeof foot === 'function' ? foot(close) : foot}</div>`}
    </div>
  </div>`;
}

export function Seg({ value, options, onChange, small }) {
  return html`<div class=${'seg' + (small ? ' small' : '')} role="tablist">
    ${options.map((o) => html`<button key=${o.v} role="tab" aria-selected=${value === o.v} class=${value === o.v ? 'on' : ''} style=${value === o.v && o.color ? { '--seg': o.color } : null} onClick=${() => { vibrate(5); onChange(o.v); }}>${o.label}</button>`)}
  </div>`;
}

// ---- 電卓つきの金額入力(+ − で足し引きできる)
export function evalExpr(s) {
  const toks = String(s).replace(/[^\d+\-×÷.]/g, '').match(/\d+(\.\d+)?|[+\-×÷]/g) || [];
  let acc = 0, op = '+', mul = null, mop = null;
  // 掛け算・割り算を先に
  const nums = [];
  const ops = [];
  for (const t of toks) {
    if (/[+\-×÷]/.test(t)) ops.push(t);
    else nums.push(+t);
  }
  if (!nums.length) return 0;
  const stack = [nums[0]];
  const sops = [];
  for (let i = 0; i < ops.length && i + 1 < nums.length; i++) {
    const o = ops[i], v = nums[i + 1];
    if (o === '×') stack[stack.length - 1] *= v;
    else if (o === '÷') stack[stack.length - 1] = v ? stack[stack.length - 1] / v : 0;
    else { sops.push(o); stack.push(v); }
  }
  acc = stack[0];
  sops.forEach((o, i) => { acc = o === '+' ? acc + stack[i + 1] : acc - stack[i + 1]; });
  void op; void mul; void mop;
  return Math.round(acc);
}
export function Keypad({ expr, setExpr, onDone, doneLabel = 'OK', accent }) {
  const press = (k) => {
    vibrate(6);
    if (k === '⌫') return setExpr(expr.slice(0, -1));
    if (k === 'C') return setExpr('');
    if (/[+\-×÷]/.test(k)) {
      if (!expr) return;
      return setExpr(/[+\-×÷]$/.test(expr) ? expr.slice(0, -1) + k : expr + k);
    }
    if (k === '=') return setExpr(String(evalExpr(expr) || ''));
    if (expr.replace(/[^\d]/g, '').length > 11) return;
    if ((k === '0' || k === '00') && (!expr || /[+\-×÷]$/.test(expr))) return;
    setExpr(expr + k);
  };
  const hasOp = /[+\-×÷]/.test(expr);
  const k = (key, label = key, cls = '') => html`<button key=${key} class=${cls} onClick=${() => press(key)}>${label}</button>`;
  // 5列: 数字3列 + 消す・計算。登録は画面の下の大きなボタン
  return html`<div class="keypad">
    ${k('7')}${k('8')}${k('9')}${k('⌫', '⌫', 'op')}${k('÷', '÷', 'op')}
    ${k('4')}${k('5')}${k('6')}${k('-', '−', 'op')}${k('×', '×', 'op')}
    ${k('1')}${k('2')}${k('3')}${k('+', '+', 'op')}${k('C', 'C', 'kp-c')}
    ${k('0', '0', 'k0')}${k('00')}${k('=', '=', 'op k2')}
  </div>`;
}

// ---- お知らせ(元に戻す つき)
export function Toasts({ list }) {
  return html`<div class="toasts">${list.map((t) => html`<div key=${t.id} class="toast">${t.msg}${t.undo && html`<button onClick=${t.undo}>元に戻す</button>`}</div>`)}</div>`;
}

export function Empty({ icon = '🐷', title, body, children }) {
  return html`<div class="empty"><div class="empty-i">${icon}</div><b>${title}</b>${body && html`<p>${body}</p>`}${children}</div>`;
}

export function Field({ label, children, hint }) {
  return html`<label class="field"><span>${label}</span>${children}${hint && html`<small>${hint}</small>`}</label>`;
}

// 数字の入力欄(キーボードは数字)
export function NumInput({ value, onChange, placeholder, step, suffix }) {
  return html`<div class="num-in"><input inputmode="decimal" value=${value ?? ''} placeholder=${placeholder} step=${step}
    onChange=${(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ''))} />${suffix && html`<em>${suffix}</em>`}</div>`;
}
