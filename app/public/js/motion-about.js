/* Auréalis motion — About page module. Loaded by about.ejs only. */
(function () {
  'use strict';
  var C = window.AuCore;
  if (!C) return; // the core did not start (reduced motion, missing libraries): the page stays static
  var gsap = C.gsap, ScrollTrigger = C.ScrollTrigger, SplitText = C.SplitText, $ = C.$, $$ = C.$$, delay = C.delay;
  var takeOver = C.takeOver, release = C.release, PINNED = C.PINNED, FLOW = C.FLOW, mm = C.mm, FINE = C.FINE, root = C.root;

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

  C.queue(20, aboutScenes);
})();
