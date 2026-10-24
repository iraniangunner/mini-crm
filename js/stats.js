// Pure summary, follow-up and search logic (no DOM). Depends on utils.js (toLatinDigits).

const NO_DATA = 'هنوز داده‌ای نیست';
const CLOSED_STATUSES = ['purchased', 'cancelled'];

// Average days from entering "new" (creation) to the LAST entry into "purchased",
// over customers whose current status is "purchased". null when there are none.
function avgDaysToPurchase(customers) {
  const days = customers
    .filter((c) => c.status === 'purchased')
    .map((c) => {
      const start = Date.parse(c.history[0].at);
      const end = Date.parse(c.history.filter((h) => h.to === 'purchased').at(-1).at);
      return (end - start) / 86400000;
    });
  if (!days.length) return null;
  return days.reduce((a, b) => a + b, 0) / days.length;
}

// 'overdue' | 'today' | null. Both dates are local "YYYY-MM-DD", so string comparison is date order.
// Purchased and cancelled customers are never overdue.
function followUpState(c, today) {
  if (!c.followUp || CLOSED_STATUSES.includes(c.status)) return null;
  if (c.followUp < today) return 'overdue';
  if (c.followUp === today) return 'today';
  return null;
}

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

// Lowercase, Latin digits, Arabic ي/ك -> Persian ی/ک, ZWNJ and runs of spaces -> one space.
function normalizeText(s) {
  return toLatinDigits(s)
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌\s]+/g, ' ')
    .trim();
}

// Live search on name or phone. Phone digits may be typed in Persian or Latin, with spaces/dashes.
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
