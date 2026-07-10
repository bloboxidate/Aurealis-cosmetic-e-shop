// Auréalis storefront interactivity (progressive enhancement — the site works without it).
(function () {
  'use strict';

  // --- Product page: size chips ---
  var sizeGroup = document.getElementById('size-group');
  var sizeInput = document.getElementById('size-input');
  if (sizeGroup && sizeInput) {
    sizeGroup.addEventListener('click', function (e) {
      var chip = e.target.closest('.size-chip');
      if (!chip) return;
      sizeGroup.querySelectorAll('.size-chip').forEach(function (c) {
        c.style.border = '1px solid rgba(58,53,46,.3)';
        c.style.color = '#6b6357';
      });
      chip.style.border = '1.5px solid #3a352e';
      chip.style.color = '#3a352e';
      sizeInput.value = chip.dataset.size;
    });
  }

  // --- Product page: gallery thumbnail swap ---
  var mainImg = document.getElementById('pdp-main-img');
  document.querySelectorAll('.pdp-thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      if (mainImg && thumb.dataset.full) mainImg.src = thumb.dataset.full;
    });
  });

  // --- Product page: quantity stepper ---
  document.querySelectorAll('.qty-inc, .qty-dec').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('div');
      var valEl = wrap.querySelector('.qty-val');
      var input = wrap.querySelector('.qty-input');
      var v = parseInt(valEl.textContent, 10) || 1;
      v = btn.classList.contains('qty-inc') ? v + 1 : Math.max(1, v - 1);
      valEl.textContent = v;
      if (input) input.value = v;
    });
  });

  // --- Product cards: quick add-to-bag (hover icon + button below the card) ---
  function updateCartBadge(count, animate) {
    var badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
    if (animate) pulse(badge);
  }

  function pulse(el) {
    el.classList.remove('au-added');
    void el.offsetWidth;
    el.classList.add('au-added');
    el.addEventListener('animationend', function handler() {
      el.classList.remove('au-added');
      el.removeEventListener('animationend', handler);
    });
  }

  function addToCart(productId, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    var isQuick = btn.classList.contains('product-card-quick-add');
    var label = isQuick ? null : btn.textContent;

    fetch('/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: 'product_id=' + encodeURIComponent(productId) + '&qty=1',
    }).then(function (r) { return r.json(); }).then(function (data) {
      updateCartBadge(data.count || 0, data.ok);
      if (data.ok) pulse(btn);
      if (!isQuick) {
        btn.textContent = data.ok ? 'Added ✓' : 'Unavailable';
        setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 1300);
      } else {
        btn.disabled = false;
      }
    }).catch(function () {
      if (!isQuick) btn.textContent = label;
      btn.disabled = false;
    });
  }

  document.addEventListener('click', function (e) {
    var quick = e.target.closest('.product-card-quick-add');
    if (quick) {
      e.preventDefault();
      e.stopPropagation();
      addToCart(quick.dataset.productId, quick);
      return;
    }
    var add = e.target.closest('.product-card-add');
    if (add) {
      e.preventDefault();
      addToCart(add.dataset.productId, add);
    }
  });
})();
