// Layer 2 of the no-horizontal-scroll rule: an overflow tracker, active only with ?debug=1.
// Re-checks after every DOM change (dialog opened, tab switched, card added, ...) and on
// resize. Two kinds of offender get a red outline and a console entry:
//   1. anything (element or text) sticking out past the viewport's left/right edge;
//   2. any element whose content is wider than itself (scrollWidth > clientWidth), i.e. a
//      horizontal scrollbar, clipped content or content spilling out of its box.
// A corner badge shows green (clean) or red (count).
// It measures element boxes, not scrollWidth, so it still sees overflow that the
// overflow-x: clip safety net on html/body would hide.

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

  // Lives on <html>, outside the observed <body>, so updating it can't retrigger a scan.
  const badge = document.createElement('div');
  badge.id = 'debug-overflow-badge';
  badge.title = 'Overflow tracker (?debug=1). Click to log again.';
  document.documentElement.append(badge);

  // Clipping ancestors, except html/body: their clip is the safety net we want to see past.
  // Returns the horizontal extent of rect r (belonging to el or to text inside it) as
  // actually visible on screen.
  function visibleExtent(r, el) {
    let left = r.left;
    let right = r.right;
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p === el && el.nodeType === 1 && r.isElementBox) continue; // an element doesn't clip its own box
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

  // Returns [{ el, name, left, right }] for the outermost elements past the viewport.
  // left/right = pixels sticking out on that side. Checks element boxes AND text: a long
  // word spilling out of its box doesn't change the box's rect, but it does scroll the page.
  function scan() {
    const vw = document.documentElement.clientWidth; // excludes the vertical scrollbar
    const found = new Map(); // el -> { left, right, text }
    const add = (el, rect, isText) => {
      const { left, right } = visibleExtent(rect, el);
      if (right <= left) return; // fully clipped by an inner scroller (e.g. the board)
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
    const outside = list.filter((f) => !found.has(f.el.parentElement)); // outermost only

    // Containers whose content is wider than themselves, even if still on screen: a
    // horizontal scrollbar (overflow auto/scroll), silently cut content (hidden/clip,
    // including the html/body safety net), or content spilling out (visible).
    // Skipped: single-line <input>/<select>, which by design scroll their own text.
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
    observer.disconnect(); // our own class changes must not trigger another scan
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
      console.info('[overflow] OK: nothing past the viewport at width', document.documentElement.clientWidth);
    } else {
      console.group(`[overflow] ${offenders.length} element(s) past the viewport at width ${document.documentElement.clientWidth}`);
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
  document.addEventListener('toggle', schedule, true); // <details> and popovers
  badge.addEventListener('click', () => report(true));

  // For tests and the console: __overflowDebug.scan() -> current offenders.
  window.__overflowDebug = { scan: () => report(true).map(({ name, left, right, excess }) => ({ name, left, right, excess })) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
})();
