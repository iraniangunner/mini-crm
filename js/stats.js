// Pure summary calculations (no DOM). Also loadable from Node for tests.

const NO_DATA = 'هنوز داده‌ای نیست';

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

function computeStats(customers, statusIds) {
  const byStatus = Object.fromEntries(statusIds.map((id) => [id, 0]));
  for (const c of customers) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const total = customers.length;
  return {
    total,
    byStatus,
    conversionRate: total ? (byStatus.purchased || 0) / total : null,
    avgDays: avgDaysToPurchase(customers),
  };
}

const oneDecimalFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

function formatAvgDays(avg) {
  return avg == null ? NO_DATA : oneDecimalFa.format(avg) + ' روز';
}

function formatRate(rate) {
  return rate == null ? NO_DATA : oneDecimalFa.format(rate * 100) + '٪';
}

if (typeof module !== 'undefined') {
  module.exports = { avgDaysToPurchase, computeStats, formatAvgDays, formatRate, NO_DATA };
}
