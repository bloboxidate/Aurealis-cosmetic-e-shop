// Small HTML builders for the admin forms, so every page produces the same, correctly escaped markup.
// Each returns a string meant for <%- ... %>. Values are always escaped here.
const { esc } = require('./richtext');

const attr = (o) => Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== false && o[k] !== null)
  .map((k) => (o[k] === true ? k : `${k}="${esc(o[k])}"`)).join(' ');

function wrap(id, label, control, o = {}) {
  return `<div class="fld"><label for="${esc(id)}">${esc(label)}${o.opt ? ' <span class="opt">optional</span>' : ''}</label>${control}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
}

// One-line text. o: { max, hint (trusted HTML), placeholder, opt, type }
function text(name, label, value, o = {}) {
  const id = 'f-' + name;
  return wrap(id, label, `<input class="input" id="${esc(id)}" ${attr({ name, type: o.type || 'text', value: value == null ? '' : value, placeholder: o.placeholder, 'data-max': o.max, autocomplete: 'off', spellcheck: o.spell === false ? 'false' : undefined })}>`, o);
}

// Several lines, plain.
function area(name, label, value, o = {}) {
  const id = 'f-' + name;
  return wrap(id, label, `<textarea class="textarea" id="${esc(id)}" ${attr({ name, rows: o.rows || 4, placeholder: o.placeholder, 'data-max': o.max })}>${esc(value == null ? '' : value)}</textarea>`, o);
}

// Text with the formatting toolbar (what lib/richtext.js renders).
function rich(name, label, value, o = {}) {
  const id = 'f-' + name;
  const bar = '<div class="rt-bar" role="toolbar" aria-label="Formatting">'
    + '<button type="button" data-fmt="bold" title="Bold"><b>B</b></button><button type="button" data-fmt="italic" title="Italic"><i>I</i></button>'
    + '<button type="button" data-fmt="h2" title="Heading">H2</button><button type="button" data-fmt="h3" title="Sub-heading">H3</button>'
    + '<button type="button" data-fmt="ul" title="Bulleted list">&bull; List</button><button type="button" data-fmt="link" title="Link">Link</button>'
    + '<button type="button" data-fmt="para" title="Start a new paragraph">&para; New paragraph</button></div>';
  const hint = o.hint || 'Blank line = new paragraph &middot; <code>## Heading</code> &middot; <code>- bullet</code> &middot; <code>**bold**</code> &middot; <code>*italic*</code> &middot; <code>[link](https://&hellip;)</code>';
  return wrap(id, label, `<div class="rt">${bar}<textarea class="textarea" id="${esc(id)}" ${attr({ name, rows: o.rows || 8, 'data-max': o.max })}>${esc(value == null ? '' : value)}</textarea></div>`, { ...o, hint });
}

// An on/off switch that submits "1" or "0" with its form (the hidden input makes "off" arrive too).
function toggle(name, checked, o = {}) {
  return `<label class="switch${o.sm ? ' sm' : ''}"><input type="hidden" name="${esc(name)}" value="0"><input ${attr({ type: 'checkbox', name, value: '1', checked: !!checked, 'aria-label': o.label })}><span class="track"></span></label>`;
}

// A titled row with a switch on the right.
function toggleRow(name, title, desc, checked) {
  return `<div class="toggle-row"><div><div class="t">${esc(title)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ''}</div>${toggle(name, checked, { label: title })}</div>`;
}

module.exports = { text, area, rich, toggle, toggleRow, esc };
