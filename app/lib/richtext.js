// Tiny, safe text-to-HTML renderer for admin-edited page copy (policies etc).
// Admins type plain text with a few easy conventions; everything is HTML-escaped
// FIRST, so nothing an admin pastes can inject markup or script.
//
//   blank line            new paragraph
//   ## Heading            section heading        ### Sub-heading
//   - item (one per line) bulleted list
//   **bold**   *italic*   [link text](https://… | /path | mailto:… | tel:…)
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^\s)]*)\)/g,
      (_, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

function render(text) {
  const blocks = String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) return '';
    const heading = lines[0].match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      const tag = heading[1].length === 2 ? 'h2' : 'h3';
      const rest = lines.slice(1).join('\n');
      return `<${tag}>${inline(heading[2])}</${tag}>` + (rest ? render(rest) : '');
    }
    if (lines.every((l) => /^[-•]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^[-•]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}

module.exports = { render };
