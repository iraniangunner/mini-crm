// Layout rule: the page never scrolls horizontally; on tablet/desktop only .board may.
// Mobile (< 768px) shows status tabs with one visible column.
// Run: node tests/browser/layout.mjs [screenshot-dir]
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBrowser, URL_ } from './cdp.mjs';

const OUT = process.argv[2] || join(tmpdir(), 'mini-crm-shots');
mkdirSync(OUT, { recursive: true });
const b = await startBrowser(9337);
const { ev, load, shot, width, errors } = b;
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) fails++; };

await load(URL_);
await ev(`window.confirm = () => true`);

// 60 chars, no spaces (the form's max), 15-digit budget, long note, overdue.
const LONG = 'عبدالرحمن‌محمدحسین‌عبدالله‌زاده‌ی‌اصفهانی‌نژاد‌خوشنویس‌تبار‌شیر';
const scenarios = {
  'sample data': `Store.resetSample(); render()`,
  'long name/car/budget': `Store.resetSample(); Store.create({ name: '${LONG}', phone: '09120001122', car: '${LONG}', budget: 999999999999999, source: 'other', followUp: '2020-01-01' });
    Store.addNote(Store.all().at(-1).id, '${LONG}${LONG}'); render()`,
  '1200 customers (big counts)': `Store.resetSample(); for (let i = 0; i < 1200; i++) Store.create({ name: 'مشتری ' + i, phone: '0912' + String(1000000 + i).slice(-7), car: '', budget: null, source: 'other', followUp: null });
    const s = document.getElementById('search'); s.value = 'مشتری'; s.dispatchEvent(new Event('input')); s.value = ''; render()`,
  'details dialog (long)': `Store.resetSample(); Store.create({ name: '${LONG}', phone: '09120001122', car: '${LONG}', budget: 999999999999999, source: 'other', followUp: '2020-01-01' });
    Store.addNote(Store.all().at(-1).id, '${LONG}${LONG}'); render(); setActiveTab('new');
    document.querySelector('.card[data-id^="c_"] .card-name').click()`,
  'add/edit form + error': `document.getElementById('detailDialog').close(); document.querySelector('.card[data-id^="c_"] .edit-btn').click();
    const f = document.getElementById('customerForm'); f.elements.phone.value = '123'; f.requestSubmit()`,
  'no overflow-wrap support (old Safari)': `document.getElementById('customerDialog').close();
    const st = document.createElement('style'); st.id = 'nowrap'; st.textContent = '* { overflow-wrap: normal !important; }'; document.head.append(st); render()`,
};

// Page overflow measured against the real target width (mobile emulation would otherwise
// widen the layout viewport to fit overflowing content and hide the problem).
const measure = (W) => `(() => {
  const vw = Math.min(${W}, document.documentElement.clientWidth);
  const inInnerScroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const offenders = [...document.querySelectorAll('body *')].filter(e => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || e.closest('dialog:not([open])')) return false;
    return (r.right > vw + 0.5 || r.left < -0.5) && !inInnerScroller(e);
  }).filter((e, _, all) => !all.includes(e.parentElement)).slice(0, 4)
    .map(e => e.tagName.toLowerCase() + '.' + String(e.className).replace(/ /g, '.') + '[' + Math.round(e.getBoundingClientRect().left) + '..' + Math.round(e.getBoundingClientRect().right) + ']');
  return { scrollWidth: document.documentElement.scrollWidth, vw, offenders };
})()`;

const WIDTHS = [320, 375, 768, 1024, 1280];
const table = {};
for (const [name, setup] of Object.entries(scenarios)) {
  for (const w of WIDTHS) {
    await width(w);
    await ev(`{ ${setup} }`); // block scope: top-level const would leak between evaluations
    const m = await ev(measure(w));
    const ok = m.scrollWidth <= m.vw && m.offenders.length === 0;
    (table[name] ||= {})[w] = ok ? 'OK' : `SCROLL ${m.scrollWidth}/${m.vw}`;
    if (!ok) check(`${name} @ ${w}px`, false, m);
  }
}
await ev(`document.getElementById('nowrap')?.remove(); document.getElementById('customerDialog').close(); document.getElementById('detailDialog').close()`);
console.log('\npage horizontal scroll by width:');
console.table(table);
check('no page horizontal scroll in any scenario/width', Object.values(table).every((r) => Object.values(r).every((v) => v === 'OK')));

// --- mobile: tabs ---
await width(375);
await ev(`Store.resetSample(); setActiveTab('new'); render()`);
const tabState = () => ev(`({
  tabsShown: getComputedStyle(document.getElementById('tabs')).display !== 'none',
  tabs: [...document.querySelectorAll('.tab')].map(t => t.querySelector('.tab-label').textContent + ':' + t.querySelector('.count').textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')),
  visibleCols: [...document.querySelectorAll('.column')].filter(c => c.offsetParent).map(c => c.dataset.status),
  cards: [...document.querySelectorAll('.card')].filter(c => c.offsetParent).length })`);
let t = await tabState();
check('375: 5 tabs with name + count', t.tabsShown && t.tabs.join(' ') === 'جدید:۲* تماس گرفته شد:۲ تست‌درایو:۲ خرید:۳ انصراف:۱', t.tabs);
check('375: only the active column is visible', t.visibleCols.join() === 'new' && t.cards === 2, t);
check('375: tabs row fits (no overflow)', await ev(`(() => { const r = document.getElementById('tabs').getBoundingClientRect(); return r.right <= 375 && [...document.querySelectorAll('.tab')].every(t => t.scrollWidth <= t.clientWidth + 1); })()`));
await shot(join(OUT, 'l-375-tabs.png'));

await ev(`document.querySelector('.tab[data-status=purchased]').click()`);
t = await tabState();
check('375: clicking "خرید" tab shows only that column', t.visibleCols.join() === 'purchased' && t.cards === 3 && t.tabs[3].endsWith('*'), t);

await ev(`(() => { const s = document.querySelector('.card[data-id=sample_1] .move-select'); s.value = 'cancelled'; s.dispatchEvent(new Event('change')); })()`);
t = await tabState();
const toast = await ev(`document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent`);
check('375: move via menu updates tab counts, card leaves tab', t.tabs.join(' ') === 'جدید:۲ تماس گرفته شد:۲ تست‌درایو:۲ خرید:۲* انصراف:۲' && t.cards === 2, t.tabs);
check('375: toast says where the card went', toast === '«علی رضایی» به «انصراف» منتقل شد.', toast);
await shot(join(OUT, 'l-375-moved.png'));

await load();
check('375: active tab remembered after reload', (await tabState()).visibleCols.join() === 'purchased');

const small = await ev(`[...document.querySelectorAll('input, select, textarea')].filter(e => e.offsetParent || e.closest('dialog'))
  .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => (e.name || e.className || e.id) + ':' + getComputedStyle(e).fontSize)`);
check('375: all text controls >= 16px (no iOS focus zoom)', small.length === 0, small);

await ev(`(() => { const s = document.getElementById('search'); s.value = 'رضا'; s.dispatchEvent(new Event('input')); })()`);
check('375: search shows "x از y" on tabs', (await tabState()).tabs[3].startsWith('خرید:۱ از ۲'), (await tabState()).tabs);
await ev(`(() => { const s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);

// drag a card onto a tab (narrow desktop window with a mouse)
await ev(`setActiveTab('new'); render()`);
await ev(`(() => { const card = document.querySelector('.card[data-id=sample_9]'); const dt = new DataTransfer();
  const tab = document.querySelector('.tab[data-status=contacted]');
  card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
  tab.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  tab.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
check('375: drop on a tab moves the card', (await ev(`Store.find('sample_9').status`)) === 'contacted');

// --- tablet / desktop: columns, only the board scrolls ---
for (const w of [768, 1280]) {
  await width(w);
  await ev(`Store.resetSample(); render()`);
  const s = await ev(`({ tabs: getComputedStyle(document.getElementById('tabs')).display, cols: [...document.querySelectorAll('.column')].filter(c => c.offsetParent).length,
    board: [document.getElementById('board').scrollWidth, document.getElementById('board').clientWidth], page: [document.documentElement.scrollWidth, document.documentElement.clientWidth] })`);
  check(`${w}: column view (no tabs, 5 columns)`, s.tabs === 'none' && s.cols === 5, s);
  check(`${w}: page doesn't scroll${w === 768 ? '; board scrolls instead' : ''}`, s.page[0] <= s.page[1] && (w === 768 ? s.board[0] > s.board[1] : true), s);
  await shot(join(OUT, `l-${w}.png`));
}
await width(768);
await ev(`document.getElementById('board').scrollLeft = -10000`); // RTL: scroll toward the last column
await shot(join(OUT, 'l-768-scrolled.png'));
check('768: board scrolled to "انصراف" without moving the page', await ev(`document.documentElement.scrollLeft === 0 && document.getElementById('board').scrollLeft < 0`));

check('no uncaught errors', errors.length === 0, errors);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
b.close();
process.exit(fails ? 1 : 0);
