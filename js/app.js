// Rendering and UI events. All data changes go through Store, then render() redraws the board.

const board = document.getElementById('board');
const tabs = document.getElementById('tabs');
const cardTemplate = document.getElementById('cardTemplate');
const dialog = document.getElementById('customerDialog');
const form = document.getElementById('customerForm');

// Must match the breakpoint in styles.css where columns turn into tabs.
const tabbedQuery = window.matchMedia('(max-width: 1199.98px)');

// Remembered per browser; a convenience only, so storage errors are ignored.
const ACTIVE_TAB_KEY = 'miniCrm.activeTab';
let activeStatus = 'new';
try {
  const saved = localStorage.getItem(ACTIVE_TAB_KEY);
  if (STATUSES.some((s) => s.id === saved)) activeStatus = saved;
} catch (e) { /* ignore */ }

// ---------- Board ----------

function buildBoard() {
  for (const s of STATUSES) {
    const col = document.createElement('section');
    col.className = 'column';
    col.id = `col-${s.id}`;
    col.dataset.status = s.id;
    col.setAttribute('role', 'tabpanel');
    col.style.setProperty('--col-color', `var(--col-${s.id})`);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.dataset.status = s.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', col.id);
    tab.style.setProperty('--col-color', `var(--col-${s.id})`);
    const tabLabel = document.createElement('span');
    tabLabel.className = 'tab-label';
    tabLabel.textContent = s.label;
    const tabCount = document.createElement('span');
    tabCount.className = 'count';
    tab.append(tabLabel, tabCount);
    tab.addEventListener('click', () => setActiveTab(s.id));
    tabs.append(tab);
    attachDropTarget(tab); // dropping a dragged card on a tab moves it there

    const head = document.createElement('header');
    head.className = 'column-head';
    const title = document.createElement('span');
    title.textContent = s.label;
    const count = document.createElement('span');
    count.className = 'count';
    head.append(title, count);

    const body = document.createElement('div');
    body.className = 'column-body';

    col.append(head, body);
    board.append(col);
    attachDropTarget(col);
  }
}

const FOLLOW_UP_FLAGS = { overdue: 'عقب‌افتاده', today: 'امروز' };

function setActiveTab(status) {
  activeStatus = status;
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, status);
  } catch (e) { /* ignore */ }
  updateTabs();
}

// Only the active column is shown on mobile (via CSS); desktop ignores .active.
function updateTabs() {
  for (const tab of tabs.children) {
    const on = tab.dataset.status === activeStatus;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  for (const col of board.children) col.classList.toggle('active', col.dataset.status === activeStatus);
}

// ---------- Toast ----------

const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

// Date the customer entered their current column (notes don't count).
function enteredStatusAt(c) {
  return c.history.filter((h) => h.to).at(-1).at;
}

function renderCard(c, today) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.id = c.id;

  const state = followUpState(c, today);
  const followUp = card.querySelector('.card-followup');
  if (c.followUp) {
    followUp.querySelector('.followup-date').textContent = 'پیگیری: ' + formatYmd(c.followUp);
    if (state) {
      card.classList.add(state);
      followUp.querySelector('.flag').textContent = FOLLOW_UP_FLAGS[state];
    }
  } else {
    followUp.remove();
  }

  card.querySelector('.card-name').textContent = c.name;
  card.querySelector('.card-phone').textContent = formatPhone(c.phone);
  card.querySelector('.card-car').textContent = c.car || '—';
  card.querySelector('.card-budget').textContent = formatBudget(c.budget);
  card.querySelector('.card-source').textContent = labelOf(SOURCES, c.source);
  card.querySelector('.card-since').textContent = 'در این مرحله از ' + formatDateTime(enteredStatusAt(c));

  // Clicking the card (not its controls) opens the details window.
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button, select')) openDetails(c);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === card) openDetails(c);
  });

  const select = card.querySelector('.move-select');
  select.append(new Option('انتقال به...', '', true, true));
  for (const s of STATUSES) {
    if (s.id !== c.status) select.append(new Option(s.label, s.id));
  }
  select.addEventListener('change', () => {
    const to = select.value;
    if (!to || !Store.move(c.id, to)) return;
    render();
    // In the tabbed view the card leaves the visible tab, so say where it went.
    if (tabbedQuery.matches) showToast(`«${c.name}» به «${labelOf(STATUSES, to)}» منتقل شد.`);
  });

  card.querySelector('.edit-btn').addEventListener('click', () => openForm(c));
  card.querySelector('.delete-btn').addEventListener('click', () => {
    if (confirm(`مشتری «${c.name}» حذف شود؟`)) {
      Store.remove(c.id);
      render();
    }
  });

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', c.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

// ---------- Summary bar ----------

function renderSummary(today) {
  const s = computeStats(Store.all(), STATUSES.map((x) => x.id), today);
  const items = [
    ['کل مشتری‌ها', toFaDigits(s.total), 'total'],
    ...STATUSES.map((x) => [x.label, toFaDigits(s.byStatus[x.id]), x.id]),
    ['نرخ تبدیل (خرید از کل)', formatRate(s.conversionRate), 'rate'],
    ['میانگین روزهای جدید تا خرید', formatAvgDays(s.avgDays), 'avg'],
    ['پیگیری عقب‌افتاده', toFaDigits(s.overdue), 'overdue'],
  ];
  const summary = document.getElementById('summary');
  summary.replaceChildren(...items.map(([label, value, key]) => {
    const box = document.createElement('div');
    box.className = 'stat';
    box.dataset.key = key;
    if (STATUSES.some((x) => x.id === key)) box.style.setProperty('--col-color', `var(--col-${key})`);
    if (value === NO_DATA) box.classList.add('no-data');
    const l = document.createElement('span');
    l.className = 'stat-label';
    l.textContent = label;
    const v = document.createElement('strong');
    v.className = 'stat-value';
    v.textContent = value;
    box.append(l, v);
    return box;
  }));
}

// ---------- Details window ----------

const detailDialog = document.getElementById('detailDialog');

function timelineText(h) {
  if (h.type === 'created') return `ثبت مشتری در ${labelOf(STATUSES, h.to)} — ${formatDateTime(h.at)}`;
  if (h.type === 'note') return `یادداشت: ${h.text} — ${formatDateTime(h.at)}`;
  return `از ${labelOf(STATUSES, h.from)} به ${labelOf(STATUSES, h.to)} — ${formatDateTime(h.at)}`;
}

function openDetails(c) {
  detailDialog.dataset.id = c.id;
  detailDialog.querySelector('.detail-name').textContent = c.name;
  const badge = detailDialog.querySelector('.detail-status');
  badge.textContent = labelOf(STATUSES, c.status);
  badge.style.setProperty('--col-color', `var(--col-${c.status})`);

  const info = [
    ['موبایل', formatPhone(c.phone)],
    ['خودروی مورد علاقه', c.car || '—'],
    ['بودجه', formatBudget(c.budget)],
    ['منبع آشنایی', labelOf(SOURCES, c.source)],
    ['پیگیری بعدی', c.followUp ? formatYmd(c.followUp) : '—'],
    ['تاریخ ثبت', formatDateTime(c.createdAt)],
  ];
  detailDialog.querySelector('.detail-info').replaceChildren(...info.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    if (k === 'موبایل') dd.dir = 'ltr'; // keep "۰۹۱۲ ۷۷۷ ۸۸۹۹" from being reordered in RTL
    return [dt, dd];
  }));

  // Newest first.
  detailDialog.querySelector('.timeline').replaceChildren(...[...c.history].reverse().map((h) => {
    const li = document.createElement('li');
    if (h.type === 'note') li.className = 'note';
    else li.style.setProperty('--col-color', `var(--col-${h.to})`);
    li.textContent = timelineText(h);
    return li;
  }));

  if (!detailDialog.open) {
    noteForm.reset();
    detailDialog.showModal();
  }
}

const noteForm = document.getElementById('noteForm');
noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = detailDialog.dataset.id;
  if (Store.addNote(id, noteForm.elements.text.value)) {
    noteForm.reset();
    render();
    openDetails(Store.find(id)); // refresh the open timeline
  }
});

document.getElementById('detailClose').addEventListener('click', () => detailDialog.close());
document.getElementById('detailEdit').addEventListener('click', () => {
  detailDialog.close();
  openForm(Store.find(detailDialog.dataset.id));
});
// Close on backdrop click (click lands on the dialog element but outside its box).
detailDialog.addEventListener('click', (e) => {
  const r = detailDialog.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (e.target === detailDialog && !inside) detailDialog.close();
});

// ---------- Search & filter ----------

const searchInput = document.getElementById('search');
const onlyOverdue = document.getElementById('onlyOverdue');
searchInput.addEventListener('input', () => render());
onlyOverdue.addEventListener('change', () => render());

function isFiltering() {
  return searchInput.value.trim() !== '' || onlyOverdue.checked;
}

// ---------- Render ----------

let renderedForDay = null;

const noticeEl = document.getElementById('notice');
document.getElementById('noticeClose').addEventListener('click', () => {
  Store.dismissNotice();
  noticeEl.hidden = true;
});

function renderNotice() {
  const message = Store.notice();
  noticeEl.hidden = !message;
  noticeEl.querySelector('.notice-text').textContent = message || '';
}

function render() {
  const today = todayYmd();
  renderedForDay = today;
  renderNotice();
  renderSummary(today);
  const all = Store.all();
  const filtering = isFiltering();

  // Newest arrivals in a column first.
  const customers = [...all]
    .filter((c) => matchesSearch(c, searchInput.value))
    .filter((c) => !onlyOverdue.checked || followUpState(c, today) === 'overdue')
    .sort((a, b) => enteredStatusAt(b).localeCompare(enteredStatusAt(a)));

  for (const col of board.querySelectorAll('.column')) {
    const status = col.dataset.status;
    const inCol = customers.filter((c) => c.status === status);
    const totalInCol = all.filter((c) => c.status === status).length;
    // While filtering, show "visible of total" so the count isn't mistaken for the real total.
    const countText = filtering
      ? `${toFaDigits(inCol.length)} از ${toFaDigits(totalInCol)}`
      : toFaDigits(inCol.length);
    col.querySelector('.count').textContent = countText;
    tabs.querySelector(`[data-status="${status}"] .count`).textContent = countText;
    const body = col.querySelector('.column-body');
    body.replaceChildren(...inCol.map((c) => renderCard(c, today)));
    if (!inCol.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (filtering) empty.textContent = 'نتیجه‌ای نیست';
      else if (!all.length && status === 'new') empty.textContent = 'هنوز مشتری‌ای ثبت نشده؛ با «+ مشتری جدید» شروع کنید.';
      else empty.textContent = 'مشتری‌ای نیست';
      body.append(empty);
    }
  }
  updateTabs();
}

// Re-render after midnight so "today"/"overdue" flags stay correct on a page left open.
setInterval(() => {
  if (todayYmd() !== renderedForDay) render();
}, 60000);

// ---------- Drag & drop ----------

function attachDropTarget(col) {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drop-target');
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target');
  });
  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('drop-target');
    const id = e.dataTransfer.getData('text/plain');
    if (Store.move(id, col.dataset.status)) render();
  });
}

// ---------- Form ----------

const sourceSelect = form.elements.source;
for (const s of SOURCES) sourceSelect.append(new Option(s.label, s.id));

function setError(field, message) {
  form.elements[field].classList.toggle('invalid', !!message);
  form.querySelector(`[data-error-for="${field}"]`).textContent = message || '';
}

function openForm(customer) {
  form.reset();
  setError('name', '');
  setError('phone', '');
  document.getElementById('formTitle').textContent = customer ? 'ویرایش مشتری' : 'مشتری جدید';
  const f = form.elements;
  f.id.value = customer ? customer.id : '';
  if (customer) {
    f.name.value = customer.name;
    f.phone.value = toFaDigits(customer.phone);
    f.car.value = customer.car || '';
    f.budget.value = customer.budget == null ? '' : formatNumber(customer.budget);
    f.source.value = customer.source;
    f.followUp.value = customer.followUp || '';
  }
  updateFollowUpHint();
  dialog.showModal();
  f.name.focus();
}

// Re-format budget with thousands separators while typing, keeping the caret
// after the same number of digits (otherwise it jumps to the end on every keystroke).
form.elements.budget.addEventListener('input', (e) => {
  const input = e.target;
  const digitsBeforeCaret = toLatinDigits(input.value.slice(0, input.selectionStart)).replace(/\D/g, '').length;
  const n = parseBudget(input.value);
  input.value = n == null ? '' : formatNumber(n);
  let pos = 0;
  for (let seen = 0; pos < input.value.length && seen < digitsBeforeCaret; pos++) {
    if (/\d/.test(toLatinDigits(input.value[pos]))) seen++;
  }
  input.setSelectionRange(pos, pos);
});

// The native picker shows the browser's calendar; show the Jalali date next to it.
function updateFollowUpHint() {
  const v = form.elements.followUp.value;
  document.getElementById('followUpHint').textContent = v ? 'شمسی: ' + formatYmd(v) : '';
}
form.elements.followUp.addEventListener('input', updateFollowUpHint);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = form.elements;
  const name = f.name.value.trim().slice(0, f.name.maxLength);
  const phone = normalizePhone(f.phone.value);

  const duplicate = phone && Store.findByPhone(phone, f.id.value);

  setError('name', name.length >= 2 ? '' : 'نام را وارد کنید (حداقل ۲ حرف).');
  setError('phone', !phone ? 'شماره موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).'
    : duplicate ? `این شماره قبلاً برای «${duplicate.name}» ثبت شده است.` : '');
  if (name.length < 2) return f.name.focus();
  if (!phone || duplicate) return f.phone.focus();

  const fields = {
    name,
    phone,
    car: f.car.value.trim().slice(0, f.car.maxLength),
    budget: parseBudget(f.budget.value),
    source: f.source.value,
    followUp: f.followUp.value || null,
  };
  if (f.id.value) Store.update(f.id.value, fields);
  else Store.create(fields);

  dialog.close();
  render();
});

document.getElementById('cancelBtn').addEventListener('click', () => dialog.close());
document.getElementById('addBtn').addEventListener('click', () => openForm(null));
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('همه‌ی داده‌های فعلی پاک و داده‌ی نمونه جایگزین شود؟')) {
    Store.resetSample();
    render();
  }
});

buildBoard();
render();
