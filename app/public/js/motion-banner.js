/* Auréalis motion — aurora banner module (error pages, order confirmation).
 * A smaller sibling of the home "Northern Light" chapter: the same shader on a short dark stage, with the headline
 * rising word by word. No scroll scrubbing. Falls back to the CSS gradient if WebGL or motion is unavailable. */
(function () {
  'use strict';
  var C = window.AuCore;
  if (!C) return;
  var gsap = C.gsap, SplitText = C.SplitText, $ = C.$, $$ = C.$$, FINE = C.FINE;

  function init() {
    $$('[data-banner]').forEach(function (sec) {
      var stage = $('[data-banner-stage]', sec);
      var canvas = $('canvas', sec);
      var title = $('[data-banner-title]', sec);
      var rest = $$('[data-banner-rise]', sec);
      if (stage && canvas && window.AuAurora) {
        var gl = window.AuAurora.create({ canvas: canvas, stage: stage, host: sec });
        if (gl) {
          gl.setProgress(parseFloat(sec.getAttribute('data-progress')) || 0.5);
          if (FINE) {
            stage.addEventListener('pointermove', function (e) {
              var r = stage.getBoundingClientRect();
              gl.setPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            });
            stage.addEventListener('pointerleave', function () { gl.setPointer(null); });
          }
        }
      }
      if (title) {
        gsap.set(title, { opacity: 1 }); // words are masked + offset below, so nothing shows early
        if (SplitText) {
          var split = SplitText.create(title, { type: 'words', mask: 'words', wordsClass: 'au-word' });
          gsap.from(split.words, { yPercent: 118, duration: 1.5, ease: 'expo.out', stagger: 0.07, delay: 0.25 });
        }
      }
      rest.forEach(function (el, i) {
        gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', delay: 0.8 + i * 0.12 });
      });
    });
  }
  C.queue(20, init);
})();
