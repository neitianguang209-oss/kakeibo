// 線画のアイコン。カテゴリは色つきの線画でそろえる(自分で足したカテゴリは絵文字のまま)
import React from 'react';
import htm from 'htm';
import { catInfo } from './util.js';
const html = htm.bind(React.createElement);

const P = {
  // 食べる
  food: 'M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 3c-2 1.5-3 4-3 7 0 2 1 3 3 3m0-10v18',
  glass: 'M5 4l6 1-1 6a3 3 0 0 1-6-1L5 4zM7 13l-1 7M3.5 20l5 .5M19 4l-6 1 1 6a3 3 0 0 0 6-1l-1-6zM17 13l1 7M20.500 20l-5 .5',
  bento: 'M3 7h18v11H3zM3 12h18M12 12v6M7.500 9.500h.01',
  cake: 'M4 20h16V11L4 14v6zM4 17l4-1 4 1 4-1 4 1M4 14L15 6l5 5M16 5.500a1.500 1.500 0 1 0 .1-.1',
  // 暮らし
  bottle: 'M10 3h4v3l3 4v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l3-4V3zM12 12c-1.500 2-2 3-2 3.800a2 2 0 0 0 4 0c0-.8-.5-1.800-2-3.800z',
  shirt: 'M8 4L3 7l2 5 2-1v9h10v-9l2 1 2-5-5-3c-1 1.500-2.500 2-4 2s-3-.5-4-2z',
  lipstick: 'M9 12V6l5-3v9M8 12h7v3H8zM7 15h9v6H7z',
  medical: 'M4.500 13.500l9-9a4.200 4.200 0 0 1 6 6l-9 9a4.200 4.200 0 0 1-6-6zM9 9l6 6',
  book: 'M5 4h13v17H7a2 2 0 0 1-2-2V4zM5 19a2 2 0 0 1 2-2h11M9 8h5',
  tap: 'M3 9h8V7h4v2h2a4 4 0 0 1 4 4h-4a1 1 0 0 0-1-1h-1v2h-4v-2H3M13 7V4M10 4h6M19 16s-2 2.300-2 3.500a2 2 0 0 0 4 0c0-1.200-2-3.500-2-3.500z',
  train: 'M7 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 10h14M8.500 13.500h.01M15.500 13.500h.01M8 17l-2 4M16 17l2 4',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7zM15 7v2M15 11v2M15 15v2',
  cap: 'M2 9l10-5 10 5-10 5L2 9zM6 11.500V16c0 1.500 3 3 6 3s6-1.500 6-3v-4.500M22 9v6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10M7.500 5l9 4',
  home: 'M3 11l9-8 9 8M5 9.500V21h14V9.500M10 21v-6h4v6',
  wifi: 'M2.500 9a14 14 0 0 1 19 0M6 12.500a9 9 0 0 1 12 0M9.500 16a4 4 0 0 1 5 0M12 19.500h.01',
  phone: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 18h4',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21M8.500 21h7',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h.01',
  tagi: 'M3 12V4h8l10 10-8 8L3 12zM7.500 8h.01',
  // 収入・資産
  wallet: 'M4 6h13v3M4 6a1.500 1.500 0 0 0 0 3h16v11H5a2 2 0 0 1-2-2V7.500M16 14.500h.01',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10.500 3 8.500 3.500 7.500 7 12 7zm0 0s1.500-4 3.500-3.500S16.500 7 12 7z',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  bag: 'M5 8h14l-1 13H6L5 8zM9 10V6a3 3 0 0 1 6 0v4',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 17v4M17 19h4',
  leaf: 'M5 19C4 10 10 4 20 4c0 10-6 16-15 15zM5 19l8-8',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.500 7.500L12 12l3.500-4.500M12 12v5M9 12.500h6M9 15h6',
  chart: 'M4 4v16h16M7 15l4-5 3 3 5-7M15 6h4v4',
  basket: 'M3 9h18l-2 11H5L3 9zM8 9l3-6M16 9l-3-6M9 13v3M15 13v3',
  scale: 'M12 4v16M7 20h10M5 7h14M5 7l-3 6a3.500 3.500 0 0 0 6 0L5 7zM19 7l-3 6a3.500 3.500 0 0 0 6 0l-3-6z',
  // 画面の部品
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01M8 17h2',
  pie: 'M11 4a8.500 8.500 0 1 0 9 9h-9V4zM15 3.500A8 8 0 0 1 20.500 9H15V3.500z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  camera: 'M4 8h4l1.500-3h5L16 8h4v12H4zM12 10.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z',
  search: 'M10.500 4a6.500 6.500 0 1 0 0 13 6.500 6.500 0 0 0 0-13zM15.500 15.500L21 21',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  reload: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5',
  gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5zM8 14.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.500 6.500l4 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  star: 'M12 3.500l2.600 5.300 5.900.9-4.300 4.100 1 5.800-5.200-2.700-5.200 2.700 1-5.800-4.300-4.100 5.900-.9L12 3.500z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.500 9h.01',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
};

export function Icon({ k, size = 22, w = 1.7, fill = 'none' }) {
  return html`<svg class="ic" viewBox="0 0 24 24" width=${size} height=${size} fill=${fill} stroke="currentColor" stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[k] || P.tagi} /></svg>`;
}

const CAT_ICON = {
  食費: 'food', 外食: 'glass', 日用品: 'bottle', 衣服: 'shirt', 美容: 'lipstick', 医療費: 'medical', 教育費: 'book', 光熱費: 'tap', 交通費: 'train', 遊び: 'ticket', 甘え: 'cake', 学食: 'bento', ゼミ: 'cap', 引っ越し諸々: 'box', 住まい: 'home', 通信: 'wifi', サブスク: 'phone', 習い事: 'mic', 自己投資: 'target', その他: 'tagi',
  趣味: 'mic', 給料: 'wallet', 賞与: 'gift', 仕送り: 'mail', メルカリ: 'bag', 臨時収入: 'spark', '配当・分配金': 'leaf', その他収入: 'coin',
  投資: 'chart', 積立: 'leaf', 株: 'chart', 投資信託: 'basket', その他投資: 'chart', 残高あわせ: 'scale',
};

// カテゴリの絵。色はカテゴリごとに固定
export function CatIcon({ id, conf, size = 24 }) {
  const c = id === '残高あわせ' ? { color: 'var(--ink3)' } : catInfo(id, conf);
  const color = ['投資', '積立', '株', '投資信託'].includes(id) ? 'var(--c-inv)' : c.color;
  return html`<span class="ci-ic" style=${{ color }}>${CAT_ICON[id] ? html`<${Icon} k=${CAT_ICON[id]} size=${size} />` : html`<span class="emo" style=${{ fontSize: size - 5 }}>${c.icon}</span>`}</span>`;
}
