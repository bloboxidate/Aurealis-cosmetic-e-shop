/* Auréalis motion — product page module (gallery wipe + zoom, accordions). Loaded by product.ejs only. */
(function () {
  'use strict';
  var C = window.AuCore;
  if (!C) return; // the core did not start (reduced motion, missing libraries): the page stays static
  var gsap = C.gsap, ScrollTrigger = C.ScrollTrigger, SplitText = C.SplitText, $ = C.$, $$ = C.$$, delay = C.delay;
  var takeOver = C.takeOver, release = C.release, PINNED = C.PINNED, FLOW = C.FLOW, mm = C.mm, FINE = C.FINE, root = C.root;

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
  window.AuMotion = window.AuMotion || {};
  window.AuMotion.gallerySwap = gallerySwap;

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

  C.queue(40, initProduct);
})();
