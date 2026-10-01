/* Auréalis motion — home page module: hero + first-visit curtain, product marquee, Northern Light chapter,
 * story chapter, collections index. Loaded by home.ejs only; registers with the core (motion.js). */
(function () {
  'use strict';
  var C = window.AuCore;
  if (!C) return; // the core did not start (reduced motion, missing libraries): the page stays static
  var gsap = C.gsap, ScrollTrigger = C.ScrollTrigger, SplitText = C.SplitText, $ = C.$, $$ = C.$$, delay = C.delay;
  var takeOver = C.takeOver, release = C.release, PINNED = C.PINNED, FLOW = C.FLOW, mm = C.mm, FINE = C.FINE, root = C.root;

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
      var spark = initSparks(hero);
      var cpX = qk(copy, 'x', 1.4);                                    // copy leans slightly with it (nearest plane)
      var glX = qk(glow, 'x', 0.9), glY = qk(glow, 'y', 0.9), glO = qk(glow, 'opacity', 0.9, 'power2.out');
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        imgX(-nx * 22); imgY(-ny * 14);
        auX(nx * 50);  auY(ny * 34);
        cpX(nx * 9);
        glX(e.clientX - r.left); glY(e.clientY - r.top); glO(0.42);
        spark(e.clientX - r.left, e.clientY - r.top);
      });
      hero.addEventListener('pointerleave', function () {
        imgX(0); imgY(0); auX(0); auY(0); cpX(0); glO(0);
      });
    }

    if (!withCurtain) {
      root.classList.remove('au-intro');
      if (C.lenis()) C.lenis().start();
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
      if (C.lenis()) C.lenis().start();          // same frame as the class change, so the scrollbar gutter never flips
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
    if (link) { takeOver([link]); tl.fromTo(link, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.07 }, 0.86); }
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

  function initIndex() {
    var sec = $('[data-index]');
    if (!sec || !FINE) return;
    var rows = $$('a[data-img]', sec);
    var peek = $('.au-index-peek', sec);
    if (!rows.length || !peek) return;
    var imgs = {};
    var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
    ric(function () {   // images are only fetched at idle, and only for mouse users
      rows.forEach(function (r) {
        var src = r.getAttribute('data-img');
        if (imgs[src]) return;
        var im = new Image(); im.alt = ''; im.decoding = 'async'; im.src = src; peek.appendChild(im); imgs[src] = im;
      });
    });
    var px = gsap.quickTo(peek, 'x', { duration: 0.7, ease: 'power3.out' });
    var py = gsap.quickTo(peek, 'y', { duration: 0.7, ease: 'power3.out' });
    function place(e, snap) {
      var x = e.clientX + 40, y = e.clientY - peek.offsetHeight / 2;
      if (x + peek.offsetWidth > window.innerWidth - 12) x = e.clientX - peek.offsetWidth - 40; // never off-screen on the right
      if (snap) gsap.set(peek, { x: x, y: y }); else { px(x); py(y); }
    }
    rows.forEach(function (r) {
      r.addEventListener('pointerenter', function (e) {
        var src = r.getAttribute('data-img');
        Object.keys(imgs).forEach(function (k) { imgs[k].classList.toggle('is-on', k === src); });
        if (gsap.getProperty(peek, 'opacity') < 0.05) place(e, true);
        gsap.to(peek, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.55, ease: 'expo.out', overwrite: 'auto' });
      });
      r.addEventListener('pointerleave', function () { gsap.to(peek, { autoAlpha: 0, scale: 0.86, duration: 0.45, ease: 'power2.out', overwrite: 'auto' }); });
    });
    sec.addEventListener('pointermove', function (e) { place(e, false); }, { passive: true });
    gsap.set(peek, { scale: 0.86 });
  }

  // Glitter: a small pool of four-point stars that bloom and fade along the cursor's path over the hero.
  function initSparks(hero) {
    var box = $('.au-hero-sparks', hero);
    if (!box || !FINE) return function () {};
    var pool = [], n = 0, lx = -999, ly = -999;
    for (var i = 0; i < 14; i++) { var s = document.createElement('i'); box.appendChild(s); pool.push(s); }
    return function (x, y) {
      var dx = x - lx, dy = y - ly;
      if (dx * dx + dy * dy < 66 * 66) return;
      lx = x; ly = y;
      var el = pool[n++ % pool.length];
      var size = gsap.utils.random(0.55, 1.35);
      gsap.killTweensOf(el);
      gsap.timeline()
        .set(el, { x: x - 11 + gsap.utils.random(-14, 14), y: y - 11 + gsap.utils.random(-14, 14), scale: 0, rotate: gsap.utils.random(-25, 25), opacity: 1 })
        .to(el, { scale: size, rotate: '+=40', duration: 0.38, ease: 'power3.out' })
        .to(el, { scale: 0, opacity: 0, rotate: '+=30', duration: 0.95, ease: 'power2.in' }, 0.3);
    };
  }

  function homeScenes() {
    var strip = $('[data-strip]');
    var horizon = $('[data-horizon]');
    var story = $('[data-story="section"]');
    var aurora = $('[data-aurora="section"]');
    if (strip) stripScene(strip);
    if (aurora) auroraScene(aurora);
    if (horizon) gsap.fromTo(horizon, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: horizon, start: 'top 100%', end: 'top 60%', scrub: true } });
    if (story) storyScene(story);
  }

  window.__auHome = true;
  C.queue(10, initHero);
  C.queue(20, homeScenes);
  C.queue(45, initIndex);
})();
