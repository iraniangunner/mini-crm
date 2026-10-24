// Ten sample customers. Dates are relative to `now`, so the data always looks recent.
// Purchased customers take 9, 14 and 20 days from creation to purchase (average 14.3).

const SAMPLE_CUSTOMERS = [
  {
    name: 'علی رضایی', phone: '09121234567', car: 'تویوتا کمری', budget: 4500000000, source: 'instagram',
    steps: [[40, 10], ['contacted', 39, 11], ['test_drive', 35, 16], ['purchased', 31, 12]], // 9 days
  },
  {
    name: 'مریم احمدی', phone: '09351112233', car: 'هیوندای توسان', budget: 3200000000, source: 'referral',
    steps: [[33, 9], ['contacted', 32, 14], ['test_drive', 27, 17], ['purchased', 19, 9]], // 14 days
  },
  {
    name: 'رضا کریمی', phone: '09198887766', car: 'کیا اسپورتیج', budget: 2800000000, source: 'divar',
    steps: [[28, 15], ['contacted', 26, 10], ['test_drive', 18, 11], ['purchased', 8, 15]], // 20 days
  },
  {
    name: 'سارا موسوی', phone: '09123456789', car: 'مزدا ۳', budget: 1900000000, source: 'walk_in',
    steps: [[25, 11], ['contacted', 24, 12], ['test_drive', 20, 16], ['contacted', 17, 10], ['test_drive', 6, 18]],
  },
  {
    name: 'حسین نوری', phone: '09367778899', car: 'رنو کولیوس', budget: 2200000000, source: 'instagram',
    steps: [[21, 13], ['contacted', 19, 9], ['test_drive', 12, 17]],
  },
  {
    name: 'زهرا حسینی', phone: '09129990011', car: 'جک S5', budget: 1500000000, source: 'divar',
    steps: [[18, 10], ['contacted', 16, 15]],
  },
  {
    name: 'محمد صادقی', phone: '09141239876', car: 'تویوتا راوفور', budget: 5200000000, source: 'referral',
    steps: [[15, 12], ['contacted', 13, 11]],
  },
  {
    name: 'نگار شریفی', phone: '09381234500', car: 'پژو ۲۰۷', budget: 900000000, source: 'other',
    steps: [[30, 16], ['contacted', 29, 10], ['cancelled', 22, 14]],
  },
  {
    name: 'امیر جعفری', phone: '09124445566', car: 'هیوندای النترا', budget: 2600000000, source: 'walk_in',
    steps: [[4, 17]],
  },
  {
    name: 'فاطمه قاسمی', phone: '09107654321', car: '', budget: null, source: 'instagram',
    steps: [[1, 10]],
  },
];

// Each step is [daysAgo, hour] for creation, then [status, daysAgo, hour] per move.
function buildSampleData(now = new Date()) {
  const at = (daysAgo, hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, (daysAgo * 7 + hour * 13) % 60, 0, 0);
    return d.toISOString();
  };

  const customers = SAMPLE_CUSTOMERS.map((c, i) => {
    const [[createdDaysAgo, createdHour], ...moves] = c.steps;
    const createdAt = at(createdDaysAgo, createdHour);
    const history = [{ type: 'created', to: 'new', at: createdAt }];
    let status = 'new';
    for (const [to, daysAgo, hour] of moves) {
      history.push({ type: 'moved', from: status, to, at: at(daysAgo, hour) });
      status = to;
    }
    return {
      id: 'sample_' + (i + 1),
      name: c.name,
      phone: c.phone,
      car: c.car,
      budget: c.budget,
      source: c.source,
      status,
      createdAt,
      history,
    };
  });

  return { version: 1, customers };
}
