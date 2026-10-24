// Run with: node tests/stats.test.js
// Loads the browser scripts into one shared context, the same way <script> tags share globals.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ Intl });
for (const file of ['utils.js', 'stats.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), ctx, { filename: file });
}
const { avgDaysToPurchase, computeStats, formatAvgDays, formatRate, NO_DATA, followUpState, matchesSearch } =
  vm.runInContext('({ avgDaysToPurchase, computeStats, formatAvgDays, formatRate, NO_DATA, followUpState, matchesSearch })', ctx);

const STATUS_IDS = ['new', 'contacted', 'test_drive', 'purchased', 'cancelled'];
const T0 = Date.parse('2026-10-01T10:00:00Z');
const day = (n) => new Date(T0 + n * 86400000).toISOString();

// Builds a customer from [status, dayOffset] steps; the first step is the creation in "new".
function customer(...steps) {
  const history = [{ type: 'created', to: 'new', at: day(steps[0][1]) }];
  for (const [to, d] of steps.slice(1)) {
    history.push({ type: 'moved', from: history.at(-1).to, to, at: day(d) });
  }
  return { status: history.at(-1).to, history };
}

function testAverage() {
  const cases = [
    {
      name: 'no purchases -> null / "هنوز داده‌ای نیست"',
      data: [customer(['new', 0]), customer(['new', 0], ['contacted', 2])],
      expected: null,
    },
    {
      name: 'single purchase after 10 days',
      data: [customer(['new', 0], ['contacted', 1], ['test_drive', 4], ['purchased', 10])],
      expected: 10,
    },
    {
      name: 'average of 10 and 5, non-purchased customers ignored',
      data: [
        customer(['new', 0], ['purchased', 10]),
        customer(['new', 2], ['contacted', 3], ['purchased', 7]),
        customer(['new', 0], ['contacted', 30]),
        customer(['new', 0], ['cancelled', 40]),
      ],
      expected: 7.5,
    },
    {
      name: 'left purchase and bought again -> last entry counts (12, not 3)',
      data: [customer(['new', 0], ['purchased', 3], ['test_drive', 5], ['purchased', 12])],
      expected: 12,
    },
    {
      name: 'purchased then cancelled -> excluded',
      data: [
        customer(['new', 0], ['purchased', 4], ['cancelled', 6]),
        customer(['new', 0], ['purchased', 8]),
      ],
      expected: 8,
    },
    {
      name: 'fractional days (36 hours = 1.5)',
      data: [{ status: 'purchased', history: [
        { type: 'created', to: 'new', at: '2026-10-01T08:00:00Z' },
        { type: 'moved', from: 'new', to: 'purchased', at: '2026-10-02T20:00:00Z' },
      ] }],
      expected: 1.5,
    },
  ];

  const checks = cases.map((c) => {
    const got = avgDaysToPurchase(c.data);
    const ok = c.expected === null ? got === null : Math.abs(got - c.expected) < 1e-9;
    return { name: c.name, ok, detail: `expected ${c.expected}, got ${got}` };
  });

  // Summary + Persian formatting
  const s = computeStats(cases[2].data, STATUS_IDS);
  checks.push(
    { name: 'counts per status', ok: s.total === 4 && s.byStatus.purchased === 2 && s.byStatus.contacted === 1 && s.byStatus.cancelled === 1 && s.byStatus.new === 0, detail: JSON.stringify(s.byStatus) },
    { name: 'conversion rate 2/4 = ۵۰٪', ok: formatRate(s.conversionRate) === '۵۰٪', detail: formatRate(s.conversionRate) },
    { name: 'avg formatted "۷٫۵ روز"', ok: formatAvgDays(s.avgDays) === '۷٫۵ روز', detail: formatAvgDays(s.avgDays) },
    { name: 'avg rounds to one decimal "۱۴٫۳ روز"', ok: formatAvgDays(14.3456) === '۱۴٫۳ روز', detail: formatAvgDays(14.3456) },
    { name: 'no data text', ok: formatAvgDays(null) === NO_DATA && formatRate(computeStats([], STATUS_IDS).conversionRate) === NO_DATA, detail: formatAvgDays(null) },
  );

  return checks;
}

function testFollowUpAndSearch() {
  const today = '2026-10-24';
  const fu = (status, followUp) => ({
    ...customer(['new', 0], ...(status === 'new' ? [] : [[status, 1]])),
    followUp,
  });
  const checks = [
    ['yesterday, open -> overdue', followUpState(fu('contacted', '2026-10-23'), today), 'overdue'],
    ['last year, open -> overdue', followUpState(fu('new', '2025-12-31'), today), 'overdue'],
    ['today -> today', followUpState(fu('test_drive', '2026-10-24'), today), 'today'],
    ['tomorrow -> nothing', followUpState(fu('new', '2026-10-25'), today), null],
    ['no date -> nothing', followUpState(fu('new', null), today), null],
    ['purchased + past -> not overdue', followUpState(fu('purchased', '2026-10-01'), today), null],
    ['cancelled + past -> not overdue', followUpState(fu('cancelled', '2026-10-01'), today), null],
    ['purchased + today -> no flag', followUpState(fu('purchased', today), today), null],
  ].map(([name, got, expected]) => ({ name, ok: got === expected, detail: `expected ${expected}, got ${got}` }));

  const s = computeStats([
    fu('new', '2026-10-20'), fu('contacted', '2026-10-23'), fu('test_drive', today),
    fu('purchased', '2026-10-01'), fu('cancelled', '2026-10-01'), fu('new', null),
  ], STATUS_IDS, today);
  checks.push({ name: 'overdue count = 2 (closed excluded)', ok: s.overdue === 2, detail: `got ${s.overdue}` });

  const c = { name: 'مریم احمدی', phone: '09351112233' };
  const search = [
    ['empty query matches all', '', true],
    ['part of name', 'مریم', true],
    ['Arabic ي in query', 'مريم', true],
    ['extra spaces', ' مریم   احمدی ', true],
    ['ZWNJ instead of space', 'مریم‌احمدی', true],
    ['Latin digits', '0935111', true],
    ['Persian digits', '۰۹۳۵۱۱۱', true],
    ['Arabic-Indic digits', '٠٩٣٥', true],
    ['digits with spaces/dashes', '۰۹۳۵ ۱۱۱-۲۲', true],
    ['middle of number', '2233', true],
    ['+98 prefix', '+98 935 111', true],
    ['0098 prefix', '0098935', true],
    ['wrong number', '0912', false],
    ['wrong name', 'علی', false],
    ['letters + digits mix not treated as phone', 'a0935', false],
  ].map(([name, q, expected]) => {
    const got = matchesSearch(c, q);
    return { name: `search: ${name} (${JSON.stringify(q)})`, ok: got === expected, detail: `expected ${expected}, got ${got}` };
  });
  return checks.concat(search);
}

function report(checks) {
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  -> ' + c.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} of ${checks.length} FAILED` : `\nall ${checks.length} passed`);
  return failed === 0;
}

process.exitCode = report([...testAverage(), ...testFollowUpAndSearch()]) ? 0 : 1;
