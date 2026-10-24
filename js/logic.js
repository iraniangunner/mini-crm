// منطق خالص برنامه، بدون DOM: خلاصه‌ی بالای صفحه، وضعیت پیگیری، جستجو.
// به utils.js وابسته است. تست‌ها (tests/logic.test.js) همین فایل را در Node اجرا می‌کنند.

const NO_DATA = 'هنوز داده‌ای نیست';
const CLOSED_STATUSES = ['purchased', 'cancelled'];

// میانگین روزهای «جدید» تا «خرید».
// - فقط مشتری‌هایی که الان در «خرید» هستند (کسی که از خرید برگشته حساب نمی‌شود).
// - شروع: رکورد ساخت (history[0])، یعنی ورود به «جدید».
// - پایان: «آخرین» ورود به «خرید»؛ اگر مشتری از خرید برگشت و دوباره خرید شد، ورود آخر ملاک است.
// - روزها با کسر حساب می‌شوند (۳۶ ساعت = ۱٫۵ روز). بدون هیچ خرید: null.
function avgDaysToPurchase(customers) {
  const days = customers
    .filter((c) => c.status === 'purchased')
    .map((c) => {
      const start = Date.parse(c.history[0].at);
      const end = Date.parse(c.history.filter((h) => h.to === 'purchased').at(-1).at);
      return (end - start) / DAY_MS;
    });
  if (!days.length) return null;
  return days.reduce((a, b) => a + b, 0) / days.length;
}

// 'overdue' (عقب‌افتاده) | 'today' (امروز) | null.
// هر دو تاریخ محلی و به شکل "YYYY-MM-DD" هستند، پس مقایسه‌ی رشته‌ای همان ترتیب تاریخ است.
// «خرید» و «انصراف» هیچ‌وقت برچسب نمی‌گیرند.
function followUpState(c, today) {
  if (!c.followUp || CLOSED_STATUSES.includes(c.status)) return null;
  if (c.followUp < today) return 'overdue';
  if (c.followUp === today) return 'today';
  return null;
}

// اعداد نوار خلاصه. همیشه روی کل داده، مستقل از جستجو و فیلتر.
function computeStats(customers, statusIds, today) {
  const byStatus = Object.fromEntries(statusIds.map((id) => [id, 0]));
  for (const c of customers) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const total = customers.length;
  return {
    total,
    byStatus,
    conversionRate: total ? (byStatus.purchased || 0) / total : null,
    avgDays: avgDaysToPurchase(customers),
    overdue: customers.filter((c) => followUpState(c, today) === 'overdue').length,
  };
}

// برای مقایسه‌ی متن: حروف کوچک، ارقام انگلیسی، ي/ك عربی ← ی/ک فارسی، نیم‌فاصله و
// فاصله‌های پشت‌سرهم ← یک فاصله.
function normalizeText(s) {
  return toLatinDigits(s)
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌\s]+/g, ' ')
    .trim();
}

// جستجوی زنده روی نام یا بخشی از شماره. شماره با ارقام فارسی یا انگلیسی، با فاصله/خط تیره،
// یا با پیشوند +98 / 0098 پیدا می‌شود.
function matchesSearch(c, query) {
  const q = normalizeText(query);
  if (!q) return true;
  if (normalizeText(c.name).includes(q)) return true;
  if (!/^[+\d\s\-()]+$/.test(q)) return false;
  let digits = q.replace(/\D/g, '');
  if (/^(\+98|0098)/.test(q)) digits = '0' + digits.replace(/^0{0,2}98/, '');
  return digits.length > 0 && c.phone.includes(digits);
}

const oneDecimalFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

function formatAvgDays(avg) {
  return avg == null ? NO_DATA : oneDecimalFa.format(avg) + ' روز';
}

function formatRate(rate) {
  return rate == null ? NO_DATA : oneDecimalFa.format(rate * 100) + '٪';
}
