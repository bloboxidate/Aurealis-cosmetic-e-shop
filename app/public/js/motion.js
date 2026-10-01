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

  // relight.js is a separate, home-only deferred script that executes after this one, so look it up lazily.
  function withRelight(fn) {
    if (window.AuRelight) fn(window.AuRelight);
    else document.addEventListener('DOMContentLoaded', function () { if (window.AuRelight) fn(window.AuRelight); });
  }

  /* ------------------------------------------------------------------
   * Hero (home)
   *
   * Layers, back to front: the photo (framed on the face, see motion.css),
   * a slow drifting aurora in the brand palette, the scrim, a cursor-following
   * light, an "exposure" veil that lifts, then the copy.
   *
   * First visit of a session: the wordmark settles in, DOCKS into the header's
   * logo position, the cream panel lifts off the hero, the header's controls
   * fade up, and the hero develops. Every other visit skips the curtain and
   * plays the same hero entrance directly.
   *
   * After it settles: scroll parallax at three different speeds (photo, light,
   * copy), and — on fine pointers only — a gentle cursor parallax and light.
   * ------------------------------------------------------------------ */
  function heroReady() {
    var img = $('.au-hero-img');
    var imgReady = img && img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    // Never hold the page hostage to a slow image/font.
    return Promise.race([Promise.all([imgReady, fontsReady]), delay(1800)]);
  }

  function initHero() {
    var hero = $('.au-hero');
    var loader = $('#au-loader');
    var withCurtain = root.classList.contains('au-intro') && !!loader;

    if (!hero) { root.classList.remove('au-intro'); return; }

    var img = $('.au-hero-img', hero);
    var aurora = $('.au-hero-aurora', hero);
    var blobs = aurora ? $$('i', aurora) : [];
    var glow = $('.au-hero-glow', hero);
    var veil = $('.au-hero-veil', hero);
    var cue = $('.au-hero-cue', hero);
    var copy = $('[data-hero-copy]', hero);
    var eyebrow = $('[data-hero="eyebrow"]', hero);
    var title = $('[data-hero="title"]', hero);
    var text = $('[data-hero="text"]', hero);
    var cta = $('[data-hero="cta"]', hero);
    var headerSides = $$('.au-header > div');
    var headerLogo = $('.au-logo img');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // --- Starting states (copy is already hidden by CSS) ---
    if (img) gsap.set(img, { scale: 1.16, transformOrigin: '50% 40%' });
    if (veil) gsap.set(veil, { opacity: 0.94 });
    takeOver([cta]);

    var titleTween = null;
    if (title) {
      gsap.set(title, { opacity: 1 }); // words are masked/offset below, so this doesn't flash
      if (SplitText) {
        SplitText.create(title, {
          type: 'lines,words',
          mask: 'lines',
          linesClass: 'au-line',
          wordsClass: 'au-word',
          autoSplit: true, // re-splits on resize / once webfonts land, so line breaks stay correct
          onSplit: function (self) {
            // Word by word out of each line mask, pulling into focus as they rise.
            titleTween = gsap.from(self.words, {
              yPercent: 118, filter: 'blur(5px)', duration: 1.7, ease: 'expo.out',
              stagger: { each: 0.075 }, paused: true, clearProps: 'filter'
            });
            return titleTween;
          }
        });
      }
    }

    // --- Atmosphere: slow drift, only while the hero is on screen ---
    var drifts = [];
    function startAtmosphere() {
      if (!aurora) return;
      gsap.to(aurora, { opacity: 0.62, duration: 3.4, ease: 'power2.inOut' });
      blobs.forEach(function (b, i) {
        drifts.push(gsap.to(b, {
          xPercent: [14, -16, 12][i], yPercent: [10, -12, -9][i], scale: [1.14, 1.2, 1.1][i],
          duration: [17, 23, 29][i], ease: 'sine.inOut', repeat: -1, yoyo: true
        }));
      });
      ScrollTrigger.create({
        trigger: hero, start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { drifts.forEach(function (t) { self.isActive ? t.resume() : t.pause(); }); }
      });
    }

    // --- Entrance: the hero "develops" ---
    function revealHero() {
      var tl = gsap.timeline({
        defaults: { ease: 'expo.out' },
        onComplete: function () {
          [eyebrow, title, text, cta].forEach(function (el) { release(el, 'data-hero'); });
          // End on an explicit scale of 1 (not clearProps): the scroll/cursor parallax shares this
          // element's transform, and clearing 'scale' left GSAP's cached 1.16 to be written back.
          if (img) gsap.set(img, { scale: 1 });
          buildHeroExit();
          ScrollTrigger.refresh();
        }
      });
      // exposure: the veil lifts while the photo settles back from a slight push-in
      if (veil) tl.to(veil, { opacity: 0, duration: 2.6, ease: 'power2.out' }, 0);
      if (img) tl.to(img, { scale: 1, duration: 3.0 }, 0);
      // 1. the eyebrow draws in left to right, setting the tone
      if (eyebrow) tl.fromTo(eyebrow, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 },
                              { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1, duration: 1.3, ease: 'power3.inOut' }, 0.2);
      // 2. the headline, word by word out of its line masks
      if (titleTween) tl.add(titleTween.play(0), 0.38);
      else if (title) tl.fromTo(title, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.3 }, 0.38);
      // 3. secondary elements arrive after the headline has landed
      if (text) tl.fromTo(text, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.4 }, 1.25);
      if (cta) {
        tl.fromTo(cta, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.4 }, 1.5);
        tl.call(function () { cta.classList.add('au-sheen'); setTimeout(function () { cta.classList.remove('au-sheen'); }, 1900); }, null, 2.2);
      }
      if (cue) tl.to(cue, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 2.4);
      tl.call(startAtmosphere, null, 0.6);
      tl.call(initPointer, null, 2.2);
      return tl;
    }

    // --- Scroll: the hero HOLDS (pinned) while the photo pushes in and dims and the copy lifts away,
    //     then the page takes over. Desktop-class pointers only; elsewhere it's a plain fade. ---
    var holdDist = function () { return Math.round(hero.offsetHeight * 0.62); };
    var mmHero = gsap.matchMedia();
    mmHero.add(PINNED, function () {
      // The pin is created at init (not after the entrance) so document height and every trigger
      // position below are stable from the first frame. High refreshPriority = measured first.
      ScrollTrigger.create({
        trigger: hero, start: 'top top', end: function () { return '+=' + holdDist(); },
        pin: true, pinSpacing: true, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 10
      });
    });
    mmHero.add(FLOW, function () {
      if (copy) gsap.fromTo(copy, { opacity: 1 }, { opacity: 0, ease: 'power1.in', scrollTrigger: { trigger: hero, start: '35% top', end: '85% top', scrub: true } });
    });
    // The scrubbed exit animation is built only once the entrance has finished: it animates scale,
    // veil/aurora opacity and the cue, which the entrance also drives, and a ScrollTrigger refresh
    // mid-entrance would otherwise snap them to their scroll-start values.
    function buildHeroExit() {
      mmHero.add(PINNED, function () {
        var tl = gsap.timeline({
          defaults: { ease: 'none', duration: 1 },
          scrollTrigger: { trigger: hero, start: 'top top', end: function () { return '+=' + holdDist(); }, scrub: true, invalidateOnRefresh: true }
        });
        if (img) tl.fromTo(img, { scale: 1, yPercent: 0 }, { scale: 1.14, yPercent: 4, immediateRender: false }, 0);   // push in
        if (veil) tl.fromTo(veil, { opacity: 0 }, { opacity: 0.62, immediateRender: false }, 0.1);                       // lights dim
        if (aurora) tl.fromTo(aurora, { yPercent: 0, opacity: 0.62 }, { yPercent: -10, opacity: 0.2, immediateRender: false }, 0); // light drifts the other way
        if (copy) tl.fromTo(copy, { y: 0, opacity: 1 }, { y: -44, opacity: 0, duration: 0.7, ease: 'power1.in', immediateRender: false }, 0);
        if (cue) tl.fromTo(cue, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.1, immediateRender: false }, 0);
      });
    }

    // --- Cursor: depth + light (fine pointers only) ---
    var pointerReady = false;
    function initPointer() {
      if (pointerReady || !finePointer) return;
      pointerReady = true;
      var qk = function (el, prop, d, ease) { return el ? gsap.quickTo(el, prop, { duration: d, ease: ease || 'power3.out' }) : function () {}; };
      var imgX = qk(img, 'x', 1.8), imgY = qk(img, 'y', 1.8);          // photo drifts against the cursor
      var auX = qk(aurora, 'x', 2.2), auY = qk(aurora, 'y', 2.2);      // light moves further (deeper plane)
      var cpX = qk(copy, 'x', 1.4);                                    // copy leans slightly with it (nearest plane)
      var glX = qk(glow, 'x', 0.9), glY = qk(glow, 'y', 0.9), glO = qk(glow, 'opacity', 0.9, 'power2.out');
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        imgX(-nx * 22); imgY(-ny * 14);
        auX(nx * 50);  auY(ny * 34);
        cpX(nx * 9);
        glX(e.clientX - r.left); glY(e.clientY - r.top); glO(0.42);
      });
      hero.addEventListener('pointerleave', function () {
        imgX(0); imgY(0); auX(0); auY(0); cpX(0); glO(0);
      });
    }

    if (!withCurtain) {
      root.classList.remove('au-intro');
      if (lenis) lenis.start();
      heroReady().then(revealHero);
      return;
    }

    // --- Curtain: wordmark settles in, docks into the header, the panel lifts, the hero develops ---
    try { sessionStorage.setItem('au-intro', '1'); } catch (e) {}
    window.scrollTo(0, 0);
    var panel = $('.au-loader-panel', loader);
    var logo = $('img', loader);
    var line = $('.au-loader-line', loader);
    var ready = heroReady(); // runs while the wordmark is on screen

    function dockLogo() {
      // Fly the wordmark onto exactly where the header's own logo sits.
      if (!headerLogo) return;
      var a = logo.getBoundingClientRect(), b = headerLogo.getBoundingClientRect();
      gsap.to(logo, {
        x: '+=' + ((b.left + b.width / 2) - (a.left + a.width / 2)),
        y: '+=' + ((b.top + b.height / 2) - (a.top + a.height / 2)),
        duration: 1.05, ease: 'expo.inOut'
      });
    }
    function finishCurtain() {
      root.classList.remove('au-intro'); // loader disappears, header logo + controls take over, scroll unlocks
      if (lenis) lenis.start();          // same frame as the class change, so the scrollbar gutter never flips
      gsap.set(headerSides, { clearProps: 'opacity' });
    }

    gsap.set(headerSides, { opacity: 0 });
    var intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro.fromTo(logo, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9 }, 0.05);
    intro.to(line, { scaleX: 1, duration: 1.0, ease: 'power2.inOut' }, 0.2);
    intro.call(function () { intro.pause(); ready.then(function () { intro.resume(); }); }, null, 1.05);
    intro.to(line, { opacity: 0, duration: 0.4 }, 1.15);
    intro.call(dockLogo, null, 1.15);
    intro.to(panel, { yPercent: -100, duration: 1.2, ease: 'expo.inOut' }, 2.05);
    intro.call(revealHero, null, 2.3);
    intro.to(headerSides, { opacity: 1, duration: 1.1, stagger: 0.12, ease: 'power2.out' }, 2.7);
    intro.call(finishCurtain, null, 3.4);
  }

  /* ------------------------------------------------------------------
   * Scenes: the scroll "story".
   *
   * Home: hero holds and recedes -> the collection rises in and its marquee
   * answers your scrolling -> a horizon line draws -> the story chapter pins:
   * the image opens, image and quote converge, and the quote lights word by
   * word as you read -> the footer arrives.
   * About: the headline recedes -> the image holds (CSS sticky) and slowly
   * zooms out while the long body is read paragraph by paragraph -> the value
   * icons drift at three speeds -> the palette assembles.
   *
   * Everything is scrubbed to scroll (not time), so entrances and exits overlap
   * and read as one continuous move. Pins only on fine-pointer devices wider
   * than 820px; touch tablets and phones get the same beats without pinning.
   * ------------------------------------------------------------------ */
  function stripScene(wrap) {
    var viewport = $('.prod-strip', wrap);
    var track = $('.prod-strip-track', wrap);
    // Entrance, tied to scroll: it rises and settles as the hero lets go of the page.
    gsap.fromTo(wrap, { y: 90, opacity: 0 }, {
      y: 0, opacity: 1, ease: 'none',
      scrollTrigger: { trigger: wrap, start: 'top 108%', end: 'top 70%', scrub: true }
    });
    if (!track || !viewport) return;

    // The marquee: same loop as the CSS version, but its speed answers your scroll
    // (faster when you scroll down, runs backwards when you scroll up) and it eases to a stop on hover/focus.
    var loop = parseFloat(track.style.animationDuration) || 60;
    var tween = gsap.to(track, { xPercent: -50, ease: 'none', duration: loop, repeat: -1 });
    tween.totalTime(loop * 200); // start deep in the loop so a reversed timeScale has a long runway
    var m = { hover: 1, vel: 0 };
    function apply() { tween.timeScale(m.hover * (1 + m.vel)); }
    var settle = gsap.to(m, { vel: 0, duration: 1.4, ease: 'power2.out', paused: true, onUpdate: apply });
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        m.vel = gsap.utils.clamp(-6, 6, self.getVelocity() / 320);
        apply();
        settle.invalidate().restart();
      }
    });
    function hover(v) { gsap.to(m, { hover: v, duration: 0.7, ease: 'power2.out', onUpdate: apply, overwrite: 'auto' }); }
    viewport.addEventListener('pointerenter', function () { hover(0); });
    viewport.addEventListener('pointerleave', function () { hover(1); });
    viewport.addEventListener('focusin', function () { hover(0); });
    viewport.addEventListener('focusout', function () { hover(1); });
    ScrollTrigger.create({
      trigger: wrap, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { self.isActive ? tween.resume() : tween.pause(); }
    });
  }

  function withAurora(fn) {
    if (window.AuAurora) fn(window.AuAurora);
    else document.addEventListener('DOMContentLoaded', function () { if (window.AuAurora) fn(window.AuAurora); });
  }

  /* The Northern Light: a tall section whose stage sticks (CSS) while scroll plays three statements over a
     live aurora. Progress drives both the words and the shader's palette; the cursor bends the light. The
     stage also opens from a rounded card to full-bleed as the chapter arrives. */
  function auroraScene(sec) {
    var stage = $('[data-aurora="stage"]', sec);
    var canvas = $('canvas', sec);
    var lines = $$('[data-aurora="line"]', sec);
    var link = $('[data-aurora="link"]', sec);
    var bar = $('.au-aurora-bar b', sec);
    if (!stage || lines.length < 3) { $$('[data-aurora]', sec).forEach(function (el) { el.removeAttribute('data-aurora'); }); return; }

    var gl = null;
    if (canvas) withAurora(function (A) {
      gl = A.create({ canvas: canvas, stage: stage, host: sec });
      if (gl && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        stage.addEventListener('pointermove', function (e) {
          var r = stage.getBoundingClientRect();
          gl.setPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        });
        stage.addEventListener('pointerleave', function () { gl.setPointer(null); });
      }
    });

    // Words rise out of masks. Words (not lines) so a resize can't re-wrap into a stale timeline.
    var sets = lines.map(function (el) {
      gsap.set(el, { opacity: 1 });
      if (!SplitText) return [el];
      return SplitText.create(el, { type: 'words', mask: 'words', wordsClass: 'au-word' }).words;
    });

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true,
        onUpdate: function (self) { if (gl) gl.setProgress(self.progress); }
      }
    });
    var IN = { yPercent: 0, ease: 'power3.out', duration: 0.09, stagger: { amount: 0.05 } };
    var OUT = { yPercent: -118, ease: 'power2.in', duration: 0.06, stagger: { amount: 0.03 } };
    var cue = [[0.03, 0.3], [0.37, 0.64], [0.71, null]];
    sets.forEach(function (words, i) {
      // Explicit start state: a staggered fromTo in a timeline only renders its first target up front.
      gsap.set(words, { yPercent: 118 });
      tl.fromTo(words, { yPercent: 118 }, Object.assign({ immediateRender: false }, IN), cue[i][0]);
      if (cue[i][1] != null) tl.to(words, OUT, cue[i][1]);
    });
    if (link) { takeOver([link]); tl.fromTo(link, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.07 }, 0.86); }
    if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0);
    if (tl.duration() < 1) tl.to({}, { duration: 1 - tl.duration() });

    // The stage opens from a rounded card to full-bleed while the section arrives.
    gsap.fromTo(stage, { clipPath: 'inset(9% 4% 9% 4% round 36px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', immediateRender: true,
      scrollTrigger: { trigger: sec, start: 'top 92%', end: 'top top', scrub: true }
    });
  }

  function storyScene(sec) {
    var frame = $('[data-story="image"]', sec);
    var img = frame && $('img', frame);
    var quote = $('[data-story="quote"]', sec);
    var link = $('[data-story="link"]', sec);
    if (!frame || !quote) { [frame, quote, link].forEach(function (el) { if (el) el.removeAttribute('data-story'); }); return; }

    // Foil glint: gold marks catch a sweeping light as the chapter plays (WebGL; null = no-op, original photo stays).
    var foilGL = null;
    if (img) withRelight(function (R) {
      foilGL = R.create({ img: img, mode: 'foil', trigger: sec, amount: 1.2 });
      if (foilGL && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        frame.addEventListener('pointermove', function (e) { foilGL.setLight(e.clientX, e.clientY); });
        frame.addEventListener('pointerleave', function () { foilGL.setLight(null); });
      }
    });

    function prepare() { // start states shared by both variants
      var split = SplitText ? SplitText.create(quote, { type: 'words', wordsClass: 'au-sw' }) : null;
      var words = split ? split.words : [];
      gsap.set(quote, { opacity: 1 });
      if (words.length) gsap.set(words, { opacity: 0.16 });
      if (link) { takeOver([link]); gsap.set(link, { opacity: 0, y: 14 }); }
      gsap.set(frame, { opacity: 1, clipPath: 'inset(16% 18% 16% 18% round 20px)' });
      if (img) gsap.set(img, { scale: 1.35 });
      return words;
    }

    // Pinned chapter: scroll "plays" the scene, then lets go.
    mm.add(PINNED, function () {
      var words = prepare();
      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: sec, start: 'center center', end: function () { return '+=' + Math.round(window.innerHeight * 0.95); },
          pin: true, scrub: true, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: function (self) { if (foilGL) foilGL.setProgress(self.progress); }
        }
      });
      tl.to(frame, { clipPath: 'inset(0% 0% 0% 0% round 20px)', ease: 'power2.inOut', duration: 0.45 }, 0)      // the frame opens
        .fromTo(frame, { xPercent: -5 }, { xPercent: 0, ease: 'power2.out', duration: 0.45 }, 0)                   // image and quote converge
        .fromTo(quote, { xPercent: 4 }, { xPercent: 0, ease: 'power2.out', duration: 0.45 }, 0);
      if (img) tl.to(img, { scale: 1.06, duration: 1 }, 0);                                                       // and the image never stops moving
      if (words.length) tl.to(words, { opacity: 1, duration: 0.1, stagger: { amount: 0.6 } }, 0.2);              // the quote is read, word by word
      if (link) tl.to(link, { opacity: 1, y: 0, duration: 0.12 }, 0.86);
      tl.to({}, { duration: 0.1 }, 1);                                                                           // a short hold on the finished frame
    });

    // Un-pinned (phones, touch tablets): the same beats, driven by passing through the viewport.
    mm.add(FLOW, function () {
      var words = prepare();
      gsap.set(frame, { clipPath: 'inset(0% 0% 100% 0% round 20px)' });
      if (img) gsap.set(img, { scale: 1.2 });
      var st = { trigger: frame, start: 'top 86%', once: true };
      ScrollTrigger.create({ trigger: frame, start: 'top 90%', end: 'bottom 20%', onUpdate: function (self) { if (foilGL) foilGL.setProgress(self.progress); } });
      gsap.to(frame, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.5, ease: 'expo.inOut', scrollTrigger: st });
      if (img) gsap.to(img, { scale: 1, duration: 2.2, ease: 'expo.out', scrollTrigger: st });
      if (words.length) gsap.to(words, { opacity: 1, ease: 'none', stagger: { amount: 0.7 }, scrollTrigger: { trigger: quote, start: 'top 82%', end: 'bottom 52%', scrub: true } });
      if (link) gsap.to(link, { opacity: 1, y: 0, ease: 'none', scrollTrigger: { trigger: link, start: 'top 94%', end: 'top 76%', scrub: true } });
    });
  }

  function aboutScenes() {
    var head = $('[data-about="head"]');
    var row = $('[data-about="row"]');
    var frame = $('[data-about="image"]');
    var img = frame && $('img', frame);
    var body = $('[data-about="body"]');
    var values = $('[data-about="values"]');
    var swatches = $('[data-about="swatches"]');
    var kids = body ? Array.prototype.slice.call(body.children) : [];

    // Hold the image (CSS sticky) only if the body is clearly longer than it; re-check on every refresh.
    function markLong() { if (row && frame && body) row.classList.toggle('au-long', body.offsetHeight > frame.offsetHeight * 1.2); }
    markLong();
    ScrollTrigger.addEventListener('refreshInit', markLong);

    mm.add('(min-width: 821px)', function () {
      // exit of the opening: the headline recedes as the story begins
      if (head) gsap.fromTo(head, { y: 0, opacity: 1 }, { y: -48, opacity: 0.12, ease: 'none', immediateRender: false,
        scrollTrigger: { trigger: head, start: 'top top', end: 'bottom top', scrub: true } });
      // the image holds (CSS sticky) and slowly zooms out while the body is read
      if (img && row) gsap.fromTo(img, { scale: 1.22, yPercent: -3 }, { scale: 1.04, yPercent: 3, ease: 'none',
        scrollTrigger: { trigger: row, start: 'top 88%', end: 'bottom 30%', scrub: true } });
      // each paragraph comes into focus as it approaches the reading line
      kids.forEach(function (k) {
        gsap.fromTo(k, { opacity: 0.18, y: 26 }, { opacity: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: k, start: 'top 94%', end: 'top 60%', scrub: true } });
      });
      // the value icons sit on three planes: they cross alignment at the middle of the band
      if (values) $$('[data-m-item] > div:first-child', values).forEach(function (c, i) {
        var d = [34, 18, 48][i % 3];
        gsap.fromTo(c, { y: -d }, { y: d, ease: 'none', scrollTrigger: { trigger: values, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });

    mm.add('(max-width: 820px)', function () {
      kids.forEach(function (k) {
        gsap.fromTo(k, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.95, ease: 'expo.out',
          scrollTrigger: { trigger: k, start: 'top 92%', once: true } });
      });
      if (img && frame) gsap.fromTo(img, { scale: 1.2 }, { scale: 1, duration: 2.2, ease: 'expo.out',
        scrollTrigger: { trigger: frame, start: 'top 86%', once: true } });
    });

    // Wide screens with a mouse: the palette starts fanned out and assembles as it reaches the middle.
    mm.add('(min-width: 1200px) and (hover: hover) and (pointer: fine)', function () {
      if (!swatches) return;
      var sw = $$('[data-sw]', swatches);
      sw.forEach(function (el, i) {
        gsap.fromTo(el, { x: (i - (sw.length - 1) / 2) * 30 }, { x: 0, ease: 'none',
          scrollTrigger: { trigger: swatches, start: 'top 92%', end: 'top 50%', scrub: true } });
      });
    });
  }

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

  function initScenes() {
    var strip = $('[data-strip]');
    var horizon = $('[data-horizon]');
    var story = $('[data-story="section"]');
    var aurora = $('[data-aurora="section"]');
    if (strip) stripScene(strip);
    if (aurora) auroraScene(aurora);
    if (horizon) gsap.fromTo(horizon, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: horizon, start: 'top 100%', end: 'top 60%', scrub: true } });
    if (story) storyScene(story);
    aboutScenes();
    footerScene(); // created after any pins above it, so its start position includes their spacing
  }

  /* ------------------------------------------------------------------
   * Product page: images wipe into each other, the main image zooms under a mouse, and the
   * Details / How to Use / Ingredients panels open on a soft height curve. Without this the
   * page works natively (<details>, instant image swap in app.js).
   * ------------------------------------------------------------------ */
  var gallery = { busy: false, zoomed: false };
  function gallerySwap(img, src, dir) {
    var frame = img && img.parentNode;
    if (!frame || gallery.busy) return false;
    gallery.busy = true;
    var ghost = img.cloneNode(false);
    ghost.removeAttribute('id'); ghost.alt = '';
    ghost.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;transition:none';
    ghost.src = src;
    function run() {
      frame.insertBefore(ghost, img.nextSibling);
      gsap.killTweensOf(img);
      gsap.fromTo(ghost, { clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)', scale: 1.14 },
        { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.05, ease: 'expo.inOut' });
      gsap.to(img, { xPercent: dir > 0 ? -14 : 14, scale: 1, duration: 1.05, ease: 'expo.inOut',
        onComplete: function () {
          img.src = src;
          gsap.set(img, { xPercent: 0, scale: 1, transformOrigin: '50% 50%' });
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          gallery.busy = false;
        } });
    }
    (ghost.decode ? ghost.decode() : Promise.resolve()).then(run, run);
    return true;
  }
  window.AuMotion = { gallerySwap: gallerySwap };

  function initProduct() {
    var frame = $('.pdp-main');
    var img = $('#pdp-main-img');
    if (frame && img && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      frame.addEventListener('pointerenter', function (e) {
        if (gallery.busy || e.target.closest('.pdp-arrow')) return;
        var r = frame.getBoundingClientRect();
        img.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
        gallery.zoomed = true;
        gsap.to(img, { scale: 1.9, duration: 1.0, ease: 'expo.out', overwrite: 'auto' });
      });
      frame.addEventListener('pointermove', function (e) {
        if (!gallery.zoomed) return;
        var r = frame.getBoundingClientRect();
        img.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
      });
      frame.addEventListener('pointerleave', function () {
        gallery.zoomed = false;
        gsap.to(img, { scale: 1, duration: 0.9, ease: 'expo.out', overwrite: 'auto' });
      });
    }
    $$('.pdp-acc').forEach(function (d) {
      var sum = $('summary', d), body = $('.pdp-acc-body', d);
      if (!sum || !body) return;
      var busy = false;
      sum.addEventListener('click', function (e) {
        e.preventDefault();
        if (busy) return;
        busy = true;
        if (d.open) {
          d.classList.add('is-closing');
          gsap.to(body, { height: 0, duration: 0.7, ease: 'expo.inOut', onComplete: function () {
            d.open = false; d.classList.remove('is-closing'); gsap.set(body, { clearProps: 'height' }); busy = false;
          } });
        } else {
          d.open = true;
          gsap.fromTo(body, { height: 0 }, { height: 'auto', duration: 0.85, ease: 'expo.out', onComplete: function () { gsap.set(body, { clearProps: 'height' }); busy = false; } });
        }
      });
    });
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
    var hidden = false;
    function menuOpen() { return (toggle && toggle.checked) || (acct && acct.checked); }
    function show() { if (hidden) { hidden = false; header.classList.remove('is-hidden'); } }
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
    if (toggle) toggle.addEventListener('change', function () {
      if (toggle.checked) { show(); if (acct) acct.checked = false; if (lenis) lenis.stop(); }
      else if (lenis) lenis.start();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (toggle && toggle.checked) { toggle.checked = false; if (lenis) lenis.start(); var l = $('label[for="nav-toggle"]'); if (l) l.focus(); }
      if (acct && acct.checked) acct.checked = false;
    });
    // A back/forward restore must never show the menu open.
    window.addEventListener('pageshow', function () { if (toggle && toggle.checked) { toggle.checked = false; if (lenis) lenis.start(); } });
  }

  // Page progress -> CSS variable that drifts the two aurora backdrop layers (see motion.css).
  function initBackdrop() {
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: function (self) { root.style.setProperty('--au-p', self.progress.toFixed(4)); } });
  }

  /* ------------------------------------------------------------------ */
  try {
    ScrollTrigger.config({ ignoreMobileResize: true });
    performance.mark('au:start');
    initSmoothScroll();
    initBackdrop();
    initHeader();
    performance.mark('au:smooth');
    initHero();
    performance.mark('au:hero');
    initScenes();
    performance.mark('au:scenes');
    initProduct();
    initReveals();
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
})();
