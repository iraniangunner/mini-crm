// تنها منبع داده‌ی مشتری‌ها؛ ذخیره در localStorage. هر تغییری فقط از این‌جا انجام می‌شود.

const Store = (() => {
  const KEY = 'miniCrm.v1';
  const BACKUP_KEY = 'miniCrm.v1.backup'; // داده‌ی خراب قبل از جایگزینی این‌جا نگه داشته می‌شود
  const STATUS_IDS = STATUSES.map((s) => s.id);
  const SOURCE_IDS = SOURCES.map((s) => s.id);

  let notice = null; // پیام مشکل بارگذاری/ذخیره برای نمایش در صفحه
  let data = load();

  function isValidEntry(h) {
    if (!h || Number.isNaN(Date.parse(h.at))) return false;
    if (h.type === 'note') return typeof h.text === 'string';
    return (h.type === 'created' || h.type === 'moved') && STATUS_IDS.includes(h.to);
  }

  // مشتری تمیزشده، یا null اگر قابل تعمیر نباشد (بدون شناسه، نام، شماره یا رکورد ساخت).
  // فیلدهای اختیاری ناقص مقدار پیش‌فرض می‌گیرند. وضعیت از تاریخچه بازسازی می‌شود تا
  // هیچ‌وقت با آن ناسازگار نباشد.
  function sanitize(c) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string') return null;
    if (typeof c.name !== 'string' || !c.name.trim() || typeof c.phone !== 'string') return null;
    const history = Array.isArray(c.history) ? c.history.filter(isValidEntry) : [];
    if (!history.length || history[0].type !== 'created') return null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      car: typeof c.car === 'string' ? c.car : '',
      budget: Number.isFinite(c.budget) ? c.budget : null,
      source: SOURCE_IDS.includes(c.source) ? c.source : 'other',
      followUp: /^\d{4}-\d{2}-\d{2}$/.test(c.followUp) ? c.followUp : null,
      status: history.filter((h) => h.to).at(-1).to,
      createdAt: history[0].at,
      history,
    };
  }

  function readRaw() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      notice = 'مرورگر اجازه‌ی ذخیره‌سازی نمی‌دهد؛ تغییرات بعد از بستن صفحه از بین می‌رود.';
      return null;
    }
  }

  function backup(raw) {
    try {
      localStorage.setItem(BACKUP_KEY, raw);
    } catch (e) {
      console.warn('Could not back up unreadable data.', e);
    }
  }

  // بارگذاری امن: localStorage خالی ← داده‌ی نمونه. داده‌ی خراب یا ناشناخته ← داده‌ی نمونه،
  // ولی نسخه‌ی اصلی هیچ‌وقت بی‌صدا پاک نمی‌شود (در BACKUP_KEY می‌ماند) و پیام نشان داده می‌شود.
  function load() {
    const raw = readRaw();
    if (raw == null) {
      const fresh = buildSampleData();
      persist(fresh);
      return fresh;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // پایین‌تر به‌عنوان داده‌ی خراب رسیدگی می‌شود
    }

    if (parsed && parsed.version === 1 && Array.isArray(parsed.customers)) {
      const customers = parsed.customers.map(sanitize).filter(Boolean);
      const loaded = { version: 1, customers };
      const dropped = parsed.customers.length - customers.length;
      if (dropped) {
        backup(raw);
        persist(loaded);
        notice = `${toFaDigits(dropped)} مشتری به‌خاطر داده‌ی ناقص کنار گذاشته شد. نسخه‌ی اصلی به‌عنوان پشتیبان در مرورگر نگه داشته شد.`;
      }
      return loaded;
    }

    backup(raw);
    notice = 'داده‌ی ذخیره‌شده قابل خواندن نبود و داده‌ی نمونه بارگذاری شد. نسخه‌ی اصلی به‌عنوان پشتیبان در مرورگر نگه داشته شد.';
    const fresh = buildSampleData();
    persist(fresh);
    return fresh;
  }

  // خطای ذخیره به کاربر نشان داده می‌شود (notice)؛ در Console فقط هشدار است چون رسیدگی شده.
  function persist(d) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
      return true;
    } catch (e) {
      console.warn('Could not save data.', e);
      notice = 'ذخیره انجام نشد (حافظه‌ی مرورگر پر یا غیرفعال است)؛ تغییرات بعد از بستن صفحه از بین می‌رود.';
      return false;
    }
  }

  function save() {
    persist(data);
  }

  function find(id) {
    return data.customers.find((c) => c.id === id);
  }

  return {
    all() {
      return data.customers;
    },

    find,

    findByPhone(phone, exceptId) {
      return data.customers.find((c) => c.phone === phone && c.id !== exceptId);
    },

    notice() {
      return notice;
    },

    dismissNotice() {
      notice = null;
    },

    // ثبت تاریخچه: ساخت مشتری همیشه اولین رکورد است (ورود به «جدید»).
    create(fields) {
      const now = new Date().toISOString();
      const customer = {
        id: uid(),
        ...fields,
        status: 'new',
        createdAt: now,
        history: [{ type: 'created', to: 'new', at: now }],
      };
      data.customers.push(customer);
      save();
      return customer;
    },

    // ویرایش مشخصات در تاریخچه ثبت نمی‌شود.
    update(id, fields) {
      const c = find(id);
      if (!c) return;
      Object.assign(c, fields);
      save();
    },

    remove(id) {
      data.customers = data.customers.filter((c) => c.id !== id);
      save();
    },

    // ثبت تاریخچه: هر جابه‌جایی یک رکورد «از ← به» با زمان دقیق می‌سازد. کشیدن و منو هر دو
    // فقط همین را صدا می‌زنند. انداختن در همان ستون هیچ رکوردی نمی‌سازد (false برمی‌گرداند).
    move(id, to) {
      const c = find(id);
      if (!c || c.status === to || !STATUS_IDS.includes(to)) return false;
      c.history.push({ type: 'moved', from: c.status, to, at: new Date().toISOString() });
      c.status = to;
      save();
      return true;
    },

    // یادداشت تماس هم در تاریخچه می‌آید ولی وضعیت را عوض نمی‌کند (رکورد note «to» ندارد).
    addNote(id, text) {
      const c = find(id);
      const trimmed = text.trim();
      if (!c || !trimmed) return false;
      c.history.push({ type: 'note', text: trimmed, at: new Date().toISOString() });
      save();
      return true;
    },

    resetSample() {
      data = buildSampleData();
      save();
    },
  };
})();
