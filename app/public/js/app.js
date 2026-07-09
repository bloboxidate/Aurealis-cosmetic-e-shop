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
})();
