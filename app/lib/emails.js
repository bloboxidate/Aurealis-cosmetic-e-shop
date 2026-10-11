// The emails the store sends: order confirmation, order update, the store's own "new order" notice, and a test message.
// Each builder returns { subject, text, html } for lib/mailer.js. Everything a customer typed is escaped; the HTML uses
// tables and inline styles only, since mail clients ignore stylesheets.
const { esc, render } = require('./richtext');
const { money } = require('./format');

const INK = '#3a352e', MUTED = '#6b6357', ACCENT = '#a8501f', CREAM = '#fff9f3', LINE = '#e6dfd3';

function layout({ preheader, heading, bodyHtml, footer }) {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:${CREAM};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;font-family:Georgia,'Times New Roman',serif;color:${INK};">
<tr><td style="padding:32px 36px 8px;text-align:center;font-size:26px;letter-spacing:.14em;text-transform:uppercase;">Auréalis</td></tr>
<tr><td style="padding:8px 36px 0;text-align:center;font-size:22px;line-height:1.3;">${esc(heading)}</td></tr>
<tr><td style="padding:20px 36px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK};">${bodyHtml}</td></tr>
<tr><td style="padding:18px 36px 28px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

// Absolute links in admin-written rich text (a relative "/contact" does not work inside an email).
const absolute = (html, base) => String(html).replace(/href="\//g, `href="${base}/`);
const stripMarks = (s) => String(s || '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/^#{2,3}\s+/gm, '');

const row = (label, value) => `<tr><td style="padding:3px 0;color:${MUTED};width:38%;vertical-align:top;">${esc(label)}</td><td style="padding:3px 0;">${value}</td></tr>`;

function itemsTable(items) {
  const lines = items.map((it) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${LINE};">${esc(it.name)}${it.size ? ' &middot; ' + esc(it.size) : ''} &times; ${Number(it.qty) || 1}</td><td style="padding:8px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;">${money(it.unit_price_cents * it.qty)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">${lines}</table>`;
}

function totalsTable(o) {
  const r = (a, b, strong) => `<tr><td style="padding:3px 0;${strong ? 'font-weight:bold;font-size:17px;padding-top:10px;' : 'color:' + MUTED + ';'}">${a}</td><td style="padding:3px 0;text-align:right;${strong ? 'font-weight:bold;font-size:17px;padding-top:10px;' : ''}">${b}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
    + r('Subtotal', money(o.subtotal_cents))
    + (o.discount_cents > 0 ? r(`Discount${o.promo_code ? ' (' + esc(o.promo_code) + ')' : ''}`, '&minus;' + money(o.discount_cents)) : '')
    + r('Shipping', o.shipping_cents > 0 ? money(o.shipping_cents) : 'Free')
    + (o.cod_fee_cents > 0 ? r('Cash on delivery fee', money(o.cod_fee_cents)) : '')
    + r('Total', money(o.total_cents), true) + '</table>';
}

const itemsText = (items) => items.map((it) => `- ${it.name}${it.size ? ' · ' + it.size : ''} x${it.qty} — ${money(it.unit_price_cents * it.qty)}`).join('\n');

// The InstaPay box: where to send the money, how much, and the reference to write.
function instapayHtml(pay, order, base) {
  return `<div style="margin:20px 0 4px;padding:18px 20px;background:${CREAM};border:1px solid ${LINE};border-radius:12px;">
<div style="font-weight:bold;margin-bottom:8px;color:${ACCENT};">Pay with ${esc(pay.instapay_title)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${row('Amount', `<strong>${money(order.total_cents)}</strong>`)}
${pay.instapay_handle ? row('Send to', `<strong>${esc(pay.instapay_handle)}</strong>`) : ''}
${pay.instapay_name ? row('Account name', esc(pay.instapay_name)) : ''}
${row('Reference', `<strong>${esc(order.order_number)}</strong>`)}
</table>
<div style="margin-top:10px;font-size:14px;">${absolute(render(pay.instapay_instructions), base)}</div></div>`;
}

function instapayText(pay, order) {
  return [`PAY WITH ${String(pay.instapay_title).toUpperCase()}`, `Amount: ${money(order.total_cents)}`,
    pay.instapay_handle ? `Send to: ${pay.instapay_handle}` : '', pay.instapay_name ? `Account name: ${pay.instapay_name}` : '',
    `Reference: ${order.order_number}`, '', stripMarks(pay.instapay_instructions)].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

const addressLine = (o) => [o.address, o.city, o.country].filter(Boolean).join(', ');
const FOOT = (base) => `Questions about your order? Just reply to this email or visit <a href="${base}/contact" style="color:${ACCENT};">our contact page</a>.<br>&copy; Auréalis`;

// -> { subject, text, html }. `order` is the snapshot built in routes/checkout.js; `pay` is the 'payment' content.
function orderConfirmation({ order, payment, baseUrl }) {
  const insta = order.payment_method === 'instapay';
  const name = order.ship_first || 'there';
  const subject = `Your Auréalis order ${order.order_number} is confirmed`;
  const html = layout({
    preheader: `Thanks, ${name}. We have your order ${order.order_number}.`,
    heading: `Thank you, ${name}.`,
    bodyHtml: `<p style="margin:0 0 14px;">Your order <strong>${esc(order.order_number)}</strong> is confirmed. We will get it ready${insta ? ' as soon as your transfer reaches us' : ' and let you know as it moves'}.</p>`
      + itemsTable(order.items) + totalsTable(order)
      + (insta ? instapayHtml(payment, order, baseUrl) : `<p style="margin:16px 0 0;color:${MUTED};">Payment: cash on delivery. Please have the amount ready for the courier.</p>`)
      + `<p style="margin:18px 0 4px;font-weight:bold;">Delivering to</p><p style="margin:0;color:${MUTED};">${esc(`${order.ship_first || ''} ${order.ship_last || ''}`.trim())}<br>${esc(addressLine(order))}</p>`,
    footer: FOOT(baseUrl),
  });
  const text = `Thank you, ${name}!\n\nYour order ${order.order_number} is confirmed.\n\n${itemsText(order.items)}\n\n`
    + `Subtotal: ${money(order.subtotal_cents)}\n${order.discount_cents > 0 ? `Discount: -${money(order.discount_cents)}\n` : ''}Shipping: ${order.shipping_cents > 0 ? money(order.shipping_cents) : 'Free'}\n${order.cod_fee_cents > 0 ? `Cash on delivery fee: ${money(order.cod_fee_cents)}\n` : ''}Total: ${money(order.total_cents)}\n\n`
    + (insta ? instapayText(payment, order) + '\n\n' : 'Payment: cash on delivery. Please have the amount ready for the courier.\n\n')
    + `Delivering to: ${addressLine(order)}\n\nQuestions? Just reply to this email.`;
  return { subject, text, html };
}

// A status message the store sends by hand from the admin Orders page.
function orderUpdate({ number, firstName, status, note, baseUrl }) {
  const subject = `Update on your Auréalis order ${number}: ${status}`;
  const html = layout({
    preheader: `Your order ${number} is now: ${status}.`,
    heading: 'An update on your order',
    bodyHtml: `<p style="margin:0 0 14px;">Hi ${esc(firstName || 'there')},</p><p style="margin:0 0 14px;">Your order <strong>${esc(number)}</strong> is now <strong>${esc(status)}</strong>.</p>`
      + (note ? `<p style="margin:0 0 14px;padding:14px 16px;background:${CREAM};border-radius:10px;">${esc(note).replace(/\r?\n/g, '<br>')}</p>` : '')
      + `<p style="margin:0;color:${MUTED};">You can always see your orders in <a href="${baseUrl}/account" style="color:${ACCENT};">your account</a>.</p>`,
    footer: FOOT(baseUrl),
  });
  const text = `Hi ${firstName || 'there'},\n\nYour order ${number} is now: ${status}.\n${note ? `\n${note}\n` : ''}\nYou can see your orders at ${baseUrl}/account\n\nQuestions? Just reply to this email.`;
  return { subject, text, html };
}

// The store's own copy of every new order, so nobody has to open Sariee to find out an order arrived.
// Sariee only knows its own shipping setting, so its amount can differ from what the customer was charged here. Say so,
// because the courier collects what Sariee holds. Empty when the two agree (the COD fee is ours alone, never in Sariee).
function mismatchNote(order) {
  if (order.sariee_total_cents == null) return '';
  const ours = order.total_cents - (order.cod_fee_cents || 0);
  if (order.sariee_total_cents === ours) return '';
  return `Amounts differ: the customer was charged ${money(ours)} before any COD fee, but Sariee holds ${money(order.sariee_total_cents)}. Check the shipping fee in Sariee before the courier collects.`;
}

function newOrderForStore({ order, phone, baseUrl }) {
  const insta = order.payment_method === 'instapay';
  const diff = mismatchNote(order);
  const subject = `${insta ? '[INSTAPAY - awaiting transfer] ' : ''}New order ${order.order_number} - ${money(order.total_cents)}`;
  const html = layout({
    preheader: `${order.ship_first || ''} ${order.ship_last || ''} placed an order for ${money(order.total_cents)}.`,
    heading: `New order ${order.order_number}`,
    bodyHtml: (diff ? `<p style="margin:0 0 14px;padding:12px 14px;background:#fdecd9;border-radius:10px;"><strong>${esc(diff)}</strong></p>` : '')
      + (insta ? `<p style="margin:0 0 14px;padding:12px 14px;background:#fdecd9;border-radius:10px;"><strong>Paid by InstaPay.</strong> Sariee shows this order as Cash On Delivery: do not collect cash. Wait for a transfer of <strong>${money(order.total_cents)}</strong> with reference <strong>${esc(order.order_number)}</strong>.</p>` : '')
      + `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${row('Customer', esc(`${order.ship_first || ''} ${order.ship_last || ''}`.trim()))}${row('Email', esc(order.email))}${row('Mobile', esc(phone || ''))}${row('Address', esc(addressLine(order)))}${row('Payment', insta ? 'InstaPay' : 'Cash on delivery')}</table>`
      + itemsTable(order.items) + totalsTable(order),
    footer: `Open it in Sariee to prepare and ship. Sent automatically by ${esc(baseUrl)}.`,
  });
  const text = `${diff ? diff + '\n\n' : ''}${insta ? 'PAID BY INSTAPAY - Sariee shows Cash On Delivery, do not collect cash. Wait for a transfer of ' + money(order.total_cents) + ' with reference ' + order.order_number + '.\n\n' : ''}`
    + `New order ${order.order_number}\n\nCustomer: ${order.ship_first || ''} ${order.ship_last || ''}\nEmail: ${order.email}\nMobile: ${phone || ''}\nAddress: ${addressLine(order)}\nPayment: ${insta ? 'InstaPay' : 'Cash on delivery'}\n\n${itemsText(order.items)}\n\nTotal: ${money(order.total_cents)}`;
  return { subject, text, html };
}

function testMessage({ baseUrl }) {
  const html = layout({ preheader: 'Your store email is working.', heading: 'Your store email works',
    bodyHtml: '<p style="margin:0;">This is a test message from the Auréalis admin. If you can read it, order confirmations and updates will reach your customers from this mailbox.</p>', footer: esc(baseUrl) });
  return { subject: 'Auréalis test email', text: 'This is a test message from the Auréalis admin. If you can read it, order emails will reach your customers from this mailbox.', html };
}

module.exports = { orderConfirmation, orderUpdate, newOrderForStore, testMessage };
