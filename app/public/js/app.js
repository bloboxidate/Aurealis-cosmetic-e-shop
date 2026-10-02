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

    function showImage(index, dir) {
      var before = current;
      current = (index + thumbs.length) % thumbs.length; // wrap around both ends
      var thumb = thumbs[current];
      // With the motion system, images wipe into each other (motion.js); otherwise a plain cross-fade.
      var wiped = window.AuMotion && window.AuMotion.gallerySwap && current !== before &&
        window.AuMotion.gallerySwap(mainImg, thumb.dataset.full, dir || (current > before ? 1 : -1));
      if (!wiped) {
        mainImg.style.opacity = '0';
        setTimeout(function () {
          mainImg.src = thumb.dataset.full;
          mainImg.style.opacity = '1';
        }, 220);
      }
      thumbs.forEach(function (t) { t.classList.remove('pdp-thumb-active'); });
      thumb.classList.add('pdp-thumb-active');
    }

    thumbs.forEach(function (thumb, i) {
      thumb.addEventListener('click', function () { showImage(i); });
      new Image().src = thumb.dataset.full; // warm the cache so the swap is instant
    });
    var prevBtn = document.getElementById('pdp-prev');
    var nextBtn = document.getElementById('pdp-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { showImage(current - 1, -1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { showImage(current + 1, 1); });
  }

  // --- Product page (phones): the sticky Add to Bag bar shows once the main button has scrolled away ---
  var bar = document.getElementById('pdp-bar');
  var mainAdd = document.querySelector('#add-form .btn-primary');
  if (bar && mainAdd) {
    var barTick = false;
    var barCheck = function () {
      barTick = false;
      var r = mainAdd.getBoundingClientRect();
      bar.classList.toggle('is-on', r.bottom < 0); // the main button has scrolled off the top
    };
    window.addEventListener('scroll', function () { if (!barTick) { barTick = true; requestAnimationFrame(barCheck); } }, { passive: true });
    barCheck();
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

  // --- Product cards: add-to-bag (the button below the card) ---

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
  function toast(message, isError) {
    var el = document.getElementById('au-toast');
    if (!el) return;
    el.querySelector('.au-toast-text').textContent = message;
    el.classList.toggle('au-toast-err', !!isError);
    el.classList.add('au-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('au-toast-show'); }, 2200);
  }

  // opts.body: a full urlencoded body (product page: size + qty); opts.source: the image that flies to the bag.
  window.AuApp = { toast: toast, updateCartBadge: updateCartBadge };

  function addToCart(productId, btn, productName, opts) {
    opts = opts || {};
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('au-busy'); // the Sariee round trip takes ~1s: show that something is happening
    var label = btn.textContent;

    fetch('/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: opts.body || ('product_id=' + encodeURIComponent(productId) + '&qty=1'),
    }).then(function (r) { return r.json(); }).then(function (data) {
      btn.classList.remove('au-busy');
      updateCartBadge(data.count || 0, data.ok);
      if (data.ok) {
        pulse(btn);
        toast((productName ? productName + ' added' : 'Added') + ' to your bag');
        if (opts.source && window.AuMotion && window.AuMotion.fly) window.AuMotion.fly(opts.source);
        if (window.AuSound) window.AuSound.chime();
      } else {
        toast(data.message || 'Sorry, that item could not be added.', true);
      }
      btn.textContent = data.ok ? 'Added ✓' : 'Unavailable';
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 1300);
    }).catch(function () {
      btn.classList.remove('au-busy');
      btn.textContent = label;
      btn.disabled = false;
      toast('Something went wrong. Please try again.', true);
    });
  }

  function cardImage(el) {
    var c = el.closest('.product-card');
    return c ? c.querySelector('.product-card-media img') : null;
  }

  // Product page: add without leaving the page. The product image flies to the bag; if anything about the request
  // fails, the plain form post (which redirects to the bag) takes over, so the page never gets worse.
  var addForm = document.getElementById('add-form');
  if (addForm && window.fetch && window.FormData && window.URLSearchParams) {
    addForm.addEventListener('submit', function (e) {
      var main = addForm.querySelector('.btn-primary');
      if (!main) return;
      e.preventDefault();
      if (main.disabled) return;
      var pid = addForm.querySelector('[name="product_id"]');
      var nameEl = document.querySelector('[role="heading"][aria-level="1"]');
      addToCart(pid ? pid.value : '', main, nameEl ? nameEl.textContent.trim() : null, {
        body: new URLSearchParams(new FormData(addForm)).toString(),
        source: document.getElementById('pdp-main-img')
      });
    });
  }

  // Wishlist hearts: toggle in place (optimistic), with a small bloom. Signed-out visitors are sent to sign in.
  var HEART_ON = '#c1602f', HEART_OFF = '#3a352e';
  function setHeart(btn, on) {
    var svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', on ? HEART_ON : 'none');
      svg.setAttribute('stroke', on ? HEART_ON : HEART_OFF);
      var t = on ? 'Remove from wishlist' : 'Add to wishlist';
      btn.setAttribute('aria-label', t); btn.setAttribute('title', t);
    } else {
      btn.textContent = on ? '♥ Saved to Wishlist' : '♡ Save to Wishlist';
    }
    btn.classList.remove('au-heart-pop'); void btn.offsetWidth; if (on) btn.classList.add('au-heart-pop');
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.getAttribute || form.getAttribute('action') !== '/wishlist/toggle' || !window.fetch) return;
    var btn = form.querySelector('button');
    if (!btn) return;
    e.preventDefault();
    if (btn.getAttribute('data-busy')) return;
    btn.setAttribute('data-busy', '1');
    var svg = btn.querySelector('svg');
    var was = svg ? svg.getAttribute('fill') !== 'none' : /Saved/.test(btn.textContent);
    setHeart(btn, !was);
    fetch('/wishlist/toggle', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams(new FormData(form)).toString()
    }).then(function (r) {
      if (r.redirected && /\/login/.test(r.url)) { window.location.href = r.url; throw 'login'; }
      return r.json();
    }).then(function (d) {
      btn.removeAttribute('data-busy');
      if (!d || !d.ok) throw new Error('wishlist');
      setHeart(btn, !!d.wishlisted);
      toast(d.wishlisted ? 'Saved to your wishlist' : 'Removed from your wishlist');
      var card = form.closest('.product-card');
      if (card && !d.wishlisted && window.location.pathname === '/wishlist') { // on the wishlist page, an unsaved item leaves
        card.style.transition = 'opacity .5s ease, transform .6s cubic-bezier(.16,1,.3,1)';
        card.style.opacity = '0'; card.style.transform = 'scale(.96)';
        setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 600);
      }
    }).catch(function (err) {
      if (err === 'login') return;
      btn.removeAttribute('data-busy');
      setHeart(btn, was);
      toast('Something went wrong. Please try again.', true);
    });
  });

  document.addEventListener('click', function (e) {
    var add = e.target.closest('.product-card-add');
    if (add) {
      e.preventDefault();
      var addName = add.closest('.product-card');
      addToCart(add.dataset.productId, add, addName && addName.querySelector('[data-product-name]') ? addName.querySelector('[data-product-name]').textContent : null, { source: cardImage(add) });
    }
  });

  // --- Scroll-reveal: fade+rise sections into place the first time they
  // enter the viewport. No-op (content already visible) if the browser
  // lacks IntersectionObserver, or the user prefers reduced motion.
  // When the motion system is active (html.au-motion, see motion.js) it owns
  // reveals, so this legacy fade stays out of its way.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motionOwnsReveals = document.documentElement.classList.contains('au-motion');
  if (motionOwnsReveals) {
    /* handled by motion.js */
  } else if ('IntersectionObserver' in window && !reduceMotion) {
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
