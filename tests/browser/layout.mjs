// Layout rule: nothing scrolls horizontally, at any width, in any app state: not the page,
// not any element (the board included). For every state x width it checks:
//   (a) layer 2: the ?debug=1 tracker reports nothing (nothing past the viewport, no element
//       whose content is wider than itself; it sees through the clip);
//   (b) no element's computed overflow-x is auto/scroll;
//   (c) layer 1 alone: with the html/body clip disabled, scrollWidth still fits the width.
// Plus: the tracker catches re-introduced bugs, tabs below 1200px, 5 equal columns from 1200px.
// Run: node tests/browser/layout.mjs [screenshot-dir]
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBrowser, URL_, sleep } from './cdp.mjs';

const OUT = process.argv[2] || join(tmpdir(), 'mini-crm-shots');
mkdirSync(OUT, { recursive: true });
const b = await startBrowser(9337);
const { ev, load, shot, width, errors } = b;
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) fails++; };
const frame = () => ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);

// ---------- without ?debug=1 the tracker is inert ----------
await load(URL_);
check('no ?debug=1: tracker not active (no badge, no API)', await ev(`!document.getElementById('debug-overflow-badge') && !window.__overflowDebug`));
check('layer 3: html and body have overflow-x: clip', await ev(`getComputedStyle(document.documentElement).overflowX === 'clip' && getComputedStyle(document.body).overflowX === 'clip'`));

await load(URL_ + '?debug=1');

// Page helpers (re-defined after every load).
const HELPERS = `
  window.confirm = () => true;
  window.__reset = () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const s = document.getElementById('search'); s.value = ''; const o = document.getElementById('onlyOverdue'); o.checked = false;
    document.getElementById('toast').hidden = true; Store.dismissNotice();
    for (const el of document.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
    document.getElementById('nowrap')?.remove();
    Store.resetSample(); render();
  };
  window.__addLong = () => {
    const L = 'عبدالرحمن‌محمدحسین‌عبدالله‌زاده‌ی‌اصفهانی‌نژاد‌خوشنویس‌تبار‌شیر'; // 60 chars, no spaces
    const c = Store.create({ name: L, phone: '09120001122', car: L, budget: 999999999999999, source: 'walk_in', followUp: '2020-01-01' });
    Store.addNote(c.id, (L + L + L).slice(0, 200)); render(); setActiveTab('new'); return c.id;
  };
  window.__many = (n) => { for (let i = 0; i < n; i++) Store.create({ name: 'مشتری ' + i, phone: '0912' + String(1000000 + i).slice(-7), car: '', budget: null, source: 'other', followUp: null }); render(); };
  window.__search = (q) => { const s = document.getElementById('search'); s.value = q; s.dispatchEvent(new Event('input')); };
  window.__openForm = (id) => id ? document.querySelector('.card[data-id="' + id + '"] .edit-btn').click() : document.getElementById('addBtn').click();
`;
await ev(HELPERS);

// Every app state the user can reach. Each runs after __reset().
const STATES = {
  ...Object.fromEntries(STATUSES_TABS()),
  'card with very long name/car/15-digit budget': `__addLong()`,
  'empty list': `for (const c of [...Store.all()]) Store.remove(c.id); render()`,
  'search without results': `__search('zzzz')`,
  'search with 1200 results (big tab counts)': `__many(1200); __search('مشتری')`,
  'overdue filter on': `const o = document.getElementById('onlyOverdue'); o.checked = true; o.dispatchEvent(new Event('change'))`,
  'details dialog': `document.querySelector('.card[data-id=sample_4] .card-name') ? (setActiveTab('test_drive'), document.querySelector('.card[data-id=sample_4] .card-name').click()) : 0`,
  'details dialog, long text': `const id = __addLong(); document.querySelector('.card[data-id="' + id + '"] .card-name').click()`,
  'add form, empty': `__openForm()`,
  'add form, filled': `__openForm(); const e = document.getElementById('customerForm').elements;
    e.name.value = 'کاربر آزمایشی با نام نسبتاً بلند'; e.phone.value = '۰۹۱۲ ۷۷۷ ۸۸۹۹'; e.car.value = 'مرسدس‌بنز GLA 250';
    e.budget.value = '۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹'; e.budget.dispatchEvent(new Event('input')); e.followUp.value = '2026-11-01'; e.followUp.dispatchEvent(new Event('input'))`,
  'add form, validation errors': `__openForm(); document.getElementById('customerForm').requestSubmit()`,
  'add form, duplicate-phone error': `__openForm(); const e = document.getElementById('customerForm').elements; e.name.value = 'تکراری'; e.phone.value = '09121234567'; document.getElementById('customerForm').requestSubmit()`,
  'edit form, long values': `const id = __addLong(); __openForm(id)`,
  'notice banner (save failed)': `const set = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('q', 'QuotaExceededError'); };
    Store.move('sample_9', 'contacted'); Storage.prototype.setItem = set; render()`,
  'toast after move (mobile)': `setActiveTab('new'); const s = document.querySelector('.card[data-id=sample_9] .move-select'); s.value = 'contacted'; s.dispatchEvent(new Event('change'));
    document.getElementById('toast').hidden = false`,
  'drag over a column/tab': `document.querySelector('.column[data-status=cancelled]').classList.add('drop-target'); document.querySelector('.tab[data-status=cancelled]').classList.add('drop-target')`,
  'old browser: no overflow-wrap: anywhere': `const st = document.createElement('style'); st.id = 'nowrap'; st.textContent = '* { overflow-wrap: normal !important; }'; document.head.append(st); __addLong()`,
};
function* STATUSES_TABS() {
  for (const [id, label] of [['new', 'جدید'], ['contacted', 'تماس گرفته شد'], ['test_drive', 'تست‌درایو'], ['purchased', 'خرید'], ['cancelled', 'انصراف']]) {
    yield [`tab/column: ${label}`, `setActiveTab('${id}')`];
  }
}

const NOCLIP = `document.head.insertAdjacentHTML('beforeend', '<style id="noclip">html, body { overflow-x: visible !important; }</style>')`;
const SCROLLERS = `[document.documentElement, ...document.querySelectorAll('*')].filter(e => /^(auto|scroll)$/.test(getComputedStyle(e).overflowX))
  .map(e => e.tagName.toLowerCase() + '.' + e.className)`;
const WIDTHS = [320, 375, 768, 1024, 1200, 1440];
const table = {};
for (const w of WIDTHS) {
  await width(w);
  for (const [name, setup] of Object.entries(STATES)) {
    await ev(`__reset()`);
    await ev(`{ ${setup} }`); // block scope: top-level const would leak between evaluations
    await frame();
    const tracker = await ev(`__overflowDebug.scan()`);                 // (a) clip on
    const scrollers = await ev(SCROLLERS);                             // (b)
    await ev(NOCLIP); await frame();
    const sw = await ev(`document.documentElement.scrollWidth`);        // (c) clip off
    await ev(`document.getElementById('noclip').remove()`);
    const ok = tracker.length === 0 && scrollers.length === 0 && sw <= w;
    (table[name] ||= {})[w] = ok ? 'OK' : '✗';
    if (!ok) check(`${name} @ ${w}px`, false, { tracker, scrollers, scrollWidthWithoutClip: sw });
  }
}
console.log('\nstate x width (tracker clean, no auto/scroll overflow, fits without the clip):');
console.table(table);
check(`all ${Object.keys(STATES).length} states x ${WIDTHS.length} widths: no horizontal overflow`, Object.values(table).every((r) => Object.values(r).every((v) => v === 'OK')));

// ---------- the tracker itself ----------
await width(375);
await ev(`__reset(); window.__warns = []; const w = console.warn; console.warn = (...a) => { window.__warns.push(String(a[0])); w(...a); }`);
await ev(`document.querySelector('.column.active .column-body').insertAdjacentHTML('afterbegin', '<div id="too-wide" class="probe" style="width: 2000px; height: 20px"></div>')`);
await frame(); await frame();
const found = await ev(`__overflowDebug.scan()`);
const badgeRed = await ev(`(() => { const b = document.getElementById('debug-overflow-badge'); return b.textContent + ' ' + getComputedStyle(b).backgroundColor; })()`);
check('tracker: finds a 2000px element (RTL -> sticks out on the left)', found[0].name === 'div#too-wide.probe' && found[0].left > 1500, found[0]);
check('tracker: also reports every container whose content got wider (body clipped, board, column...)', ['body. [content', 'main#board.board [content', 'div.column-body [content'].every((p) => found.some((f) => f.name.startsWith(p) && f.excess > 1500)), found.map((f) => f.name));
check('tracker: outlines it in red', await ev(`getComputedStyle(document.getElementById('too-wide')).outlineColor === 'rgb(220, 38, 38)'`));
check('tracker: badge turns red with count', /^✗ سرریز: [۰-۹]+ rgb\(220, 38, 38\)$/.test(badgeRed), badgeRed);
check('tracker: logs name, class and amount to console', (await ev(`__warns.join('|')`)).includes('div#too-wide.probe — left +'), await ev(`__warns.join('|')`));
await shot(join(OUT, 'l-tracker-red.png'));
await ev(`document.getElementById('too-wide').remove()`);
await frame(); await frame();
check('tracker: back to green after removal', await ev(`document.getElementById('debug-overflow-badge').textContent === '✓ بدون سرریز' && !document.querySelector('.debug-overflow-offender')`));
check('tracker: re-checks on resize', await (async () => { await ev(`window.__warns = []`); await width(1280); await width(375); await frame(); return true; })());

// ---------- tracker sensitivity: re-introduce real bugs, each must be caught ----------
// (with the clip on, scrollWidth looks clean for all of these; only the tracker sees them)
await width(320);
const BUGS = {
  'tab count nowrap (bug found in review)': ['.tab .count { white-space: nowrap !important; }',
    `setActiveTab('new'); document.querySelector('.tab[data-status=cancelled] .count').textContent = '۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰ از ۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰'`],
  'long name without wrapping/min-width (text overflow)': ['* { overflow-wrap: normal !important; word-break: normal !important; }', `__addLong()`],
  'fixed 500px dialog': ['dialog { max-width: none !important; width: 500px !important; }', `__openForm()`],
  'scrolling board (old design: 5 x 220px, overflow-x: auto)': ['.board { display: grid !important; grid-template-columns: repeat(5, 220px) !important; overflow-x: auto !important; } .column { display: block !important; }', `0`],
  'text spilling out of a box but still on screen (rightmost tab)': ['.tab .count { white-space: nowrap !important; }',
    `setActiveTab('new'); document.querySelector('.tab[data-status=new] .count').textContent = '۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰ از ۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰'`],
};
for (const [name, [css, setup]] of Object.entries(BUGS)) {
  await ev(`{ __reset(); document.head.insertAdjacentHTML('beforeend', '<style id="bug">${css}</style>'); ${setup} }`);
  await frame();
  const found = await ev(`__overflowDebug.scan()`);
  const sw = await ev(`document.documentElement.scrollWidth`);
  check(`tracker catches: ${name}`, found.length > 0, { found: found.slice(0, 2), scrollWidthWithClip: sw });
  await ev(`document.getElementById('bug').remove()`);
}
await width(375);

// ---------- mobile tabs ----------
await ev(`__reset(); setActiveTab('new')`);
const tabState = () => ev(`({
  tabsShown: getComputedStyle(document.getElementById('tabs')).display !== 'none',
  tabs: [...document.querySelectorAll('.tab')].map(t => t.querySelector('.tab-label').textContent + ':' + t.querySelector('.count').textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')),
  visibleCols: [...document.querySelectorAll('.column')].filter(c => c.offsetParent).map(c => c.dataset.status),
  cards: [...document.querySelectorAll('.card')].filter(c => c.offsetParent).length })`);
let t = await tabState();
check('375: 5 tabs with name + count', t.tabsShown && t.tabs.join(' ') === 'جدید:۲* تماس گرفته شد:۲ تست‌درایو:۲ خرید:۳ انصراف:۱', t.tabs);
check('375: only the active column is visible', t.visibleCols.join() === 'new' && t.cards === 2, t);
await shot(join(OUT, 'l-375-tabs.png'));
await ev(`document.querySelector('.tab[data-status=purchased]').click()`);
t = await tabState();
check('375: clicking "خرید" tab shows only that column', t.visibleCols.join() === 'purchased' && t.cards === 3 && t.tabs[3].endsWith('*'), t);
await ev(`(() => { const s = document.querySelector('.card[data-id=sample_1] .move-select'); s.value = 'cancelled'; s.dispatchEvent(new Event('change')); })()`);
t = await tabState();
check('375: move via menu updates tab counts, card leaves tab', t.tabs.join(' ') === 'جدید:۲ تماس گرفته شد:۲ تست‌درایو:۲ خرید:۲* انصراف:۲' && t.cards === 2, t.tabs);
check('375: toast says where the card went', (await ev(`document.getElementById('toast').textContent`)) === '«علی رضایی» به «انصراف» منتقل شد.');
await load();
await ev(HELPERS);
check('375: active tab remembered after reload', (await tabState()).visibleCols.join() === 'purchased');
const small = await ev(`[...document.querySelectorAll('input, select, textarea')].filter(e => e.offsetParent || e.closest('dialog'))
  .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => (e.name || e.className || e.id) + ':' + getComputedStyle(e).fontSize)`);
check('375: all text controls >= 16px (no iOS focus zoom)', small.length === 0, small);
await ev(`__reset(); __many(1200); __search('مشتری')`);
check('320/375: big filtered tab count wraps inside its tab', await ev(`[...document.querySelectorAll('.tab')].every(t => { const c = t.querySelector('.count').getBoundingClientRect(), r = t.getBoundingClientRect(); return c.left >= r.left - 0.5 && c.right <= r.right + 0.5; })`));
await shot(join(OUT, 'l-375-bigcounts.png'));
await ev(`__reset(); setActiveTab('new')`);
await ev(`(() => { const card = document.querySelector('.card[data-id=sample_9]'); const dt = new DataTransfer(); const tab = document.querySelector('.tab[data-status=contacted]');
  card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
  tab.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  tab.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
check('375: drop on a tab moves the card', (await ev(`Store.find('sample_9').status`)) === 'contacted');

// ---------- what each width shows: tabs below 1200px, 5 equal columns from 1200px ----------
const VIEW = `(() => {
  const vis = (e) => !!e.offsetParent;
  const tabs = [...document.querySelectorAll('.tab')].filter(vis);
  const cols = [...document.querySelectorAll('.column')].filter(vis);
  const cards = [...document.querySelectorAll('.card')].filter(vis);
  const rows = (els) => new Set(els.map(e => Math.round(e.getBoundingClientRect().top))).size;
  const perRow = (els) => { if (!els.length) return 0; const t = Math.round(els[0].getBoundingClientRect().top); return els.filter(e => Math.round(e.getBoundingClientRect().top) === t).length; };
  const board = document.getElementById('board');
  return {
    mode: tabs.length ? 'tabs' : 'columns',
    tabRows: tabs.length ? rows(tabs) : 0,
    columns: cols.length,
    columnWidths: [...new Set(cols.map(c => Math.round(c.getBoundingClientRect().width)))],
    cardsPerRow: perRow(cards),
    cardWidth: cards.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
    boardFits: board.scrollWidth <= board.clientWidth,
    cardsFit: cards.every(c => c.scrollWidth <= c.clientWidth),
  };
})()`;
const views = {};
for (const w of [320, 375, 768, 1024, 1200, 1440]) {
  await width(w);
  await ev(`__reset(); setActiveTab('purchased')`);
  await frame();
  const v = await ev(VIEW);
  views[w] = v;
  if (w < 1200) {
    check(`${w}: tabbed view, one column`, v.mode === 'tabs' && v.columns === 1 && v.boardFits && v.cardsFit, v);
  } else {
    check(`${w}: 5 equal columns side by side, no tabs`, v.mode === 'columns' && v.columns === 5 && v.columnWidths.length === 1 && v.boardFits && v.cardsFit, v);
  }
  await shot(join(OUT, `l-${w}.png`));
}
console.log('\nwhat each width shows ("خرید" tab active below 1200px):');
console.table(Object.fromEntries(Object.entries(views).map(([w, v]) => [w + 'px', { mode: v.mode, 'tab rows': v.tabRows || '-',
  'columns shown': v.columns, 'column width': v.columnWidths.join('/'), 'cards per row': v.cardsPerRow, 'card width': v.cardWidth }])));

// Tabs wrap to a second row instead of scrolling when they don't fit (force it with big counts).
await width(320);
await ev(`__reset(); __many(1200); __search('مشتری')`);
await frame();
const wrap = await ev(`(() => { const t = [...document.querySelectorAll('.tab')]; const box = document.getElementById('tabs');
  return { rows: new Set(t.map(e => Math.round(e.getBoundingClientRect().top))).size, fit: t.every(e => e.getBoundingClientRect().left >= box.getBoundingClientRect().left - 0.5 && e.getBoundingClientRect().right <= box.getBoundingClientRect().right + 0.5 && e.scrollWidth <= e.clientWidth), tracker: __overflowDebug.scan() }; })()`);
check('320 + long tab counts: tabs wrap to more rows, nothing scrolls', wrap.rows >= 2 && wrap.fit && wrap.tracker.length === 0, wrap);
await shot(join(OUT, 'l-320-tabs-wrapped.png'));

// Narrowest column view (1200px): cards with long text and both buttons still fit.
await width(1200);
await ev(`__reset(); __addLong()`);
await frame();
check('1200: card with long text in a narrow column fits, buttons on one row', await ev(`(() => { const c = document.querySelector('.card[data-id^="c_"]');
  const btns = [...c.querySelectorAll('.card-actions .btn')]; return c.scrollWidth <= c.clientWidth && btns[0].getBoundingClientRect().top === btns[1].getBoundingClientRect().top && __overflowDebug.scan().length === 0; })()`));
await shot(join(OUT, 'l-1200-long.png'));

// The "notice banner" state fakes a quota error on purpose; Store logs that one.
const unexpected = errors.filter((e) => !e.startsWith('Could not save data. QuotaExceededError'));
check('no unexpected console errors', unexpected.length === 0, unexpected);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
b.close();
process.exit(fails ? 1 : 0);
