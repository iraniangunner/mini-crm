// Main flow in headless Chrome: create, validate, move (menu + drag), reload, details,
// summary, follow-ups, search, notes, edit/delete/reset.
// Run: node tests/browser/e2e.mjs [screenshot-dir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBrowser, URL_, sleep } from './cdp.mjs';

const OUT = process.argv[2] || join(tmpdir(), 'mini-crm-shots');
mkdirSync(OUT, { recursive: true });
const b = await startBrowser(9333);
const { send, ev, load, errors } = b;
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) fails++; };

await load(URL_);

const counts = () => ev(`[...document.querySelectorAll('.column')].map(c => c.dataset.status + ':' + c.querySelectorAll('.card').length + '/' + c.querySelector('.count').textContent).join(' ')`);
check('sample data loads 2/2/2/3/1', (await counts()) === 'new:2/۲ contacted:2/۲ test_drive:2/۲ purchased:3/۳ cancelled:1/۱', await counts());

const avg = await ev(`(() => { const d = JSON.parse(localStorage.getItem('miniCrm.v1')).customers.filter(c => c.status === 'purchased');
  const days = d.map(c => (Date.parse(c.history.filter(h => h.to === 'purchased').at(-1).at) - Date.parse(c.history[0].at)) / 864e5);
  return (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1); })()`);
check('sample average new->purchased = 14.3', avg === '14.3', avg);

// Invalid submit
await ev(`document.getElementById('addBtn').click()`);
await ev(`(() => { const f = document.getElementById('customerForm'); f.elements.name.value = 'تست'; f.elements.phone.value = '0912123'; f.requestSubmit(); })()`);
const errText = await ev(`document.querySelector('[data-error-for=phone]').textContent`);
check('invalid phone rejected', errText.length > 0 && (await ev(`document.getElementById('customerDialog').open`)), errText);
await ev(`(() => { const f = document.getElementById('customerForm'); f.elements.name.value = ''; f.elements.phone.value = '09121234567'; f.requestSubmit(); })()`);
check('empty name rejected', (await ev(`document.querySelector('[data-error-for=name]').textContent`)).length > 0);

// Valid submit with Persian digits + budget formatting via input event
await ev(`(() => { const f = document.getElementById('customerForm'); const e = f.elements;
  e.name.value = 'کاربر آزمایشی'; e.phone.value = '۰۹۱۲ ۷۷۷ ۸۸۹۹'; e.car.value = 'بنز C200';
  e.budget.value = '۳۵۰۰۰۰۰۰۰۰'; e.budget.dispatchEvent(new Event('input')); e.source.value = 'divar'; f.requestSubmit(); })()`);
const budgetField = await ev(`document.getElementById('customerForm').elements.budget.value`);
check('budget formatted while typing', budgetField === '۳٬۵۰۰٬۰۰۰٬۰۰۰', budgetField);
const newCard = `[...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === 'کاربر آزمایشی')`;
check('customer created in "new"', await ev(`${newCard}?.closest('.column').dataset.status === 'new'`));
const saved = await ev(`JSON.parse(localStorage.getItem('miniCrm.v1')).customers.find(c => c.name === 'کاربر آزمایشی')`);
check('phone normalized + budget numeric', saved.phone === '09127778899' && saved.budget === 3500000000, `${saved.phone} ${saved.budget}`);

// Move via menu
await ev(`(() => { const s = ${newCard}.querySelector('.move-select'); s.value = 'contacted'; s.dispatchEvent(new Event('change')); })()`);
check('moved via menu to contacted', await ev(`${newCard}.closest('.column').dataset.status === 'contacted'`));

// Move via drag & drop (synthetic events with a real DataTransfer)
await ev(`(() => { const card = ${newCard}; const dt = new DataTransfer();
  const target = document.querySelector('.column[data-status=test_drive]');
  card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
  target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  card.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true })); })()`);
check('moved via drag to test_drive', await ev(`${newCard}.closest('.column').dataset.status === 'test_drive'`));

// Same-column drop should not add history
await ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${newCard}.dataset.id);
  document.querySelector('.column[data-status=test_drive]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);

// Reload and verify persistence
await load();
check('after reload: still in test_drive', await ev(`${newCard}?.closest('.column').dataset.status === 'test_drive'`));
await ev(`${newCard}.querySelector('.card-name').click()`);
const hist = await ev(`[...document.querySelectorAll('#detailDialog .timeline li')].map(l => l.textContent)`);
check('after reload: card click opens details with 3-record timeline', (await ev(`document.getElementById('detailDialog').open`)) && hist.length === 3, '\n      ' + hist.join('\n      '));
check('timeline format', /^از تماس گرفته شد به تست‌درایو — [۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2} ساعت [۰-۹]{2}:[۰-۹]{2}$/.test(hist[0]), hist[0]);
const shotD = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'details.png'), Buffer.from(shotD.result.data, 'base64'));
await ev(`document.getElementById('detailClose').click()`);
await ev(`${newCard}.querySelector('.move-select').focus()`);
check('select click does not open details', !(await ev(`(${newCard}.querySelector('.move-select').click(), document.getElementById('detailDialog').open)`)));
const summaryText = () => ev(`[...document.querySelectorAll('.stat')].map(s => s.dataset.key + '=' + s.querySelector('.stat-value').textContent).join(' ')`);
console.log('      summary:', await summaryText());
const raw = await ev(`JSON.parse(localStorage.getItem('miniCrm.v1')).customers.find(c => c.name === 'کاربر آزمایشی').history.map(h => h.type + ':' + (h.from || '') + '>' + h.to).join(' | ')`);
check('stored history', raw === 'created:>new | moved:new>contacted | moved:contacted>test_drive', raw);
console.log('      counts after reload:', await counts());

// Screenshot for a visual look
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'board.png'), Buffer.from(shot.result.data, 'base64'));

// Edit
await ev(`window.confirm = () => true`);
await ev(`${newCard}.querySelector('.edit-btn').click()`);
const prefilled = await ev(`document.getElementById('customerForm').elements.phone.value + ' | ' + document.getElementById('customerForm').elements.budget.value`);
await ev(`(() => { const f = document.getElementById('customerForm'); f.elements.car.value = 'بی‌ام‌و X3'; f.requestSubmit(); })()`);
check('edit saves, keeps column + history', await ev(`${newCard}.querySelector('.card-car').textContent === 'بی‌ام‌و X3' && ${newCard}.closest('.column').dataset.status === 'test_drive' && Store.find(${newCard}.dataset.id).history.length === 3`), 'prefilled: ' + prefilled);

// Delete (confirm stubbed to true)
await ev(`${newCard}.querySelector('.delete-btn').click()`);
check('delete removes card', await ev(`!${newCard} && !JSON.parse(localStorage.getItem('miniCrm.v1')).customers.some(c => c.name === 'کاربر آزمایشی')`));

// Reset sample
await ev(`(() => { const s = document.querySelector('.card .move-select'); s.value = 'cancelled'; s.dispatchEvent(new Event('change')); })()`);
await ev(`document.getElementById('resetBtn').click()`);
check('reset restores sample', (await counts()) === 'new:2/۲ contacted:2/۲ test_drive:2/۲ purchased:3/۳ cancelled:1/۱', await counts());
const sum0 = await summaryText();
check('summary on sample data', sum0 === 'total=۱۰ new=۲ contacted=۲ test_drive=۲ purchased=۳ cancelled=۱ rate=۳۰٪ avg=۱۴٫۳ روز overdue=۲', sum0);

// Follow-up flags on sample data
const flags = await ev(`[...document.querySelectorAll('.card')].map(c => c.querySelector('.card-name').textContent + ':' + (c.classList.contains('overdue') ? 'overdue' : c.classList.contains('today') ? 'today' : '-') + ':' + (c.querySelector('.flag')?.textContent || '')).sort().join(' | ')`);
const flagOf = (name) => flags.split(' | ').find((x) => x.startsWith(name + ':'));
check('overdue flags: حسین, زهرا', flagOf('حسین نوری') === 'حسین نوری:overdue:عقب‌افتاده' && flagOf('زهرا حسینی') === 'زهرا حسینی:overdue:عقب‌افتاده', flags);
check('today flags: سارا, امیر', flagOf('سارا موسوی') === 'سارا موسوی:today:امروز' && flagOf('امیر جعفری') === 'امیر جعفری:today:امروز');
check('purchased/cancelled with past date: no flag', flagOf('علی رضایی') === 'علی رضایی:-:' && flagOf('نگار شریفی') === 'نگار شریفی:-:');
check('card shows Jalali follow-up', /^پیگیری: [۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(await ev(`document.querySelector('.card.overdue .followup-date').textContent`)));
const shotF = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'followups.png'), Buffer.from(shotF.result.data, 'base64'));

// Overdue filter
const visibleNames = () => ev(`[...document.querySelectorAll('.card .card-name')].map(n => n.textContent).sort().join(',')`);
await ev(`(() => { const c = document.getElementById('onlyOverdue'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
check('filter: only overdue', (await visibleNames()) === ['حسین نوری', 'زهرا حسینی'].sort().join(','), await visibleNames());
check('filter: summary unchanged', (await summaryText()) === sum0);
await ev(`(() => { const c = document.getElementById('onlyOverdue'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);

// Live search
const search = async (q) => { await ev(`(() => { const s = document.getElementById('search'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); })()`); return visibleNames(); };
check('search Persian digits ۰۹۳۵', (await search('۰۹۳۵')) === 'مریم احمدی', await search('۰۹۳۵'));
check('search Latin digits 0935', (await search('0935')) === 'مریم احمدی');
check('search name "رضا"', (await search('رضا')) === ['رضا کریمی', 'علی رضایی'].sort().join(','), await search('رضا'));
check('search no match -> "نتیجه‌ای نیست"', (await search('xyz')) === '' && (await ev(`document.querySelector('.empty').textContent`)) === 'نتیجه‌ای نیست');
await search('');
check('search cleared -> all 10', (await ev(`document.querySelectorAll('.card').length`)) === 10);

// Notes
await ev(`document.querySelector('.card[data-id=sample_7] .card-name').click()`);
await ev(`(() => { const f = document.getElementById('noteForm'); f.elements.text.value = '  تماس گرفتم، فردا میاد نمایشگاه  '; f.requestSubmit(); })()`);
const top = await ev(`document.querySelector('#detailDialog .timeline li').textContent`);
check('note added at top of open timeline', /^یادداشت: تماس گرفتم، فردا میاد نمایشگاه — [۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2} ساعت [۰-۹]{2}:[۰-۹]{2}$/.test(top) && (await ev(`document.getElementById('detailDialog').open`)), top);
await ev(`(() => { const f = document.getElementById('noteForm'); f.elements.text.value = '   '; f.requestSubmit(); })()`);
check('empty note ignored', (await ev(`Store.find('sample_7').history.length`)) === 4);
const shotN = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'notes.png'), Buffer.from(shotN.result.data, 'base64'));
await ev(`document.getElementById('detailClose').click()`);
check('note does not change column date/status', await ev(`Store.find('sample_7').status === 'contacted' && document.querySelector('.card[data-id=sample_7] .card-since').textContent.includes('۱۴۰۵')`));

// Follow-up via form: set to yesterday -> overdue; persists after reload
const yesterday = await ev(`(() => { const d = new Date(); d.setDate(d.getDate() - 1); return toYmd(d); })()`);
await ev(`document.querySelector('.card[data-id=sample_10] .edit-btn').click()`);
await ev(`(() => { const f = document.getElementById('customerForm'); f.elements.followUp.value = '${yesterday}'; f.elements.followUp.dispatchEvent(new Event('input')); })()`);
const hint = await ev(`document.getElementById('followUpHint').textContent`);
check('form shows Jalali hint', /^شمسی: [۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(hint), hint);
await ev(`document.getElementById('customerForm').requestSubmit()`);
await load();
check('after reload: follow-up + note persisted', await ev(`document.querySelector('.card[data-id=sample_10]').classList.contains('overdue') && Store.find('sample_7').history.at(-1).type === 'note'`));
check('overdue count now ۳', (await ev(`document.querySelector('.stat[data-key=overdue] .stat-value').textContent`)) === '۳');
await ev(`window.confirm = () => true`);

// Purchased customer leaves and comes back: the last entry counts and the summary updates live.
await ev(`Store.move('sample_1', 'test_drive')`); await ev(`render()`);
const sum1 = await summaryText();
await ev(`Store.move('sample_1', 'purchased')`); await ev(`render()`);
const avgAfter = await ev(`document.querySelector('.stat[data-key=avg] .stat-value').textContent`);
check('left purchase -> excluded; re-purchased now -> last entry counts', sum1.includes('rate=۲۰٪ avg=۱۷ روز') && avgAfter !== '۱۴٫۳ روز', `${sum1} | after re-purchase: ${avgAfter}`);

// No purchases at all
await ev(`for (const c of Store.all().filter(c => c.status === 'purchased')) Store.move(c.id, 'cancelled'); render()`);
check('no purchases -> "هنوز داده‌ای نیست"', (await ev(`document.querySelector('.stat[data-key=avg] .stat-value').textContent`)) === 'هنوز داده‌ای نیست');
await ev(`Store.resetSample(); render()`);

// Mobile width screenshot
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await sleep(300);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'mobile.png'), Buffer.from(shot2.result.data, 'base64'));
await ev(`document.head.insertAdjacentHTML('beforeend', '<style id="noclip">html, body { overflow-x: visible !important; }</style>')`); // layer 1 alone
check('no horizontal scroll on mobile', await ev(`document.documentElement.scrollWidth <= 390`), await ev(`document.documentElement.scrollWidth + ' vs 390'`));

check('no console errors/warnings', errors.length === 0, errors.join(' ; '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
b.close();
process.exit(fails ? 1 : 0);
