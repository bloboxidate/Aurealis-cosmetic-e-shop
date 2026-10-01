/* Auréalis — shop search suggestions. Progressive enhancement: the search box is a normal GET form; this adds
 * suggestions as you type from the catalog embedded in the page (no extra requests). Keyboard: Up/Down to move,
 * Enter to open the highlighted product (or search), Escape to close. */
(function () {
  'use strict';
  var input = document.querySelector('form[action="/shop"] input[name="q"]');
  var dataEl = document.getElementById('au-search-data');
  if (!input || !dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!data || !data.length) return;

  var form = input.form;
  var wrap = document.createElement('div');
  wrap.className = 'au-suggest-wrap';
  wrap.style.cssText = 'position:relative;flex:1 1 160px;min-width:0';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.style.width = '100%';
  var list = document.createElement('ul');
  list.id = 'au-suggest'; list.className = 'au-suggest'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Suggestions'); list.hidden = true;
  wrap.appendChild(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'au-suggest'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('autocomplete', 'off');

  var active = -1;
  function items() { return Array.prototype.slice.call(list.children); }
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function setActive(i) {
    var li = items();
    li.forEach(function (el, k) { el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    active = i;
    if (i >= 0) input.setAttribute('aria-activedescendant', li[i].id); else input.removeAttribute('aria-activedescendant');
  }
  function render() {
    var q = input.value.trim().toLowerCase();
    if (!q) { close(); return; }
    var hits = data.filter(function (p) { return p.n.toLowerCase().indexOf(q) !== -1 || (p.t && p.t.toLowerCase().indexOf(q) !== -1); });
    list.innerHTML = '';
    hits.slice(0, 5).forEach(function (p, i) {
      var li = document.createElement('li'); li.id = 'au-opt-' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
      var a = document.createElement('a'); a.href = '/product/' + encodeURIComponent(p.s);
      if (p.i) { var im = document.createElement('img'); im.src = p.i; im.alt = ''; im.width = 44; im.height = 44; im.loading = 'lazy'; a.appendChild(im); }
      var t = document.createElement('span'); t.className = 'au-suggest-t';
      var n = document.createElement('b'); n.textContent = p.n; t.appendChild(n);
      var pr = document.createElement('span'); pr.textContent = p.p; t.appendChild(pr);
      a.appendChild(t); li.appendChild(a); list.appendChild(li);
    });
    if (!hits.length) {
      var none = document.createElement('li'); none.className = 'au-suggest-none'; none.textContent = 'No products match “' + input.value.trim() + '”.'; list.appendChild(none);
    }
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(-1);
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', function () { if (input.value.trim()) render(); });
  input.addEventListener('keydown', function (e) {
    var n = items().filter(function (li) { return li.getAttribute('role') === 'option'; }).length;
    if (e.key === 'ArrowDown' && !list.hidden && n) { e.preventDefault(); setActive((active + 1) % n); }
    else if (e.key === 'ArrowUp' && !list.hidden && n) { e.preventDefault(); setActive((active - 1 + n) % n); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); var a = items()[active].querySelector('a'); if (a) window.location.href = a.href; }
    else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); close(); }
  });
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
  form.addEventListener('submit', close);
})();
