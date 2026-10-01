/* Auréalis — "Your Ritual" builder (home). Pick products in the order you'd use them; steps are numbered by the
 * order you choose; the total updates; one button adds them all to the bag, one after another (the cart takes one
 * item per request), each with its fly-in. Plain buttons with aria-pressed, so it works with keyboard and screen readers. */
(function () {
  'use strict';
  var sec = document.querySelector('[data-ritual]');
  if (!sec || !window.fetch) return;
  var tiles = Array.prototype.slice.call(sec.querySelectorAll('.au-ritual-tile'));
  var countEl = sec.querySelector('[data-ritual-count]');
  var totalEl = sec.querySelector('[data-ritual-total]');
  var addBtn = sec.querySelector('[data-ritual-add]');
  var order = [];
  var busy = false;
  var shown = 0; // the total currently displayed, in cents (rolled by GSAP when available)
  var prefix = ((tiles[0] && tiles[0].querySelector('.au-ritual-price').textContent) || 'EGP 0').replace(/[\d.,\s]+$/, '').trim() || 'EGP';

  function fmt(cents) { var v = cents / 100; return prefix + ' ' + (Math.abs(v - Math.round(v)) < 0.005 ? Math.round(v) : v.toFixed(2)); }
  function total() { return order.reduce(function (s, t) { return s + (parseInt(t.getAttribute('data-cents'), 10) || 0); }, 0); }

  function render() {
    tiles.forEach(function (t) {
      var i = order.indexOf(t);
      t.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      t.querySelector('.au-ritual-step').textContent = i >= 0 ? String(i + 1) : '';
    });
    var n = order.length;
    countEl.textContent = n === 0 ? 'Pick two or more' : n === 1 ? '1 step · add one more' : n + ' steps';
    addBtn.disabled = busy || n < 1;
    addBtn.textContent = n > 1 ? 'Add ' + n + ' to Bag' : 'Add to Bag';
    var target = total();
    var g = window.gsap;
    if (g) { var o = { v: shown }; g.to(o, { v: target, duration: 0.7, ease: 'expo.out', overwrite: 'auto', onUpdate: function () { shown = o.v; totalEl.textContent = shown ? fmt(Math.round(shown)) : ''; } }); }
    else { shown = target; totalEl.textContent = target ? fmt(target) : ''; }
  }

  tiles.forEach(function (t) {
    t.addEventListener('click', function () {
      if (busy) return;
      var i = order.indexOf(t);
      if (i >= 0) order.splice(i, 1); else order.push(t);
      render();
    });
  });

  function addOne(t) {
    var body = 'product_id=' + encodeURIComponent(t.getAttribute('data-id')) + '&size=' + encodeURIComponent(t.getAttribute('data-size') || '') + '&qty=1';
    return fetch('/cart/add', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: body })
      .then(function (r) { return r.json(); });
  }

  addBtn.addEventListener('click', function () {
    if (busy || !order.length) return;
    busy = true; addBtn.disabled = true; addBtn.classList.add('au-busy');
    var queue = order.slice(), done = 0, failed = 0;
    (function next() {
      var t = queue.shift();
      if (!t) {
        addBtn.classList.remove('au-busy');
        var A = window.AuApp;
        if (A) A.toast(failed ? 'Some items could not be added.' : (done === 1 ? 'Added to your bag' : done + ' items added to your bag'), !!failed && !done);
        addBtn.textContent = failed && !done ? 'Try again' : 'Added ✓';
        setTimeout(function () { busy = false; if (!failed) { order = []; } render(); }, 1400);
        return;
      }
      addOne(t).then(function (d) {
        if (d && d.ok) {
          done++;
          if (window.AuApp) window.AuApp.updateCartBadge(d.count || 0, true);
          var img = t.querySelector('img'); if (img && window.AuMotion && window.AuMotion.fly) window.AuMotion.fly(img);
          if (window.AuSound) window.AuSound.chime();
        } else failed++;
        setTimeout(next, 260);
      }).catch(function () { failed++; setTimeout(next, 260); });
    })();
  });
  render();
})();
