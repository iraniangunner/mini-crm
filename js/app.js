// رابط کاربری: ساخت برد، رندر و رویدادها. هر تغییر داده فقط از Store می‌گذرد و بعد
// render() کل برد را از نو می‌کشد.

const board = document.getElementById('board');
const tabs = document.getElementById('tabs');
const cardTemplate = document.getElementById('cardTemplate');
const dialog = document.getElementById('customerDialog');
const form = document.getElementById('customerForm');

// باید با breakpoint نمای تبی در styles.css یکی باشد.
const tabbedQuery = window.matchMedia('(max-width: 1199.98px)');

// تب فعال در همین مرورگر به خاطر سپرده می‌شود؛ فقط یک راحتی است، پس خطای ذخیره نادیده گرفته می‌شود.
const ACTIVE_TAB_KEY = 'miniCrm.activeTab';
let activeStatus = 'new';
try {
  const saved = localStorage.getItem(ACTIVE_TAB_KEY);
  if (STATUSES.some((s) => s.id === saved)) activeStatus = saved;
} catch (e) { /* نادیده */ }

// ---------- برد، ستون‌ها و تب‌ها ----------

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
    attachDropTarget(tab); // رها کردن کارت روی تب هم آن را منتقل می‌کند

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

function setActiveTab(status) {
  activeStatus = status;
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, status);
  } catch (e) { /* نادیده */ }
  updateTabs();
}

// در نمای تبی فقط ستون فعال دیده می‌شود (با CSS)؛ در نمای ستونی کلاس active اثری ندارد.
function updateTabs() {
  for (const tab of tabs.children) {
    const on = tab.dataset.status === activeStatus;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  for (const col of board.children) col.classList.toggle('active', col.dataset.status === activeStatus);
}

// ---------- پیام کوتاه پایین صفحه ----------

const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

// ---------- جابه‌جایی ----------

// هر دو راه جابه‌جایی (منو و کشیدن) از این‌جا می‌گذرند؛ ثبت در تاریخچه با Store.move است.
function moveTo(id, to) {
  if (!Store.move(id, to)) return;
  render();
  // در نمای تبی کارت از تب فعلی بیرون می‌رود؛ پس می‌گوییم کجا رفت.
  if (tabbedQuery.matches) showToast(`«${Store.find(id).name}» به «${labelOf(STATUSES, to)}» منتقل شد.`);
}

function attachDropTarget(target) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    target.classList.add('drop-target');
  });
  target.addEventListener('dragleave', (e) => {
    if (!target.contains(e.relatedTarget)) target.classList.remove('drop-target');
  });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    target.classList.remove('drop-target');
    moveTo(e.dataTransfer.getData('text/plain'), target.dataset.status);
  });
}

// ---------- کارت ----------

const FOLLOW_UP_FLAGS = { overdue: 'عقب‌افتاده', today: 'امروز' };

// زمان ورود به ستون فعلی (یادداشت‌ها حساب نمی‌شوند).
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

  // متن کاربر فقط با textContent نوشته می‌شود، نه innerHTML.
  card.querySelector('.card-name').textContent = c.name;
  card.querySelector('.card-phone').textContent = formatPhone(c.phone);
  card.querySelector('.card-car').textContent = c.car || '—';
  card.querySelector('.card-budget').textContent = formatBudget(c.budget);
  card.querySelector('.card-source').textContent = labelOf(SOURCES, c.source);
  card.querySelector('.card-since').textContent = 'در این مرحله از ' + formatDateTime(enteredStatusAt(c));

  // کلیک روی خود کارت (نه دکمه‌ها و منو) پنجره‌ی جزئیات را باز می‌کند.
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
    if (select.value) moveTo(c.id, select.value);
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

// ---------- نوار خلاصه ----------

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

// ---------- پنجره‌ی جزئیات و تایم‌لاین ----------

const detailDialog = document.getElementById('detailDialog');
const noteForm = document.getElementById('noteForm');

// «از جدید به تماس گرفته شد — ۱۴۰۵/۰۸/۰۲ ساعت ۱۰:۳۰»
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
    if (k === 'موبایل') dd.dir = 'ltr'; // تا «۰۹۱۲ ۷۷۷ ۸۸۹۹» در متن راست‌چین جابه‌جا نشود
    return [dt, dd];
  }));

  // جدیدترین رکورد بالا.
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

noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = detailDialog.dataset.id;
  if (Store.addNote(id, noteForm.elements.text.value)) {
    noteForm.reset();
    render();
    openDetails(Store.find(id)); // تایم‌لاینِ پنجره‌ی باز به‌روز شود
  }
});

document.getElementById('detailClose').addEventListener('click', () => detailDialog.close());
document.getElementById('detailEdit').addEventListener('click', () => {
  detailDialog.close();
  openForm(Store.find(detailDialog.dataset.id));
});
// کلیک روی پس‌زمینه (بیرون از کادر پنجره) آن را می‌بندد.
detailDialog.addEventListener('click', (e) => {
  const r = detailDialog.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (e.target === detailDialog && !inside) detailDialog.close();
});

// ---------- جستجو و فیلتر ----------

const searchInput = document.getElementById('search');
const onlyOverdue = document.getElementById('onlyOverdue');
searchInput.addEventListener('input', () => render());
onlyOverdue.addEventListener('change', () => render());

function isFiltering() {
  return searchInput.value.trim() !== '' || onlyOverdue.checked;
}

// ---------- رندر ----------

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

  // در هر ستون، تازه‌ترین ورود بالا.
  const customers = [...all]
    .filter((c) => matchesSearch(c, searchInput.value))
    .filter((c) => !onlyOverdue.checked || followUpState(c, today) === 'overdue')
    .sort((a, b) => enteredStatusAt(b).localeCompare(enteredStatusAt(a)));

  for (const col of board.querySelectorAll('.column')) {
    const status = col.dataset.status;
    const inCol = customers.filter((c) => c.status === status);
    const totalInCol = all.filter((c) => c.status === status).length;
    // هنگام فیلتر «۲ از ۵» تا تعداد دیده‌شده با تعداد واقعی اشتباه نشود.
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

// اگر صفحه از نیمه‌شب گذشت و باز ماند، برچسب‌های «امروز» و «عقب‌افتاده» به‌روز شوند.
setInterval(() => {
  if (todayYmd() !== renderedForDay) render();
}, 60000);

// ---------- فرم افزودن/ویرایش ----------

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

// بودجه هنگام تایپ با جداکننده‌ی سه‌رقمی و ارقام فارسی بازنویسی می‌شود؛ مکان‌نما بعد از همان
// تعداد رقم می‌ماند (وگرنه با هر کلید به آخر می‌پرد).
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

// انتخابگر تاریخ مال مرورگر است و تقویم میلادی نشان می‌دهد؛ معادل شمسی زیرش نوشته می‌شود.
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

  // اعتبارسنجی: نام (حداقل ۲ حرف) و موبایل معتبر اجباری‌اند؛ شماره‌ی تکراری پذیرفته نمی‌شود.
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
