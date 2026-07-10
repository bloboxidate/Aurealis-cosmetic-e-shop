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

  // --- Product page: gallery — click a thumbnail, or use the prev/next
  // arrows, to switch the main image. Both stay in sync with each other. ---
  var mainImg = document.getElementById('pdp-main-img');
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.pdp-thumb'));
  if (mainImg && thumbs.length) {
    var current = thumbs.findIndex(function (t) { return t.classList.contains('pdp-thumb-active'); });
    if (current < 0) current = 0;

    function showImage(index) {
      current = (index + thumbs.length) % thumbs.length; // wrap around both ends
      var thumb = thumbs[current];
      mainImg.style.opacity = '0';
      setTimeout(function () {
        mainImg.src = thumb.dataset.full;
        mainImg.style.opacity = '1';
      }, 120);
      thumbs.forEach(function (t) { t.classList.remove('pdp-thumb-active'); });
      thumb.classList.add('pdp-thumb-active');
    }

    thumbs.forEach(function (thumb, i) {
      thumb.addEventListener('click', function () { showImage(i); });
    });
    var prevBtn = document.getElementById('pdp-prev');
    var nextBtn = document.getElementById('pdp-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { showImage(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { showImage(current + 1); });
  }

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
  var CHECK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2f4a26" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var BAG_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a352e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>';

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

  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById('au-toast');
    if (!el) return;
    el.querySelector('.au-toast-text').textContent = message;
    el.classList.add('au-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('au-toast-show'); }, 2200);
  }

  function addToCart(productId, btn, productName) {
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
      if (data.ok) {
        pulse(btn);
        toast((productName ? productName + ' added' : 'Added') + ' to your bag');
      }
      if (isQuick) {
        if (data.ok) {
          btn.innerHTML = CHECK_ICON;
          setTimeout(function () { btn.innerHTML = BAG_ICON; btn.disabled = false; }, 1300);
        } else {
          btn.disabled = false;
        }
      } else {
        btn.textContent = data.ok ? 'Added ✓' : 'Unavailable';
        setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 1300);
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
      var quickName = quick.closest('.product-card');
      addToCart(quick.dataset.productId, quick, quickName && quickName.querySelector('[data-product-name]') ? quickName.querySelector('[data-product-name]').textContent : null);
      return;
    }
    var add = e.target.closest('.product-card-add');
    if (add) {
      e.preventDefault();
      var addName = add.closest('.product-card');
      addToCart(add.dataset.productId, add, addName && addName.querySelector('[data-product-name]') ? addName.querySelector('[data-product-name]').textContent : null);
    }
  });

  // --- Scroll-reveal: fade+rise sections into place the first time they
  // enter the viewport. No-op (content already visible) if the browser
  // lacks IntersectionObserver, or the user prefers reduced motion.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('au-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.au-reveal').forEach(function (el) { revealObserver.observe(el); });
  } else {
    document.querySelectorAll('.au-reveal').forEach(function (el) { el.classList.add('au-in'); });
  }
})();
