/* Auréalis admin — shared interaction layer.
   Toasts, confirm dialog, unsaved-changes guard, AJAX saving, quick-jump palette, formatting toolbar, image upload.
   Everything degrades: forms are plain POSTs that redirect with a flash message when JS is off. */
(function () {
  'use strict';
  var boot = window.ADM || { csrf: '', flash: null, items: [] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- toasts ---------- */
  var toasts = $('#toasts');
  function toast(msg, type) {
    if (!toasts || !msg) return;
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'error' || type === 'err' ? ' err' : '');
    t.setAttribute('role', type === 'error' || type === 'err' ? 'alert' : 'status');
    t.textContent = msg;
    toasts.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('is-on'); }); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 450); }, type === 'error' ? 6000 : 3200);
  }
  if (boot.flash && boot.flash.message) toast(boot.flash.message, boot.flash.type);

  /* ---------- small fetch helper ---------- */
  function post(url, data, opts) {
    opts = opts || {};
    var isMultipart = typeof FormData !== 'undefined' && data instanceof FormData;           // file uploads (multer)
    var isUrl = typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams;   // plain forms (Express urlencoded)
    var headers = { 'Accept': 'application/json', 'X-CSRF-Token': boot.csrf };
    var body;
    if (isMultipart) body = data;
    else if (isUrl) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = data.toString(); }
    else { headers['Content-Type'] = 'application/json'; body = JSON.stringify(data || {}); }
    return fetch(url, { method: 'POST', headers: headers, body: body, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, message: r.status === 403 ? 'Your session expired. Refresh the page and sign in again.' : 'Unexpected response (' + r.status + ').' };
      }).then(function (j) { j.status = r.status; return j; });
    });
  }

  /* ---------- confirm dialog ---------- */
  var cEl = $('#confirm'), cT = $('#confirm-t'), cP = $('#confirm-p'), cYes = $('#confirm-yes'), cNo = $('#confirm-no');
  var cResolve = null, cReturn = null;
  function confirmBox(o) {
    return new Promise(function (resolve) {
      cT.textContent = o.title || 'Are you sure?';
      cP.textContent = o.message || '';
      cYes.textContent = o.yes || 'Confirm';
      cYes.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-solid');
      cReturn = document.activeElement;
      cEl.classList.add('is-on'); cEl.setAttribute('aria-hidden', 'false');
      cResolve = resolve; cYes.focus();
    });
  }
  function closeConfirm(v) {
    cEl.classList.remove('is-on'); cEl.setAttribute('aria-hidden', 'true');
    if (cReturn && cReturn.focus) cReturn.focus();
    if (cResolve) { var r = cResolve; cResolve = null; r(v); }
  }
  if (cEl) {
    cYes.addEventListener('click', function () { closeConfirm(true); });
    cNo.addEventListener('click', function () { closeConfirm(false); });
    cEl.addEventListener('click', function (e) { if (e.target === cEl) closeConfirm(false); });
  }
  // [data-confirm="message"] on a form (or a submit button) asks first.
  document.addEventListener('submit', function (e) {
    var f = e.target, btn = e.submitter;
    var msg = (btn && btn.getAttribute && btn.getAttribute('data-confirm')) || f.getAttribute('data-confirm');
    if (!msg || f.__confirmed) return;
    e.preventDefault(); e.stopImmediatePropagation();
    confirmBox({ title: (btn && btn.getAttribute('data-confirm-title')) || f.getAttribute('data-confirm-title') || 'Are you sure?', message: msg, yes: (btn && btn.getAttribute('data-confirm-yes')) || f.getAttribute('data-confirm-yes') || 'Confirm', danger: f.hasAttribute('data-danger') || (btn && btn.hasAttribute('data-danger')) })
      .then(function (ok) { if (!ok) return; f.__confirmed = true; if (f.requestSubmit) f.requestSubmit(btn || undefined); else f.submit(); setTimeout(function () { f.__confirmed = false; }, 50); });
  }, true);

  /* ---------- dirty guard + save bar ---------- */
  var bar = $('#savebar'), barSave = $('#savebar-save'), barDiscard = $('#savebar-discard'), barMsg = $('#savebar-msg');
  var dirty = new Set();
  function snapshot(f) { return $$('input,textarea,select', f).filter(function (el) { return el.name && el.type !== 'file' && el.type !== 'submit'; }).map(function (el) { return el.name + '=' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value); }).join('&'); }
  function setDirty(f, v) { if (v) dirty.add(f); else dirty.delete(f); if (bar) bar.classList.toggle('is-on', dirty.size > 0); if (barMsg) barMsg.textContent = dirty.size > 1 ? dirty.size + ' sections have unsaved changes' : 'You have unsaved changes'; }
  $$('form[data-guard]').forEach(function (f) {
    var base = snapshot(f);
    f.__base = function () { base = snapshot(f); setDirty(f, false); };
    function check() { setDirty(f, snapshot(f) !== base); }
    f.addEventListener('input', check); f.addEventListener('change', check);
    f.addEventListener('adm:saved', function () { f.__base(); });
  });
  if (barSave) barSave.addEventListener('click', function () { var f = Array.from(dirty)[0]; if (f && f.requestSubmit) f.requestSubmit(); });
  if (barDiscard) barDiscard.addEventListener('click', function () { confirmBox({ title: 'Discard changes?', message: 'Your edits on this page will be lost.', yes: 'Discard', danger: true }).then(function (ok) { if (ok) { dirty.clear(); location.reload(); } }); });
  window.addEventListener('beforeunload', function (e) { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      var f = Array.from(dirty)[0] || $('form[data-main-form]');
      if (f && f.requestSubmit) f.requestSubmit();
    }
  });

  /* ---------- AJAX forms ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.hasAttribute || !f.hasAttribute('data-ajax') || e.defaultPrevented) return;
    e.preventDefault();
    var btn = e.submitter || $('button[type="submit"]', f);
    if (btn) btn.classList.add('is-busy');
    var fd = new URLSearchParams(new FormData(f));
    if (e.submitter && e.submitter.name) fd.append(e.submitter.name, e.submitter.value);
    post(f.getAttribute('action') || location.pathname, fd).then(function (j) {
      if (btn) btn.classList.remove('is-busy');
      if (j.ok) {
        toast(j.message || 'Saved.');
        f.dispatchEvent(new CustomEvent('adm:saved', { detail: j }));
        if (j.redirect) location.href = j.redirect;
        else if (f.hasAttribute('data-reload')) location.reload();
      } else toast(j.message || 'Could not save. Please try again.', 'error');
    }).catch(function () { if (btn) btn.classList.remove('is-busy'); toast('Network problem — nothing was saved.', 'error'); });
  });

  /* ---------- switches that save on click ---------- */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input[data-toggle-url]')) return;
    var prev = !el.checked;
    el.disabled = true;
    post(el.getAttribute('data-toggle-url'), { field: el.getAttribute('data-field'), value: (el.hasAttribute('data-invert') ? !el.checked : el.checked) ? 1 : 0 }).then(function (j) {
      el.disabled = false;
      if (!j.ok) { el.checked = prev; toast(j.message || 'Could not update.', 'error'); return; }
      toast(j.message || 'Updated.');
      el.dispatchEvent(new CustomEvent('adm:toggled', { bubbles: true, detail: j }));
    }).catch(function () { el.disabled = false; el.checked = prev; toast('Network problem — nothing was saved.', 'error'); });
  });

  /* ---------- mobile nav ---------- */
  var adm = $('#adm');
  function navOpen(v) { if (adm) adm.classList.toggle('nav-open', v); var b = $('#adm-burger'); if (b) b.setAttribute('aria-expanded', v ? 'true' : 'false'); }
  var burger = $('#adm-burger'); if (burger) burger.addEventListener('click', function () { navOpen(!adm.classList.contains('nav-open')); });
  $$('[data-nav-close]').forEach(function (el) { el.addEventListener('click', function () { navOpen(false); }); });

  /* ---------- quick-jump palette (Ctrl/Cmd + K) ---------- */
  var pal = $('#palette'), palQ = $('#palette-q'), palList = $('#palette-list'), palIdx = 0, palShown = [];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function palRender() {
    var q = (palQ.value || '').trim().toLowerCase();
    // Titles that start with what was typed come first, then titles that contain it, then matches on the kind (Page, Setting…).
    var rank = function (it) { var t = it.t.toLowerCase(); return !q ? 0 : t.indexOf(q) === 0 ? 0 : t.indexOf(q) > -1 ? 1 : 2; };
    palShown = (boot.items || []).filter(function (it) { return !q || it.t.toLowerCase().indexOf(q) > -1 || (it.k || '').toLowerCase().indexOf(q) > -1; })
      .map(function (it, i) { return { it: it, r: rank(it), i: i }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (x) { return x.it; }).slice(0, 40);
    if (palIdx >= palShown.length) palIdx = 0;
    palList.innerHTML = palShown.length ? palShown.map(function (it, i) { return '<li class="' + (i === palIdx ? 'is-on' : '') + '"><a href="' + esc(it.u) + '"' + (it.u.indexOf('/admin') !== 0 && it.u.indexOf('http') !== 0 && it.u !== '/' ? '' : '') + '>' + esc(it.t) + '<small>' + esc(it.k || '') + '</small></a></li>'; }).join('') : '<li class="none">Nothing matches “' + esc(q) + '”.</li>';
  }
  function palOpen(v) {
    if (!pal) return;
    pal.classList.toggle('is-on', v); pal.setAttribute('aria-hidden', v ? 'false' : 'true');
    if (v) { palQ.value = ''; palIdx = 0; palRender(); setTimeout(function () { palQ.focus(); }, 30); }
  }
  var sb = $('#adm-search'); if (sb) sb.addEventListener('click', function () { palOpen(true); });
  if (pal) {
    pal.addEventListener('click', function (e) { if (e.target === pal) palOpen(false); });
    palQ.addEventListener('input', function () { palIdx = 0; palRender(); });
    palQ.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palIdx + 1, palShown.length - 1); palRender(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); palRender(); }
      else if (e.key === 'Enter' && palShown[palIdx]) { e.preventDefault(); var u = palShown[palIdx].u; palOpen(false); if (u === '/' || u.indexOf('/admin/backup') === 0) window.open(u, '_blank'); else location.href = u; }
    });
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palOpen(!(pal && pal.classList.contains('is-on'))); }
    else if (e.key === 'Escape') { if (cEl && cEl.classList.contains('is-on')) closeConfirm(false); else if (pal && pal.classList.contains('is-on')) palOpen(false); else navOpen(false); }
  });

  /* ---------- character counters: <input data-max="120"> ---------- */
  $$('[data-max]').forEach(function (el) {
    var max = +el.getAttribute('data-max');
    var lab = el.closest('.fld') && $('label', el.closest('.fld'));
    if (!lab) return;
    var c = document.createElement('span'); c.className = 'counter'; lab.appendChild(c);
    function upd() { var n = el.value.length; c.textContent = n + ' / ' + max; c.classList.toggle('is-over', n > max); }
    el.addEventListener('input', upd); upd();
  });

  /* ---------- formatting toolbar (matches lib/richtext.js) ---------- */
  $$('.rt').forEach(function (box) {
    var bar = $('.rt-bar', box), ta = $('textarea', box);
    if (!bar || !ta) return;
    function edit(fn) { var s = ta.selectionStart, e2 = ta.selectionEnd, v = ta.value; var r = fn(v.slice(0, s), v.slice(s, e2), v.slice(e2)); ta.value = r.text; ta.focus(); ta.setSelectionRange(r.start, r.end); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    function wrap(mark, ph) { edit(function (b, sel, a) { var t = sel || ph; return { text: b + mark + t + mark + a, start: b.length + mark.length, end: b.length + mark.length + t.length }; }); }
    function prefix(pre, ph) {
      edit(function (b, sel, a) {
        var head = b.slice(0, b.lastIndexOf('\n') + 1), lead = b.slice(head.length);
        var rest = a.indexOf('\n') < 0 ? a : a.slice(0, a.indexOf('\n')), tail = a.slice(rest.length);
        var block = lead + sel + rest; if (!block.trim()) block = ph;
        var out = block.split('\n').map(function (l) { return pre + l.replace(/^(#{2,3}\s+|[-•]\s+)/, ''); }).join('\n');
        return { text: head + out + tail, start: head.length + pre.length, end: head.length + out.length };
      });
    }
    bar.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-fmt]'); if (!btn) return; var f = btn.getAttribute('data-fmt');
      if (f === 'bold') wrap('**', 'bold text'); else if (f === 'italic') wrap('*', 'italic text');
      else if (f === 'h2') prefix('## ', 'Heading'); else if (f === 'h3') prefix('### ', 'Sub-heading'); else if (f === 'ul') prefix('- ', 'List item');
      else if (f === 'link') edit(function (b, sel, a) { var label = sel || 'link text', url = 'https://', pos = b.length + label.length + 3; return { text: b + '[' + label + '](' + url + ')' + a, start: pos, end: pos + url.length }; });
      else if (f === 'para') edit(function (b, sel, a) { var ins = !b || /\n\n$/.test(b) ? '' : (/\n$/.test(b) ? '\n' : '\n\n'); var pos = b.length + ins.length; return { text: b + ins + sel + a, start: pos, end: pos + sel.length }; });
    });
  });

  /* ---------- image upload: <div class="imgup" data-upload-url="..."> ---------- */
  $$('.imgup[data-upload-url]').forEach(function (box) {
    var input = $('input[type="file"]', box), img = $('img', box), ph = $('.ph', box), status = $('.imgup-status', box);
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files[0]; if (!file) return;
      var fd = new FormData(); fd.append('image', file);
      if (status) status.textContent = 'Uploading…';
      post(box.getAttribute('data-upload-url'), fd).then(function (j) {
        if (j.ok) {
          if (img) { img.src = j.url; img.hidden = false; } if (ph) ph.hidden = true;
          if (status) status.textContent = 'Saved.'; toast('Image saved.');
          box.dispatchEvent(new CustomEvent('adm:uploaded', { bubbles: true, detail: j }));
        } else { if (status) status.textContent = j.message || 'Upload failed.'; toast(j.message || 'Upload failed.', 'error'); }
      }).catch(function () { if (status) status.textContent = 'Upload failed.'; toast('Upload failed.', 'error'); });
    });
  });

  /* ---------- editor table of contents: highlight the section in view ---------- */
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {}; tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) { tocLinks.forEach(function (a) { a.classList.remove('is-on'); }); map[en.target.id].classList.add('is-on'); } }); }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  window.ADMUI = { toast: toast, confirm: confirmBox, post: post, setDirty: setDirty, $: $, $$: $$, esc: esc };
})();
