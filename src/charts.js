// グラフ(SVG を自前で)。線は2px・棒の端は丸く・目盛りは控えめ・指でなぞると値が出る
import React, { useState, useRef, useMemo } from 'react';
import htm from 'htm';
const html = htm.bind(React.createElement);

// ---- 円グラフ(ドーナツ)。中央に合計、押したところの内訳
export function Donut({ data, size = 200, thick = 26, center, sub, onPick, picked }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thick) / 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? 2 : 0; // 隣とのすき間(面の色)
  let acc = 0;
  const pick = picked != null ? data.find((d) => d.key === picked) : null;
  return html`<div class="donut" style=${{ width: size, height: size }}>
    <svg viewBox="0 0 ${size} ${size}" width=${size} height=${size} role="img" aria-label="内訳の円グラフ">
      <circle cx=${c} cy=${c} r=${r} fill="none" stroke="var(--track)" stroke-width=${thick} />
      ${data.map((d) => {
        const len = (d.value / total) * C;
        const dash = Math.max(0, len - gap);
        const off = -acc;
        acc += len;
        const dim = pick && pick.key !== d.key;
        return html`<circle key=${d.key} cx=${c} cy=${c} r=${r} fill="none" stroke=${d.color} stroke-width=${pick?.key === d.key ? thick + 6 : thick}
          stroke-dasharray=${`${dash} ${C - dash}`} stroke-dashoffset=${off} transform=${`rotate(-90 ${c} ${c})`}
          style=${{ opacity: dim ? 0.28 : 1, transition: 'opacity .2s, stroke-width .2s', cursor: 'pointer' }}
          onClick=${() => onPick && onPick(pick?.key === d.key ? null : d.key)}><title>${d.label}</title></circle>`;
      })}
    </svg>
    <div class="donut-center">
      ${pick
        ? html`<div class="dc-sub">${pick.icon || ''} ${pick.label}</div><div class="dc-main num">${pick.fmt}</div><div class="dc-sub">${Math.round((pick.value / total) * 100)}%</div>`
        : html`<div class="dc-sub">${sub}</div><div class="dc-main num">${center}</div>`}
    </div>
  </div>`;
}

// ---- 目盛り(きりのいい数)
function niceTicks(min, max, n = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// 指・マウスの位置から、いちばん近い点
function useHover(n, padL, W, padR) {
  const [i, setI] = useState(null);
  const ref = useRef(null);
  const at = (e) => {
    const el = ref.current;
    if (!el || !n) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * (W / rect.width);
    const k = Math.round(((x - padL) / (W - padL - padR)) * (n - 1));
    setI(Math.max(0, Math.min(n - 1, k)));
  };
  return { i, ref, on: { onPointerMove: at, onPointerDown: at, onPointerLeave: () => setI(null), onTouchMove: at } };
}

// ---- 折れ線(複数の線は同じ目盛り1本で。違う単位は混ぜない)
// series: [{key,label,color,values:[number|null], area?, dash?}], xs: [ts], fmtY, fmtX, markers: [{i, label, color}]
export function LineChart({ xs, series, height = 200, fmtY = (v) => v, fmtX = (t) => '', fmtTip, markers = [], baseline, zero = false, legend = true }) {
  const W = 360, H = height, padL = 6, padR = 46, padT = 12, padB = 22;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const hv = useHover(xs.length, padL, W, padR);
  if (!xs.length || !all.length) return html`<div class="chart-empty">まだ表示できるデータがありません</div>`;
  let min = Math.min(...all, ...(baseline != null ? [baseline] : [])), max = Math.max(...all, ...(baseline != null ? [baseline] : []));
  if (zero) min = Math.min(0, min);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1;
  const ticks = niceTicks(min - pad * (zero && min === 0 ? 0 : 1), max + pad);
  const y0 = ticks[0], y1 = ticks.at(-1);
  const n = xs.length;
  const X = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - padT - padB);
  const path = (vals) => {
    let d = '', on = false;
    vals.forEach((v, i) => {
      if (v == null) { on = false; return; }
      d += (on ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      on = true;
    });
    return d;
  };
  const xt = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const hi = hv.i;
  return html`<div class="chart">
    ${legend && series.length > 1 && html`<div class="legend">${series.map((s) => html`<span key=${s.key}><i style=${{ background: s.color, ...(s.dash ? { backgroundImage: 'none', border: `1.5px dashed ${s.color}`, background: 'transparent' } : {}) }}></i>${s.label}</span>`)}</div>`}
    <div class="chart-box">
    <svg ref=${hv.ref} viewBox="0 0 ${W} ${H}" class="chart-svg" ...${hv.on} style=${{ touchAction: 'pan-y' }}>
      ${ticks.map((t) => html`<g key=${t}><line x1=${padL} x2=${W - padR} y1=${Y(t)} y2=${Y(t)} class="grid" /><text x=${W - padR + 6} y=${Y(t) + 3.5} class="tick">${fmtY(t)}</text></g>`)}
      ${baseline != null && html`<line x1=${padL} x2=${W - padR} y1=${Y(baseline)} y2=${Y(baseline)} class="base" />`}
      ${xt.map((i) => html`<text key=${'x' + i} x=${X(i)} y=${H - 6} class="tick" text-anchor=${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>${fmtX(xs[i])}</text>`)}
      ${series.map((s) => s.area && html`<path key=${'a' + s.key} d=${path(s.values) + `L${X(n - 1)} ${Y(y0)}L${X(s.values.findIndex((v) => v != null))} ${Y(y0)}Z`} fill=${s.color} opacity="0.10" />`)}
      ${series.map((s) => html`<path key=${s.key} d=${path(s.values)} fill="none" stroke=${s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray=${s.dash ? '4 4' : null} />`)}
      ${markers.map((m, k) => {
        const s = series.find((x) => x.key === (m.series || series[0].key));
        const v = s?.values[m.i];
        if (v == null) return null;
        return html`<circle key=${'m' + k} cx=${X(m.i)} cy=${Y(v)} r="4.5" fill=${m.color || 'var(--accent)'} stroke="var(--card)" stroke-width="2" />`;
      })}
      ${hi != null && html`<g>
        <line x1=${X(hi)} x2=${X(hi)} y1=${padT} y2=${H - padB} class="cross" />
        ${series.map((s) => s.values[hi] != null && html`<circle key=${'h' + s.key} cx=${X(hi)} cy=${Y(s.values[hi])} r="4" fill=${s.color} stroke="var(--card)" stroke-width="2" />`)}
      </g>`}
      <rect x="0" y="0" width=${W} height=${H} fill="transparent" />
    </svg>
    ${hi != null && html`<div class="ctip" style=${{ left: `${(X(hi) / W) * 100}%`, transform: `translateX(${X(hi) / W > 0.6 ? '-100%' : '0'})` }}>
      <div class="ctip-h">${fmtX(xs[hi], true)}</div>
      ${fmtTip ? fmtTip(hi) : series.map((s) => s.values[hi] != null && html`<div key=${s.key} class="ctip-r"><i style=${{ background: s.color }}></i>${s.label}<b class="num">${fmtY(s.values[hi], true)}</b></div>`)}
    </div>`}
    </div>
  </div>`;
}

// ---- 棒(月ごとの収入と支出)。2本並べ、すき間をあける
export function Bars({ labels, series, height = 180, fmt = (v) => v, onPick, picked }) {
  const W = 360, H = height, padL = 4, padR = 40, padT = 10, padB = 22;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(0, max, 3);
  const top = ticks.at(-1);
  const n = labels.length;
  const bw = (W - padL - padR) / n;
  const inner = Math.min(14, (bw - 8) / series.length - 2);
  const Y = (v) => padT + (1 - v / top) * (H - padT - padB);
  const [hi, setHi] = useState(null);
  const cur = picked ?? hi;
  return html`<div class="chart">
    <div class="legend">${series.map((s) => html`<span key=${s.key}><i style=${{ background: s.color }}></i>${s.label}</span>`)}</div>
    <div class="chart-box">
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg">
      ${ticks.map((t) => html`<g key=${t}><line x1=${padL} x2=${W - padR} y1=${Y(t)} y2=${Y(t)} class="grid" /><text x=${W - padR + 6} y=${Y(t) + 3.5} class="tick">${fmt(t)}</text></g>`)}
      ${labels.map((l, i) => {
        const cx = padL + bw * i + bw / 2;
        const w = series.length * inner + (series.length - 1) * 2;
        return html`<g key=${i} onPointerEnter=${() => setHi(i)} onPointerLeave=${() => setHi(null)} onClick=${() => onPick && onPick(i)} style=${{ cursor: onPick ? 'pointer' : 'default' }}>
          <rect x=${padL + bw * i} y=${padT} width=${bw} height=${H - padT - padB} fill=${cur === i ? 'var(--hover)' : 'transparent'} rx="6" />
          ${series.map((s, k) => {
            const v = s.values[i] || 0;
            const h = Math.max(v > 0 ? 2 : 0, H - padB - Y(v));
            const x = cx - w / 2 + k * (inner + 2);
            const r = Math.min(4, inner / 2, h);
            return h > 0 && html`<path key=${s.key} d=${`M${x} ${H - padB}V${H - padB - h + r}Q${x} ${H - padB - h} ${x + r} ${H - padB - h}H${x + inner - r}Q${x + inner} ${H - padB - h} ${x + inner} ${H - padB - h + r}V${H - padB}Z`} fill=${s.color} />`;
          })}
          <text x=${cx} y=${H - 6} class=${'tick' + (cur === i ? ' strong' : '')} text-anchor="middle">${l}</text>
        </g>`;
      })}
    </svg>
    ${cur != null && html`<div class="ctip" style=${{ left: `${((padL + bw * cur + bw / 2) / W) * 100}%`, transform: `translateX(${cur > n / 2 ? '-100%' : '0'})`, top: 0 }}>
      <div class="ctip-h">${labels[cur]}</div>
      ${series.map((s) => html`<div key=${s.key} class="ctip-r"><i style=${{ background: s.color }}></i>${s.label}<b class="num">${fmt(s.values[cur] || 0, true)}</b></div>`)}
    </div>`}
    </div>
  </div>`;
}

// ---- 小さな線(一覧用)
export function Spark({ values, w = 72, h = 26, color }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return html`<svg width=${w} height=${h}></svg>`;
  const min = Math.min(...v), max = Math.max(...v);
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)} ${(h - 2 - ((x - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`).join('');
  const c = color || (v.at(-1) >= v[0] ? 'var(--up)' : 'var(--down)');
  return html`<svg width=${w} height=${h} viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d=${d} fill="none" stroke=${c} stroke-width="1.6" stroke-linejoin="round" /></svg>`;
}

// ---- 横の棒(カテゴリの内訳・予算)
export function Meter({ value, max, color = 'var(--accent)', mark }) {
  const r = max > 0 ? Math.min(1, value / max) : 0;
  return html`<div class="meter"><i style=${{ width: `${r * 100}%`, background: value > max && max > 0 ? 'var(--warn)' : color }}></i>${mark != null && html`<b style=${{ left: `${Math.min(100, mark * 100)}%` }}></b>`}</div>`;
}

export const useMemoChart = useMemo;
