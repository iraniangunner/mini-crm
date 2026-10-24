// Shared constants and helpers. Loaded first; exposes globals for the other scripts.

const STATUSES = [
  { id: 'new', label: 'جدید' },
  { id: 'contacted', label: 'تماس گرفته شد' },
  { id: 'test_drive', label: 'تست‌درایو' },
  { id: 'purchased', label: 'خرید' },
  { id: 'cancelled', label: 'انصراف' },
];

const SOURCES = [
  { id: 'instagram', label: 'اینستاگرام' },
  { id: 'divar', label: 'دیوار' },
  { id: 'referral', label: 'معرفی' },
  { id: 'walk_in', label: 'مراجعه‌ی حضوری' },
  { id: 'other', label: 'سایر' },
];

const DAY_MS = 86400000;

function labelOf(list, id) {
  const item = list.find((x) => x.id === id);
  return item ? item.label : id;
}

// Persian (۰-۹) and Arabic (٠-٩) digits -> Latin.
function toLatinDigits(str) {
  return String(str)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
}

function toFaDigits(value) {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

// Returns "09xxxxxxxxx" or null when the input is not a valid Iranian mobile number.
function normalizePhone(input) {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

function formatPhone(phone) {
  return toFaDigits(phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'));
}

// Digits-only parse of a budget field; null when empty.
function parseBudget(input) {
  const digits = toLatinDigits(input).replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function formatNumber(n) {
  return n.toLocaleString('fa-IR');
}

function formatBudget(n) {
  return n == null ? '—' : formatNumber(n) + ' تومان';
}

const dateFmt = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// "۱۴۰۵/۰۸/۰۲ ساعت ۱۰:۳۰" (Jalali). Built from parts so separators don't depend on the browser.
function formatDateTime(iso) {
  const d = new Date(iso);
  const p = Object.fromEntries(dateFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day} ساعت ${timeFmt.format(d)}`;
}

function uid() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
