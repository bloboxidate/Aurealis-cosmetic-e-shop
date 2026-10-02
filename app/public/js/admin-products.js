/* Auréalis admin — the Products manager. Renders the list from window.ADM_PRODUCTS and keeps it in step with the server:
   search, filters, switches that save on click, bulk actions, drag / keyboard / touch reordering, and the edit drawer. */
(function () {
  'use strict';
  var U = window.ADMUI, D = window.ADM_PRODUCTS;
  if (!U || !D) return;
  var $ = U.$, $$ = U.$$, esc = U.esc;
  var items = D.items, cats = D.categories, subs = D.subcategories;
  var byId = {}; items.forEach(function (p) { byId[p.id] = p; });
  var catName = {}; cats.forEach(function (c) { catName[c.slug] = c.name; });
  var subName = {}; subs.forEach(function (s) { subName[s.slug] = s.name; });

  var listEl = $('#plist'), searchEl = $('#psearch'), filtersEl = $('#pfilters'), noteEl = $('#pnote');
  var bulk = $('#pbulk'), bulkN = $('#pbulk-n'), selAll = $('#pselall');
  var state = { filter: 'all', q: '' };
  var selected = new Set();

  var FILTERS = [
    ['all', 'All', function () { return true; }],
    ['visible', 'Visible', function (p) { return !p.hidden; }],
    ['hidden', 'Hidden', function (p) { return p.hidden; }],
    ['featured', 'Featured', function (p) { return p.featured; }],
    ['bestseller', 'Bestsellers', function (p) { return p.bestseller; }],
    ['nocat', 'No category', function (p) { return !p.cats.length; }],
  ];
  function money(c) { var v = c / 100; return 'EGP ' + (Number.isInteger(v) ? v : v.toFixed(2)); }
  function matches(p) {
    var f = FILTERS.filter(function (x) { return x[0] === state.filter; })[0];
    if (f && !f[2](p)) return false;
    var q = state.q.trim().toLowerCase();
    return !q || (p.name + ' ' + p.slug + ' ' + (p.subtitle || '')).toLowerCase().indexOf(q) > -1;
  }
  function shown() { return items.filter(matches); }
  var reorderable = function () { return state.filter === 'all' && !state.q.trim(); };

  /* ---------- rendering ---------- */
  var GRIP = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3.5" r="1.4"/><circle cx="11" cy="3.5" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="12.5" r="1.4"/><circle cx="11" cy="12.5" r="1.4"/></svg>';
  function sw(p, field, label, on, invert) {
    return '<label class="flag"><span class="switch sm"><input type="checkbox" data-toggle-url="/admin/products/' + encodeURIComponent(p.id) + '/toggle" data-field="' + field + '"' + (invert ? ' data-invert="1"' : '') + (on ? ' checked' : '') + ' aria-label="' + esc(label) + ': ' + esc(p.name) + '"><span class="track"></span></span>' + label + '</label>';
  }
  function catChips(p) {
    if (!p.cats.length) return '<span class="pill warn">No category</span>';
    return p.cats.map(function (c) { return '<span class="pill">' + esc(catName[c.c] || c.c) + (c.s ? ' · ' + esc(subName[c.s] || c.s) : '') + '</span>'; }).join('');
  }
  function rowHtml(p) {
    var stock = p.stock > 0 ? p.stock + ' in stock' : '<span style="color:#9a5b0a;font-weight:800">0 in stock</span>';
    return '<div class="prow' + (p.hidden ? ' is-hidden' : '') + (selected.has(p.id) ? ' is-sel' : '') + '" data-id="' + esc(p.id) + '" id="p-' + esc(p.id) + '">'
      + '<button type="button" class="grip" aria-label="Reorder ' + esc(p.name) + ' (arrow up or down)" title="Drag, or press the arrow keys, to reorder">' + GRIP + '</button>'
      + '<div class="cb-cell"><input type="checkbox" class="cb" data-sel aria-label="Select ' + esc(p.name) + '"' + (selected.has(p.id) ? ' checked' : '') + '></div>'
      + '<div class="pthumb">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '') + '</div>'
      + '<div style="min-width:0"><div class="pname">' + esc(p.name) + (p.extras.badge ? ' <span class="pill night">' + esc(p.extras.badge) + '</span>' : '') + '</div><div class="pmeta">' + money(p.price) + ' · ' + stock + '</div></div>'
      + '<div class="pcats">' + catChips(p) + '</div>'
      + '<div class="pflags">' + sw(p, 'is_hidden', 'Visible', !p.hidden, true) + sw(p, 'is_featured', 'Featured', p.featured) + sw(p, 'is_bestseller', 'Best', p.bestseller) + '</div>'
      + '<button type="button" class="btn btn-sm" data-edit>Edit</button>'
      + '</div>';
  }
  function renderFilters() {
    filtersEl.innerHTML = FILTERS.map(function (f) {
      var n = items.filter(f[2]).length;
      return '<button type="button" class="chip' + (state.filter === f[0] ? ' is-on' : '') + '" data-filter="' + f[0] + '">' + f[1] + ' <span class="n">' + n + '</span></button>';
    }).join('');
  }
  function render() {
    var list = shown();
    renderFilters();
    if (!items.length) { listEl.innerHTML = '<div class="empty"><div class="big">No products found</div><div>Add products in Sariee and they will appear here.</div></div>'; noteEl.textContent = ''; return; }
    if (!list.length) { listEl.innerHTML = '<div class="empty"><div class="big">Nothing matches</div><div>Try a different search or filter.</div></div>'; }
    else listEl.innerHTML = '<div class="phead"><span></span><span></span><span></span><span>Product</span><span>Categories</span><span>In the store</span><span></span></div>' + list.map(rowHtml).join('');
    listEl.classList.toggle('no-drag', !reorderable());
    $$('.grip', listEl).forEach(function (g) { g.disabled = !reorderable(); g.style.opacity = reorderable() ? '' : '.3'; g.style.cursor = reorderable() ? '' : 'not-allowed'; });
    noteEl.textContent = reorderable() ? 'Drag the handle (or focus it and press the arrow keys) to reorder. This is the order shown in the store.' : 'Clear the search and filter to reorder products.';
    updateBulk();
  }

  /* ---------- search + filters ---------- */
  searchEl.addEventListener('input', function () { state.q = searchEl.value; render(); });
  filtersEl.addEventListener('click', function (e) { var b = e.target.closest('[data-filter]'); if (!b) return; state.filter = b.getAttribute('data-filter'); render(); });

  /* ---------- selection + bulk ---------- */
  function updateBulk() {
    var n = selected.size;
    bulk.hidden = n === 0;
    bulkN.textContent = n + ' selected';
    var list = shown();
    selAll.checked = list.length > 0 && list.every(function (p) { return selected.has(p.id); });
  }
  listEl.addEventListener('change', function (e) {
    var cb = e.target.closest('[data-sel]'); if (!cb) return;
    var row = cb.closest('.prow'), id = row.getAttribute('data-id');
    if (cb.checked) selected.add(id); else selected.delete(id);
    row.classList.toggle('is-sel', cb.checked); updateBulk();
  });
  selAll.addEventListener('change', function () {
    shown().forEach(function (p) { if (selAll.checked) selected.add(p.id); else selected.delete(p.id); });
    render();
  });
  $('#pbulk-clear').addEventListener('click', function () { selected.clear(); render(); });
  bulk.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bulk]'); if (!b) return;
    var action = b.getAttribute('data-bulk'), value = '';
    if (action === 'add_category' || action === 'remove_category') { value = ($('#pbulk-cat') || {}).value; if (!value) { U.toast('Choose a category first.', 'error'); return; } }
    var ids = Array.from(selected);
    var go = function () {
      b.classList.add('is-busy');
      U.post('/admin/products/bulk', { ids: ids, action: action, value: value }).then(function (j) {
        b.classList.remove('is-busy');
        if (j.ok) { U.toast(j.message || 'Updated.'); setTimeout(function () { location.reload(); }, 500); } else U.toast(j.message || 'Could not update.', 'error');
      }).catch(function () { b.classList.remove('is-busy'); U.toast('Network problem — nothing was changed.', 'error'); });
    };
    if (action === 'hide' && ids.length > 1) U.confirm({ title: 'Hide ' + ids.length + ' products?', message: 'They will disappear from the whole store until you show them again.', yes: 'Hide them' }).then(function (ok) { if (ok) go(); });
    else go();
  });

  /* ---------- switches (saved by admin.js; keep our state and row in step) ---------- */
  document.addEventListener('adm:toggled', function (e) {
    var el = e.target, row = el.closest && el.closest('.prow'); if (!row) return;
    var p = byId[row.getAttribute('data-id')], f = el.getAttribute('data-field'); if (!p) return;
    if (f === 'is_hidden') { p.hidden = !el.checked; row.classList.toggle('is-hidden', p.hidden); }
    if (f === 'is_featured') p.featured = el.checked;
    if (f === 'is_bestseller') p.bestseller = el.checked;
    renderFilters();
  });

  /* ---------- reordering: mouse, touch and keyboard ---------- */
  var saveTimer = null;
  function saveOrder() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ids = $$('.prow', listEl).map(function (r) { return r.getAttribute('data-id'); });
      items.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
      U.post('/admin/products/order', { ids: ids }).then(function (j) { U.toast(j.ok ? 'Order saved.' : (j.message || 'Could not save the order.'), j.ok ? '' : 'error'); }).catch(function () { U.toast('Network problem — the order was not saved.', 'error'); });
    }, 500);
  }
  var drag = null;
  listEl.addEventListener('pointerdown', function (e) {
    var g = e.target.closest('.grip'); if (!g || g.disabled || !reorderable()) return;
    e.preventDefault();
    var row = g.closest('.prow'); drag = { row: row, id: e.pointerId, g: g };
    lastY = e.clientY;
    row.classList.add('is-dragging'); g.setPointerCapture(e.pointerId);
  });
  // Dragging near the top or bottom edge of the screen scrolls the page, so a long list can be reordered by touch.
  var scrollTimer = null, lastY = 0;
  function autoScroll() {
    if (!drag) { clearInterval(scrollTimer); scrollTimer = null; return; }
    var edge = 90, step = lastY < edge ? -(edge - lastY) / 5 : lastY > innerHeight - edge ? (lastY - (innerHeight - edge)) / 5 : 0;
    if (step) window.scrollBy(0, Math.max(-22, Math.min(22, step)));
  }
  listEl.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    lastY = e.clientY;
    if (!scrollTimer) scrollTimer = setInterval(autoScroll, 16);
    var rows = $$('.prow', listEl);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (r === drag.row) continue;
      var b = r.getBoundingClientRect();
      if (e.clientY > b.top && e.clientY < b.bottom) {
        var after = e.clientY > b.top + b.height / 2;
        listEl.insertBefore(drag.row, after ? r.nextSibling : r);
        break;
      }
    }
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag.row.classList.remove('is-dragging'); drag = null; saveOrder();
  }
  listEl.addEventListener('pointerup', endDrag); listEl.addEventListener('pointercancel', endDrag);
  listEl.addEventListener('keydown', function (e) {
    var g = e.target.closest('.grip'); if (!g || !reorderable()) return;
    var row = g.closest('.prow');
    if (e.key === 'ArrowUp' && row.previousElementSibling && row.previousElementSibling.classList.contains('prow')) { e.preventDefault(); listEl.insertBefore(row, row.previousElementSibling); g.focus(); saveOrder(); }
    else if (e.key === 'ArrowDown' && row.nextElementSibling) { e.preventDefault(); listEl.insertBefore(row.nextElementSibling, row); g.focus(); saveOrder(); }
  });

  /* ---------- the edit drawer ---------- */
  var drawer = $('#pdrawer'), scrim = $('#pscrim'), cur = null, lastFocus = null;
  function snip(s) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 140 ? s.slice(0, 140) + '…' : s; }
  function openDrawer(id) {
    var p = byId[id]; if (!p) return; cur = p; lastFocus = document.activeElement;
    $('#pd-title').textContent = p.name;
    $('#pd-meta').textContent = money(p.price) + (p.stock > 0 ? ' · ' + p.stock + ' in stock' : ' · 0 in stock');
    $('#pd-thumb').innerHTML = p.image ? '<img src="' + esc(p.image) + '" alt="">' : '';
    $('#pd-view').href = '/product/' + encodeURIComponent(p.slug);
    $('#pd-visible').checked = !p.hidden; $('#pd-featured').checked = p.featured; $('#pd-bestseller').checked = p.bestseller;
    $('#pd-badge').value = p.extras.badge || '';
    [['details', '#pd-details'], ['how_to_use', '#pd-how'], ['ingredients', '#pd-ing']].forEach(function (m) {
      var ta = $(m[1]); ta.value = p.extras[m[0]] || ''; ta.placeholder = p.sariee[m[0]] ? snip(p.sariee[m[0]]) : 'Nothing from Sariee yet — write it here.';
    });
    $('#pd-cats').innerHTML = cats.map(function (c) {
      var mine = p.cats.filter(function (x) { return x.c === c.slug; })[0];
      var cs = subs.filter(function (s) { return s.category_id === c.id; });
      return '<label><input type="checkbox" class="cb" data-cat="' + esc(c.slug) + '"' + (mine ? ' checked' : '') + '> ' + esc(c.name)
        + (cs.length ? '<select class="select" data-sub="' + esc(c.slug) + '" aria-label="Subcategory of ' + esc(c.name) + '"><option value="">No subcategory</option>' + cs.map(function (s) { return '<option value="' + esc(s.slug) + '"' + (mine && mine.s === s.slug ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' : '') + '</label>';
    }).join('');
    drawer.classList.add('is-on'); scrim.classList.add('is-on'); drawer.setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('#pd-visible').focus(); }, 350);
  }
  function closeDrawer() {
    drawer.classList.remove('is-on'); scrim.classList.remove('is-on'); drawer.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus(); cur = null;
  }
  listEl.addEventListener('click', function (e) { var b = e.target.closest('[data-edit]'); if (b) openDrawer(b.closest('.prow').getAttribute('data-id')); });
  scrim.addEventListener('click', closeDrawer); $('#pd-close').addEventListener('click', closeDrawer); $('#pd-cancel').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('is-on') && !$('#confirm').classList.contains('is-on') && !$('#palette').classList.contains('is-on')) closeDrawer(); });

  $('#pd-save').addEventListener('click', function () {
    if (!cur) return; var p = cur, btn = $('#pd-save'); btn.classList.add('is-busy');
    var place = new URLSearchParams();
    if (!$('#pd-visible').checked) place.append('is_hidden', 'on');
    if ($('#pd-featured').checked) place.append('is_featured', 'on');
    if ($('#pd-bestseller').checked) place.append('is_bestseller', 'on');
    var newCats = [];
    $$('#pd-cats [data-cat]').forEach(function (cb) {
      if (!cb.checked) return; var slug = cb.getAttribute('data-cat'), sel = $('#pd-cats select[data-sub="' + slug + '"]');
      place.append('cat_' + slug, 'on'); if (sel && sel.value) place.append('subcat_' + slug, sel.value);
      newCats.push({ c: slug, s: sel ? sel.value : '' });
    });
    var extra = new URLSearchParams();
    extra.append('badge', $('#pd-badge').value); extra.append('details', $('#pd-details').value); extra.append('how_to_use', $('#pd-how').value); extra.append('ingredients', $('#pd-ing').value);
    var id = encodeURIComponent(p.id);
    U.post('/admin/products/' + id, place).then(function (a) {
      if (!a.ok) throw new Error(a.message || 'Could not save the product.');
      return U.post('/admin/products/' + id + '/extras', extra);
    }).then(function (b) {
      btn.classList.remove('is-busy');
      if (!b.ok) throw new Error(b.message || 'Could not save the text.');
      p.hidden = !$('#pd-visible').checked; p.featured = $('#pd-featured').checked; p.bestseller = $('#pd-bestseller').checked; p.cats = newCats;
      p.extras = { badge: $('#pd-badge').value.trim(), details: $('#pd-details').value.trim(), how_to_use: $('#pd-how').value.trim(), ingredients: $('#pd-ing').value.trim() };
      render(); closeDrawer(); U.toast('Saved ' + p.name + '.');
    }).catch(function (err) { btn.classList.remove('is-busy'); U.toast(err.message || 'Network problem — nothing was saved.', 'error'); });
  });

  /* ---------- start ---------- */
  var qs = new URLSearchParams(location.search);
  if (FILTERS.some(function (f) { return f[0] === qs.get('filter'); })) state.filter = qs.get('filter');
  render();
  if (qs.get('open') && byId[qs.get('open')]) { var r = $('#p-' + (window.CSS && CSS.escape ? CSS.escape(qs.get('open')) : qs.get('open'))); if (r) r.scrollIntoView({ block: 'center' }); openDrawer(qs.get('open')); }
})();
