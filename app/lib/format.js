// Small formatting helpers shared by views.
function money(cents) {
  return 'EGP ' + (cents / 100).toFixed(2);
}

// Compact price for cards ("EGP 52" not "EGP 52.00" when whole).
function price(cents) {
  const v = cents / 100;
  return Number.isInteger(v) ? 'EGP ' + v : 'EGP ' + v.toFixed(2);
}

module.exports = { money, price };
