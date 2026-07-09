// Small formatting helpers shared by views.
function money(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// Compact price for cards ("$52" not "$52.00" when whole).
function price(cents) {
  const v = cents / 100;
  return Number.isInteger(v) ? '$' + v : '$' + v.toFixed(2);
}

module.exports = { money, price };
