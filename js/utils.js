// ثابت‌ها و توابع کمکی مشترک. اول از همه بار می‌شود و بقیه‌ی فایل‌ها از این‌ها استفاده می‌کنند.

// ترتیب ستون‌ها همین ترتیب آرایه است.
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

// ارقام فارسی (۰-۹) و عربی (٠-٩) ← انگلیسی؛ برای اعتبارسنجی و جستجو.
function toLatinDigits(str) {
  return String(str)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
}

function toFaDigits(value) {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

// شماره‌ی موبایل ایران را به شکل "09xxxxxxxxx" برمی‌گرداند، یا null اگر معتبر نباشد.
// ارقام فارسی، فاصله، خط تیره و پیشوند +98 / 0098 / 98 پذیرفته می‌شوند.
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

// بودجه: فقط رقم‌ها خوانده می‌شوند؛ خالی ← null. حداکثر ۱۵ رقم تا عدد در Number دقیق بماند
// (Number.MAX_SAFE_INTEGER شانزده رقم دارد).
const BUDGET_MAX_DIGITS = 15;

function parseBudget(input) {
  const digits = toLatinDigits(input).replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, BUDGET_MAX_DIGITS);
  return digits ? Number(digits) : null;
}

function formatNumber(n) {
  return n.toLocaleString('fa-IR');
}

function formatBudget(n) {
  return n == null ? '—' : formatNumber(n) + ' تومان';
}

// تاریخ شمسی فقط با Intl، بدون کتابخانه.
const dateFmt = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// "۱۴۰۵/۰۸/۰۲". از اجزا ساخته می‌شود تا جداکننده به مرورگر وابسته نباشد.
function jalaliDate(d) {
  const p = Object.fromEntries(dateFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day}`;
}

// "۱۴۰۵/۰۸/۰۲ ساعت ۱۰:۳۰"
function formatDateTime(iso) {
  const d = new Date(iso);
  return `${jalaliDate(d)} ساعت ${timeFmt.format(d)}`;
}

// تاریخ محلی به شکل "YYYY-MM-DD" (همان مقدار <input type="date">).
function toYmd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayYmd() {
  return toYmd(new Date());
}

// "2026-10-27" ← "۱۴۰۵/۰۸/۰۵". به‌عنوان تاریخ محلی خوانده می‌شود، نه UTC.
function formatYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return jalaliDate(new Date(y, m - 1, d));
}

function uid() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
