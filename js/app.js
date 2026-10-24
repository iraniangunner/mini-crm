// Rendering and UI events. All data changes go through Store, then render() redraws the board.

const board = document.getElementById('board');
const cardTemplate = document.getElementById('cardTemplate');
const dialog = document.getElementById('customerDialog');
const form = document.getElementById('customerForm');

// ---------- Board ----------

function buildBoard() {
  for (const s of STATUSES) {
    const col = document.createElement('section');
    col.className = 'column';
    col.dataset.status = s.id;
    col.style.setProperty('--col-color', `var(--col-${s.id})`);

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

// Date the customer entered their current column.
function enteredStatusAt(c) {
  return c.history[c.history.length - 1].at;
}

function renderCard(c) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.id = c.id;
  card.querySelector('.card-name').textContent = c.name;
  card.querySelector('.card-phone').textContent = formatPhone(c.phone);
  card.querySelector('.card-car').textContent = c.car || '—';
  card.querySelector('.card-budget').textContent = formatBudget(c.budget);
  card.querySelector('.card-source').textContent = labelOf(SOURCES, c.source);
  card.querySelector('.card-since').textContent = 'در این مرحله از ' + formatDateTime(enteredStatusAt(c));

  const list = card.querySelector('.card-history ol');
  for (const h of c.history) {
    const li = document.createElement('li');
    li.textContent = h.type === 'created'
      ? `ثبت مشتری — ${formatDateTime(h.at)}`
      : `${labelOf(STATUSES, h.from)} ← ${labelOf(STATUSES, h.to)} — ${formatDateTime(h.at)}`;
    list.append(li);
  }
  card.querySelector('.card-history summary').textContent = `تاریخچه (${toFaDigits(c.history.length)})`;

  const select = card.querySelector('.move-select');
  select.append(new Option('انتقال به...', '', true, true));
  for (const s of STATUSES) {
    if (s.id !== c.status) select.append(new Option(s.label, s.id));
  }
  select.addEventListener('change', () => {
    if (select.value && Store.move(c.id, select.value)) render();
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

function render() {
  // Newest arrivals in a column first.
  const customers = [...Store.all()].sort((a, b) => enteredStatusAt(b).localeCompare(enteredStatusAt(a)));

  for (const col of board.querySelectorAll('.column')) {
    const inCol = customers.filter((c) => c.status === col.dataset.status);
    col.querySelector('.count').textContent = toFaDigits(inCol.length);
    const body = col.querySelector('.column-body');
    body.replaceChildren(...inCol.map(renderCard));
    if (!inCol.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'مشتری‌ای نیست';
      body.append(empty);
    }
  }
}

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
    f.car.value = customer.car;
    f.budget.value = customer.budget == null ? '' : formatNumber(customer.budget);
    f.source.value = customer.source;
  }
  dialog.showModal();
  f.name.focus();
}

// Re-format budget with thousands separators while typing.
form.elements.budget.addEventListener('input', (e) => {
  const n = parseBudget(e.target.value);
  e.target.value = n == null ? '' : formatNumber(n);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = form.elements;
  const name = f.name.value.trim();
  const phone = normalizePhone(f.phone.value);

  setError('name', name.length >= 2 ? '' : 'نام را وارد کنید (حداقل ۲ حرف).');
  setError('phone', phone ? '' : 'شماره موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).');
  if (name.length < 2) return f.name.focus();
  if (!phone) return f.phone.focus();

  const fields = {
    name,
    phone,
    car: f.car.value.trim(),
    budget: parseBudget(f.budget.value),
    source: f.source.value,
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
