// Run: node tests/browser/edge.mjs [screenshot-dir]
// Edge-case regression: storage problems, empty list, long text, empty budget, 375px layout.
import { startBrowser, URL_ } from './cdp.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
const OUT = process.argv[2] || join(tmpdir(), 'mini-crm-shots');
mkdirSync(OUT, { recursive: true });
const b = await startBrowser(9335);
const { ev, load, shot, width, errors } = b;
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) fails++; };
const KEY = 'miniCrm.v1', BK = 'miniCrm.v1.backup';
const setRaw = async (raw) => { await ev(`localStorage.clear(); ${raw === undefined ? '' : `localStorage.setItem('${KEY}', ${JSON.stringify(raw)})`}`); await load(); };
const cards = () => ev(`document.querySelectorAll('.card').length`);
const notice = () => ev(`document.getElementById('notice').hidden ? '' : document.querySelector('.notice-text').textContent`);
const iso = new Date().toISOString();
const ok1 = { id: 'ok', name: 'سالم', phone: '09120000001', status: 'new', createdAt: iso, history: [{ type: 'created', to: 'new', at: iso }] };

await load(URL_);

// --- localStorage empty / corrupt ---
await setRaw(undefined);
check('empty localStorage -> 10 sample cards, no notice', (await cards()) === 10 && (await notice()) === '');

await setRaw('{not json');
check('corrupt JSON -> sample + notice', (await cards()) === 10 && (await notice()).includes('قابل خواندن نبود'), await notice());
check('corrupt JSON -> original backed up', (await ev(`localStorage.getItem('${BK}')`)) === '{not json');

await setRaw(JSON.stringify({ version: 2, customers: [] }));
check('unknown version -> backed up, not lost', (await ev(`localStorage.getItem('${BK}')`)).includes('"version":2'));

await setRaw('null');
check('"null" -> sample + notice', (await cards()) === 10 && (await notice()) !== '');

await setRaw(JSON.stringify({ version: 1, customers: [ok1,
  { id: 'x', name: 'بدون تاریخچه', phone: '09120000000', status: 'new' },
  { id: 'y', name: 'وضعیت عجیب', phone: '09120000002', history: [{ type: 'created', to: 'weird', at: iso }] },
  'garbage', null] }));
errors.length = 0;
check('broken customers dropped, valid one kept, app not crashed', (await cards()) === 1 && errors.length === 0, { cards: await cards(), errors });
check('  notice says 4 dropped', (await notice()).startsWith('۴ مشتری'), await notice());
check('  total equals visible cards', (await ev(`document.querySelector('.stat[data-key=total] .stat-value').textContent`)) === '۱');

await ev(`document.getElementById('noticeClose').click()`);
check('notice can be dismissed', (await notice()) === '');

// Old-format customer: no car/source/budget/followUp, status disagrees with history
await setRaw(JSON.stringify({ version: 1, customers: [{ ...ok1, status: 'purchased', history: [...ok1.history, { type: 'moved', from: 'new', to: 'contacted', at: iso }] }] }));
check('status re-derived from history', (await ev(`document.querySelector('.card').closest('.column').dataset.status`)) === 'contacted');
check('old customer: source shows "سایر", budget "—"', (await ev(`document.querySelector('.card-source').textContent + '|' + document.querySelector('.card-budget').textContent`)) === 'سایر|—');
await ev(`document.querySelector('.edit-btn').click()`);
check('old customer: edit form car is empty, not "undefined"', (await ev(`document.getElementById('customerForm').elements.car.value`)) === '');
await ev(`document.getElementById('customerDialog').close()`);

// --- empty list ---
await setRaw(JSON.stringify({ version: 1, customers: [] }));
check('empty list stays empty after reload (no sample re-inserted)', (await cards()) === 0);
const sumEmpty = await ev(`[...document.querySelectorAll('.stat .stat-value')].map(v => v.textContent).join('|')`);
check('empty list summary', sumEmpty === '۰|۰|۰|۰|۰|۰|هنوز داده‌ای نیست|هنوز داده‌ای نیست|۰', sumEmpty);
check('empty board hint in "new" column', (await ev(`document.querySelector('.column[data-status=new] .empty').textContent`)).includes('+ مشتری جدید'));
await shot(join(OUT, 'e-empty.png'));

// --- storage write failure ---
await ev(`window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }`);
await ev(`document.getElementById('addBtn').click(); (() => { const f = document.getElementById('customerForm'); f.elements.name.value = 'تست'; f.elements.phone.value = '09123334455'; f.requestSubmit(); })()`);
check('save failure -> visible warning', (await notice()).includes('ذخیره انجام نشد'), await notice());
await ev(`Storage.prototype.setItem = window.__origSet`);

// --- form: validation, long text, empty budget, duplicate, huge budget ---
await setRaw(undefined);
await ev(`window.confirm = () => true`);
const LONG = 'عبدالرحمن‌محمدحسین‌عبدالله‌زاده‌ی‌اصفهانی‌نژاد‌خوشنویس‌تبار‌شیرازی‌کرمانی‌تهرانی‌قزوینی‌رشتی';
const submit = (fields) => ev(`(() => { document.getElementById('addBtn').click(); const f = document.getElementById('customerForm');
  for (const [k, v] of Object.entries(${JSON.stringify(fields)})) { f.elements[k].value = v; f.elements[k].dispatchEvent(new Event('input')); }
  f.requestSubmit(); return { open: document.getElementById('customerDialog').open, name: document.querySelector('[data-error-for=name]').textContent, phone: document.querySelector('[data-error-for=phone]').textContent }; })()`);

let r = await submit({ name: ' ', phone: '' });
check('blank name + phone rejected', r.open && r.name !== '' && r.phone !== '', r);
await ev(`document.getElementById('customerDialog').close()`);
r = await submit({ name: 'تکراری', phone: '۰۹۱۲۱۲۳۴۵۶۷' });
check('duplicate phone rejected with owner name', r.open && r.phone.includes('علی رضایی'), r.phone);
await ev(`document.getElementById('customerDialog').close()`);
await ev(`document.querySelector('.card[data-id=sample_1] .edit-btn').click(); document.getElementById('customerForm').requestSubmit()`);
check('editing a customer keeps its own phone (not a duplicate)', !(await ev(`document.getElementById('customerDialog').open`)));

r = await submit({ name: LONG, phone: '09120001122', car: LONG, budget: '' });
check('name/car capped at 60 chars', (await ev(`Store.all().at(-1).name.length`)) <= 60 && (await ev(`Store.all().at(-1).car.length`)) <= 60);
check('empty budget saved as null, shown as "—"', (await ev(`Store.all().at(-1).budget === null && document.querySelector('.card[data-id="' + Store.all().at(-1).id + '"] .card-budget').textContent === '—'`)));
await ev(`Store.update(Store.all().at(-1).id, { name: ${JSON.stringify(LONG + LONG)}, car: ${JSON.stringify(LONG)} }); Store.addNote(Store.all().at(-1).id, ${JSON.stringify(LONG + LONG)}); render()`);
const longCard = `document.querySelector('.card[data-id="' + Store.all().at(-1).id + '"]')`;
check('very long name (stored data) wraps inside card', await ev(`${longCard}.scrollWidth <= ${longCard}.clientWidth + 1`), await ev(`${longCard}.scrollWidth + ' vs ' + ${longCard}.clientWidth`));

r = await ev(`(() => { document.getElementById('addBtn').click(); const b = document.getElementById('customerForm').elements.budget; b.value = '۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹'; b.dispatchEvent(new Event('input')); const v = b.value; document.getElementById('customerDialog').close(); return v; })()`);
check('huge budget capped to 15 exact digits', r === '۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹', r);
r = await ev(`(() => { document.getElementById('addBtn').click(); const b = document.getElementById('customerForm').elements.budget;
  b.value = '۱۲۳۴۵۶'; b.dispatchEvent(new Event('input')); b.setSelectionRange(2, 2); b.setRangeText('9', 2, 2, 'end'); b.dispatchEvent(new Event('input'));
  const out = b.value + ' caret@' + b.selectionStart; document.getElementById('customerDialog').close(); return out; })()`);
// "۱۲۳٬۴۵۶" + "9" typed after "۱۲" -> "۱٬۲۹۳٬۴۵۶", caret right after the ۹ (index 4).
check('budget caret stays after typed digit', r === '۱٬۲۹۳٬۴۵۶ caret@4', r);
r = await ev(`parseBudget('۰۰۰۵') + ',' + parseBudget('0')`);
check('budget leading zeros', r === '5,0', r);

// --- layout at 375px ---
// Layer 1 must hold on its own: measure with the html/body clip (layer 3) disabled.
await ev(`document.head.insertAdjacentHTML('beforeend', '<style id="noclip">html, body { overflow-x: visible !important; }</style>')`);
for (const w of [375, 320]) {
  await width(w);
  const sw = await ev(`document.documentElement.scrollWidth`);
  const wide = await ev(`[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > ${w} + 1 || r.left < -1); }).slice(0, 5).map(e => e.tagName + '.' + e.className)`);
  check(`${w}px: no horizontal scroll (with long-name card)`, sw <= w && wide.length === 0, { scrollWidth: sw, wide });
}
await width(375);
await shot(join(OUT, 'e-375.png'));
await ev(`${longCard}.querySelector('.card-name').click()`);
check('375px: details dialog fits', await ev(`(() => { const d = document.getElementById('detailDialog'); const r = d.getBoundingClientRect(); return d.scrollWidth <= d.clientWidth && r.right <= 375 && r.left >= 0; })()`));
await shot(join(OUT, 'e-375-detail.png'));
await ev(`document.getElementById('detailEdit').click()`);
check('details -> edit opens prefilled form', await ev(`document.getElementById('customerDialog').open && document.getElementById('customerForm').elements.phone.value === '۰۹۱۲۰۰۰۱۱۲۲'`));
check('375px: form dialog fits', await ev(`(() => { const r = document.getElementById('customerDialog').getBoundingClientRect(); return r.right <= 375 && r.left >= 0; })()`));
await shot(join(OUT, 'e-375-form.png'));
await ev(`document.getElementById('customerDialog').close()`);

// --- filter count label ---
await width(1400);
await ev(`(() => { const s = document.getElementById('search'); s.value = 'رضا'; s.dispatchEvent(new Event('input')); })()`);
check('filtered column count shows "x از y"', (await ev(`document.querySelector('.column[data-status=purchased] .count').textContent`)) === '۲ از ۳');
await ev(`(() => { const s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
await shot(join(OUT, 'e-desktop.png'));

// --- distinct column colors ---
const colors = await ev(`[...document.querySelectorAll('.column')].map(c => getComputedStyle(c).borderTopColor)`);
check('5 distinct column colors', new Set(colors).size === 5, colors);

check('no uncaught errors', errors.filter((e) => !e.includes('Could not save') && !e.includes('quota')).length === 0, errors);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
b.close();
process.exit(fails ? 1 : 0);
