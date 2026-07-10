// Shared input-format validators used by both auth and checkout forms.
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Loose on purpose (international formats vary) — just rejects obvious junk.
const mobileRe = /^[\d\s+\-()]{6,20}$/;

module.exports = { emailRe, mobileRe };
