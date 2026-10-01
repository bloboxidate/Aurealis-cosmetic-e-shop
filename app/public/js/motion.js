/* Auréalis motion system — GSAP + ScrollTrigger + SplitText (+ Lenis).
 *
 * Progressive enhancement: every page is complete without this file. It only
 * runs when <html> carries `au-motion` (set in <head> when the visitor has NOT
 * asked for reduced motion) and the libraries loaded. If anything throws, we
 * add `au-fail`, which makes motion.css stop hiding anything.
 *
 * Motion language: long expo ease-outs, no overshoot, slow image settles,
 * light rather than lift. Used sparingly — hero, headlines, section entrances,
 * a little depth on large imagery. Task pages (cart, checkout, auth) stay calm.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger || !root.classList.contains('au-motion')) return;

  gsap.registerPlugin(window.ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(window.SplitText);
  window.__auReady = true; // cancels the 4s failsafe in <head>

  var ScrollTrigger = window.ScrollTrigger;
  var SplitText = window.SplitText;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Entrance tweens drive transform/opacity every frame; elements that carry
  // their own CSS transitions on those (buttons, links) would smooth/lag them.
  function takeOver(els) { els.forEach(function (el) { if (el) el.style.transition = 'none'; }); }
  // Hand an element back to normal CSS (hover states etc.) once its entrance is done.
  // Only the properties GSAP/takeOver touched are cleared — never 'all', which
  // would also wipe the element's own inline styles (font-size, margins, ...).
  var ENTRANCE_PROPS = 'opacity,visibility,transform,translate,scale,rotate,transition';
  function release(el, attr) {
    if (!el) return;
    if (attr) el.removeAttribute(attr);
    gsap.set(el, { clearProps: ENTRANCE_PROPS });
  }

  // Pins only on fine-pointer devices wider than 820px. Touch tablets and phones get
  // the same beats without pinning (pinned scrubs are where touch scrolling janks).
  var PINNED = '(min-width: 821px) and (hover: hover) and (pointer: fine)';
  var FLOW = '(max-width: 820px), (hover: none), (pointer: coarse)';
  var mm = gsap.matchMedia();

  /* ------------------------------------------------------------------
   * Pointer layer (fine pointers only): collections index peek, product-image spotlight,
   * hero glitter trail, and the cursor ring.
   * ------------------------------------------------------------------ */
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function footerScene() {
    $$('[data-footer]').forEach(function (f) {
      gsap.fromTo(f, { y: 48, autoAlpha: 0 }, { y: 0, autoAlpha: 1, ease: 'none',
        scrollTrigger: { trigger: f, start: 'top 108%', end: 'top 82%', scrub: true } });
    });
    // The wordmark rises out of the floor of the page and its colours slide as you arrive at the end.
    var mark = $('[data-footer-mark]');
    if (mark) {
      var st = { trigger: mark, start: 'top 105%', end: 'bottom bottom', scrub: true };
      gsap.fromTo(mark, { clipPath: 'inset(100% 0% 0% 0%)', yPercent: 24 }, { clipPath: 'inset(0% 0% 0% 0%)', yPercent: 0, ease: 'none', immediateRender: true, scrollTrigger: st });
      gsap.fromTo(mark, { backgroundPosition: '0% 50%' }, { backgroundPosition: '100% 50%', ease: 'none', scrollTrigger: st });
    }
    var top = $('[data-top]');
    if (top) top.addEventListener('click', function (e) {
      e.preventDefault();
      if (lenis) lenis.scrollTo(0, { duration: 1.6 }); else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initSpotlight() {
    if (!FINE) return;
    var raf = 0, last = null, target = null;
    document.addEventListener('pointermove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.product-card-media, .prod-strip-img') : null;
      if (!t) return;
      last = e; target = t;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var r = target.getBoundingClientRect();
        target.style.setProperty('--mx', (last.clientX - r.left) + 'px');
        target.style.setProperty('--my', (last.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  function initCursor() {
    var editorial = !/^\/(cart|checkout|account|login|signup|forgot|reset|order|wishlist)/.test(location.pathname);
    if (!FINE || !editorial) return;
    var el = document.createElement('div');
    el.className = 'au-cursor'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<b><span></span></b>';
    document.body.appendChild(el);
    var label = el.querySelector('span');
    var x = gsap.quickTo(el, 'x', { duration: 0.28, ease: 'power3.out' });
    var y = gsap.quickTo(el, 'y', { duration: 0.28, ease: 'power3.out' });
    var shown = false;
    function setState(t) {
      var lab = t && t.closest('[data-cursor]');
      var card = t && t.closest('.product-card-media, .prod-strip-item, .pdp-main');
      var link = t && t.closest('a, button, summary, label, select, .pdp-thumb');
      var text = lab ? lab.getAttribute('data-cursor') : (card && !t.closest('.pdp-arrow, button') ? (card.closest('.pdp-main') ? 'Zoom' : 'View') : '');
      label.textContent = text || '';
      el.classList.toggle('is-label', !!text);
      el.classList.toggle('is-link', !text && !!link);
    }
    document.addEventListener('pointermove', function (e) {
      if (!shown) { shown = true; gsap.set(el, { x: e.clientX, y: e.clientY }); gsap.to(el, { opacity: 1, duration: 0.4 }); }
      x(e.clientX); y(e.clientY);
      setState(e.target);
    }, { passive: true });
    document.addEventListener('pointerdown', function () { el.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { el.classList.remove('is-down'); });
    document.documentElement.addEventListener('pointerleave', function () { shown = false; gsap.to(el, { opacity: 0, duration: 0.3 }); });
  }

  /* ------------------------------------------------------------------
   * Scroll choreography: each reveal plays once, as the element enters.
   *   [data-m="rise"]            fade + short rise
   *   [data-m="lines"]           headline/quote: masked line-by-line rise (SplitText)
   *   [data-m="wipe"]            image frame opened with a clip wipe, image settling inside
   *   [data-m-group] [data-m-item]  staggered in batches (robust for tall grids)
   *   (scenes — hero hold, strip, story, About — are in the Scenes block above)
   * ------------------------------------------------------------------ */
  var isDesktop = window.innerWidth > 820;
  var DY = isDesktop ? 34 : 22;
  var DUR = isDesktop ? 1.25 : 0.95;

  function initReveals() {
    $$('[data-m="rise"]').forEach(function (el) {
      takeOver([el]);
      gsap.fromTo(el, { autoAlpha: 0, y: DY }, {
        autoAlpha: 1, y: 0, duration: DUR, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onComplete: function () { release(el, 'data-m'); }
      });
    });

    $$('[data-m-group]').forEach(function (group) {
      var items = $$('[data-m-item]', group);
      if (!items.length) return;
      gsap.set(items, { autoAlpha: 0, y: DY + 6 });
      ScrollTrigger.batch(items, {
        start: 'top 92%', once: true, interval: 0.1, batchMax: 6,
        onEnter: function (batch) {
          gsap.to(batch, {
            autoAlpha: 1, y: 0, duration: DUR, ease: 'expo.out', stagger: 0.09, overwrite: true,
            onComplete: function () { batch.forEach(function (el) { release(el, 'data-m-item'); }); }
          });
          // Product cards: the image frame is drawn open top-down while the photo settles inside it.
          batch.forEach(function (el, i) {
            var f = $('.product-card-media', el);
            if (!f) return;
            var im = $('img', f);
            if (im) takeOver([im]);
            gsap.to(f, { clipPath: 'inset(0% 0% 0% 0% round 16px)', duration: 1.4, ease: 'expo.inOut', delay: i * 0.09,
              onComplete: function () { gsap.set(f, { clearProps: 'clipPath' }); } });
            if (im) gsap.fromTo(im, { scale: 1.28 }, { scale: 1, duration: 2.1, ease: 'expo.out', delay: i * 0.09, onComplete: function () { release(im); } });
          });
        }
      });
    });

    $$('[data-m="lines"]').forEach(function (el) {
      if (!SplitText) { release(el, 'data-m'); return; }
      gsap.set(el, { opacity: 1 }); // lines are masked + offset below, so nothing shows early
      SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'au-line', autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.lines, {
            yPercent: 112, duration: 1.45, ease: 'expo.out', stagger: 0.1,
            scrollTrigger: { trigger: el, start: 'top 88%', once: true }
          });
        }
      });
    });

    $$('[data-m="wipe"]').forEach(function (frame) {
      var img = $('img', frame);
      var base = 1;
      var st = { trigger: frame, start: 'top 86%', once: true };
      gsap.to(frame, {
        clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: st,
        onComplete: function () { frame.removeAttribute('data-m'); gsap.set(frame, { clearProps: 'clipPath' }); }
      });
      if (img && !frame.hasAttribute('data-scrub-img')) gsap.fromTo(img, { scale: base * 1.22 }, { scale: base, duration: 2.2, ease: 'expo.out', scrollTrigger: st });
    });
  }

  /* ------------------------------------------------------------------
   * Smooth scroll (Lenis): editorial pages on fine-pointer devices only.
   * Native scrolling is kept on touch, and on task pages (cart, checkout,
   * account, auth) where it adds nothing.
   * ------------------------------------------------------------------ */
  var lenis = null;
  var C_showHeader = function () {}; // set by initHeader; lets other modules reveal the header (e.g. the bag fly-in)
  function initSmoothScroll() {
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var editorial = /^\/($|shop|product\/|about)/.test(location.pathname);
    if (!window.Lenis || !finePointer || !editorial) return;
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    // The first-visit curtain locks scroll; keep Lenis in step with it.
    if (root.classList.contains('au-intro')) lenis.stop(); // released by finishCurtain() / initHero()
  }

  /* Header: frosted once scrolled, hides when you scroll down, returns the moment you scroll up (or tab into it).
     Never hides while a menu is open. The menu itself is CSS; here we only keep scrolling and keys in step. */
  function initHeader() {
    var header = $('.au-header');
    if (!header) return;
    var toggle = $('#nav-toggle');
    var acct = $('#account-toggle');
    var nav = $('.nav-mobile', header);
    var hidden = false;
    var closing = false;
    function menuOpen() { return (toggle && toggle.checked) || (acct && acct.checked); }
    function show() { if (hidden) { hidden = false; header.classList.remove('is-hidden'); } }
    C_showHeader = show;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();
        header.classList.toggle('is-stuck', y > 60);
        if (menuOpen() || y < 260) { show(); return; }
        if (self.direction === 1 && !hidden && self.getVelocity() > 80) { hidden = true; header.classList.add('is-hidden'); }
        else if (self.direction === -1) show();
      }
    });
    header.addEventListener('focusin', show);

    // While the full-screen menu is open the page behind it is inert: Tab can't wander into it, and
    // screen readers don't read it. Everything else in the header (logo, bag, account, the menu itself) stays live.
    function setInert(on) {
      $$('main, .au-footer').forEach(function (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    }
    function focusables() {
      return $$('a[href], button, input:not([type="hidden"]), summary', header).filter(function (el) {
        return !el.disabled && el.getClientRects().length > 0 || el === toggle || el === acct;
      });
    }
    function openedMenu() {
      if (acct) acct.checked = false;
      show(); setInert(true);
      if (lenis) lenis.stop();
      var first = nav && $('a', nav);
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
    }
    function finishClose() {
      toggle.checked = false; closing = false;
      header.classList.remove('is-menu-closing');
      setInert(false);
      if (lenis) lenis.start();
    }
    // Close = the same sheet drawn back up (CSS keyframes), then the checkbox — the source of truth — is released.
    function closeMenu(returnFocus) {
      if (!toggle || !toggle.checked || closing) return;
      if (returnFocus) toggle.focus();
      if (!root.classList.contains('au-motion') || !nav) { finishClose(); return; }
      closing = true;
      header.classList.add('is-menu-closing');
      var done = false;
      function end() { if (done) return; done = true; finishClose(); }
      nav.addEventListener('animationend', function onEnd(e) { if (e.target === nav) { nav.removeEventListener('animationend', onEnd); end(); } });
      setTimeout(end, 900); // never leave it stuck if animationend doesn't fire
    }
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        if (closing) { e.preventDefault(); return; }
        if (!toggle.checked) { e.preventDefault(); toggle.checked = true; closeMenu(false); } // animate the close instead of snapping
      });
      toggle.addEventListener('change', function () { if (toggle.checked) openedMenu(); });
    }
    if (acct) acct.addEventListener('change', function () { if (acct.checked && toggle && toggle.checked) closeMenu(false); });
    // Click anywhere outside the account dropdown closes it.
    document.addEventListener('click', function (e) {
      if (acct && acct.checked && !e.target.closest('.account-menu')) acct.checked = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (toggle && toggle.checked) closeMenu(true);
        if (acct && acct.checked) { acct.checked = false; acct.focus(); }
        return;
      }
      if (e.key === 'Tab' && toggle && toggle.checked) { // keep focus inside the header while the menu is open
        var f = focusables(); if (!f.length) return;
        var firstEl = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    });
    // A back/forward restore must never show the menu open.
    window.addEventListener('pageshow', function () { if (toggle && toggle.checked) { toggle.checked = false; setInert(false); if (lenis) lenis.start(); } });
  }

  // Page progress -> CSS variable that drifts the two aurora backdrop layers (see motion.css).
  function initBackdrop() {
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: function (self) { root.style.setProperty('--au-p', self.progress.toFixed(4)); } });
  }

  /* ------------------------------------------------------------------
   * Page modules (motion-home.js, motion-about.js, motion-product.js) load only where they are used and
   * register their setup here. Everything runs at DOMContentLoaded — after every deferred script has executed —
   * in priority order. Order matters: pins and scenes must be created in DOM order (hero pin, scenes, footer)
   * so each ScrollTrigger sees the pin spacing above it, and generic reveals come last.
   *   0-9 smooth scroll / header   10 hero   20 scenes   30 footer   40 product   45 index   50 pointer   90 reveals
   * ------------------------------------------------------------------ */
  var queue = [];
  window.AuCore = {
    gsap: gsap, ScrollTrigger: ScrollTrigger, SplitText: SplitText, $: $, $$: $$, delay: delay,
    takeOver: takeOver, release: release, PINNED: PINNED, FLOW: FLOW, mm: mm, FINE: FINE, root: root,
    lenis: function () { return lenis; },
    showHeader: function () { C_showHeader(); },
    queue: function (priority, fn) { queue.push({ p: priority, fn: fn }); }
  };

  function runAll() {
    try {
      ScrollTrigger.config({ ignoreMobileResize: true });
      performance.mark('au:start');
      initSmoothScroll();
      initBackdrop();
      initHeader();
      performance.mark('au:smooth');
      queue.push({ p: 30, fn: footerScene }, { p: 50, fn: initSpotlight }, { p: 55, fn: initCursor }, { p: 90, fn: initReveals });
      queue.map(function (q, i) { q.i = i; return q; })
        .sort(function (a, b) { return a.p - b.p || a.i - b.i; })
        .forEach(function (q) { q.fn(); });
      // The first-visit curtain belongs to the home module; if that never loaded, don't leave the page locked.
      if (root.classList.contains('au-intro') && !window.__auHome) { root.classList.remove('au-intro'); if (lenis) lenis.start(); }
      ScrollTrigger.sort();
      performance.mark('au:reveals');
      window.addEventListener('load', function () { ScrollTrigger.refresh(); });
      window.addEventListener('pageshow', function (e) {
        if (e.persisted) { root.classList.remove('au-intro'); ScrollTrigger.refresh(); }
      });
    } catch (err) {
      root.classList.add('au-fail');
      root.classList.remove('au-intro');
      if (window.console) console.error('[motion] disabled:', err);
    }
  }
  if (document.readyState === 'complete') setTimeout(runAll, 0);
  else document.addEventListener('DOMContentLoaded', runAll);
})();
