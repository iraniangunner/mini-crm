// لایه‌ی ۲ قانون «هیچ اسکرول افقی»: ردیاب سرریز، فقط با ‎?debug=1 فعال می‌شود و در حالت عادی
// هیچ کاری نمی‌کند (حتی استایل یا المانی اضافه نمی‌کند).
// بعد از هر تغییر DOM (باز شدن پنجره، عوض شدن تب، اضافه شدن کارت...) و تغییر اندازه دوباره
// بررسی می‌کند. دو نوع مشکل کادر قرمز می‌گیرند و در Console نوشته می‌شوند:
//   ۱. هر المان یا متنی که از لبه‌ی چپ/راست صفحه بیرون زده؛
//   ۲. هر المانی که محتوایش از خودش پهن‌تر است (scrollWidth > clientWidth): اسکرول‌بار افقی،
//      محتوای بریده‌شده یا محتوای بیرون‌ریخته. html و body هم بررسی می‌شوند، پس سرریزی که
//      تور ایمنی (overflow-x: clip) پنهانش کرده هم دیده می‌شود.
// نشانگر گوشه: سبز = سالم، قرمز = تعداد مشکل‌ها.

(() => {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;

  const MARK = 'debug-overflow-offender';
  const style = document.createElement('style');
  style.textContent = `
    .${MARK} { outline: 2px solid #dc2626 !important; outline-offset: -2px !important; }
    #debug-overflow-badge {
      position: fixed; inset-block-end: 8px; inset-inline-end: 8px; z-index: 2147483647;
      padding: 2px 10px; border-radius: 999px; font: bold 12px/1.8 Tahoma, sans-serif;
      color: #fff; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.3); }`;
  document.head.append(style);

  // نشانگر روی <html> است، بیرون از <body>ِ زیر نظر، تا به‌روز کردنش بررسی تازه راه نیندازد.
  const badge = document.createElement('div');
  badge.id = 'debug-overflow-badge';
  badge.title = 'ردیاب سرریز (?debug=1). برای گزارش دوباره در Console کلیک کنید.';
  document.documentElement.append(badge);

  // بخشی از مستطیل r (مال el یا متن داخلش) که واقعاً روی صفحه دیده می‌شود، با حساب کردن
  // والدهایی که محتوا را می‌بُرند؛ به‌جز html/body که clipشان همان تور ایمنی است و باید از آن رد شویم.
  function visibleExtent(r, el) {
    let left = r.left;
    let right = r.right;
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p === el && el.nodeType === 1 && r.isElementBox) continue; // المان کادر خودش را نمی‌بُرد
      if (getComputedStyle(p).overflowX !== 'visible') {
        const pr = p.getBoundingClientRect();
        left = Math.max(left, pr.left);
        right = Math.min(right, pr.right);
      }
    }
    return { left, right };
  }

  function describe(el) {
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).filter((c) => c !== MARK).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  }

  // [{ el, name, left, right, excess }]. left/right = چند پیکسل از آن طرف بیرون زده.
  // هم کادر المان‌ها و هم خود متن اندازه گرفته می‌شود: کلمه‌ی بلندی که از کادرش بیرون می‌ریزد
  // کادر را تغییر نمی‌دهد ولی صفحه را اسکرولی می‌کند.
  function scan() {
    const vw = document.documentElement.clientWidth; // بدون اسکرول‌بار عمودی
    const found = new Map(); // el -> { left, right, text }
    const add = (el, rect, isText) => {
      const { left, right } = visibleExtent(rect, el);
      if (right <= left) return; // کاملاً توسط یک والد بریده شده
      const outLeft = Math.max(0, -left);
      const outRight = Math.max(0, right - vw);
      if (outLeft <= 0.5 && outRight <= 0.5) return;
      const prev = found.get(el) || { left: 0, right: 0, text: false };
      found.set(el, { left: Math.max(prev.left, outLeft), right: Math.max(prev.right, outRight), text: prev.text || isText });
    };
    const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';

    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('template, script, style') || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      add(el, { left: r.left, right: r.right, isElementBox: true }, false);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.data.trim() && !n.parentElement.closest('template, script, style') && visible(n.parentElement)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width) add(n.parentElement, r, true);
    }

    const list = [...found].map(([el, f]) => ({ el, name: describe(el) + (f.text ? ' (text)' : ''), left: Math.round(f.left), right: Math.round(f.right) }));
    const outside = list.filter((f) => !found.has(f.el.parentElement)); // فقط بیرونی‌ترین

    // ظرف‌هایی که محتوایشان از خودشان پهن‌تر است، حتی اگر هنوز داخل صفحه باشند.
    // استثنا: <input>/<select> تک‌خطی که متن خودشان را ذاتاً داخل خودشان اسکرول می‌کنند.
    const wider = [];
    for (const el of [document.documentElement, document.body, ...document.body.querySelectorAll('*')]) {
      if (el.matches('input, select, template, script, style') || !el.clientWidth || !visible(el)) continue;
      const excess = el.scrollWidth - el.clientWidth;
      if (excess < 1) continue;
      const ox = getComputedStyle(el).overflowX;
      const kind = ox === 'auto' || ox === 'scroll' ? 'scrolls' : ox === 'visible' ? 'spills out' : 'clipped';
      wider.push({ el, name: `${describe(el)} [content ${excess}px wider, ${kind}]`, left: 0, right: 0, excess });
    }
    return [...outside, ...wider];
  }

  let lastSignature = null;

  function report(force) {
    const offenders = scan();
    observer.disconnect(); // تغییر کلاس‌های خودمان نباید بررسی تازه راه بیندازد
    for (const el of document.querySelectorAll('.' + MARK)) el.classList.remove(MARK);
    for (const o of offenders) o.el.classList.add(MARK);
    observer.takeRecords();
    observe();

    badge.textContent = offenders.length ? `✗ سرریز: ${offenders.length.toLocaleString('fa-IR')}` : '✓ بدون سرریز';
    badge.style.background = offenders.length ? '#dc2626' : '#16a34a';

    const signature = offenders.map((o) => `${o.name}:${o.left}:${o.right}`).join('|');
    if (signature === lastSignature && !force) return offenders;
    lastSignature = signature;
    if (!offenders.length) {
      console.info('[overflow] OK: no horizontal overflow at width', document.documentElement.clientWidth);
    } else {
      console.group(`[overflow] ${offenders.length} horizontal overflow problem(s) at width ${document.documentElement.clientWidth}`);
      for (const o of offenders) {
        const sides = o.excess ? `${o.excess}px wider than its box`
          : [o.left && `left +${o.left}px`, o.right && `right +${o.right}px`].filter(Boolean).join(', ');
        console.warn(`${o.name} — ${sides}`, o.el);
      }
      console.groupEnd();
    }
    return offenders;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; report(false); });
  }

  const observer = new MutationObserver(schedule);
  function observe() {
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden', 'dir'],
    });
  }
  observe();
  window.addEventListener('resize', schedule);
  document.addEventListener('transitionend', schedule, true);
  document.addEventListener('toggle', schedule, true); // <details> و popover
  badge.addEventListener('click', () => report(true));

  // برای تست‌ها و Console: __overflowDebug.scan() ← فهرست فعلی مشکل‌ها.
  window.__overflowDebug = { scan: () => report(true).map(({ name, left, right, excess }) => ({ name, left, right, excess })) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
})();
