(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoinCardDisplay = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DEFAULT_DECIMALS = 6;

  function toBigIntValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        throw new Error('Coin Card display values must be integer base units');
      }
      return BigInt(value);
    }
    if (typeof value === 'string') {
      var text = value.trim();
      if (!text) return null;
      return BigInt(text);
    }
    return BigInt(value);
  }

  function scaleForDecimals(decimals) {
    var digits = decimals == null ? DEFAULT_DECIMALS : Number(decimals);
    if (!Number.isInteger(digits) || digits < 0) {
      throw new Error('Coin Card decimals must be a non-negative integer');
    }
    return BigInt('1' + new Array(digits + 1).join('0'));
  }

  function formatUsdcUnits(value, options) {
    var opts = options || {};
    var decimals = opts.decimals == null ? DEFAULT_DECIMALS : Number(opts.decimals);
    var unavailableDisplay = opts.unavailableDisplay || '\u2014';
    var raw = toBigIntValue(value);

    if (raw === null) return unavailableDisplay;

    var scale = scaleForDecimals(decimals);
    var sign = raw < 0n ? '-' : '';
    var abs = raw < 0n ? -raw : raw;
    var whole = abs / scale;
    var frac = (abs % scale).toString().padStart(decimals, '0');
    var trimmed = frac.replace(/0+$/, '');

    if (trimmed.length < 2) trimmed = frac.slice(0, 2);
    return sign + whole.toString() + '.' + trimmed;
  }

  function middleTruncate(value, head, tail, options) {
    var opts = options || {};
    var marker = typeof opts.marker === 'string' ? opts.marker : '\u2026';
    var truncateAtLength = opts.truncateAtLength;
    if (!value) return '\u2014';
    var text = String(value);
    if (truncateAtLength == null) {
      truncateAtLength = head + tail + marker.length;
    }
    if (text.length <= truncateAtLength) return text;
    return text.slice(0, head) + marker + text.slice(-tail);
  }

  return {
    formatUsdcUnits: formatUsdcUnits,
    middleTruncate: middleTruncate,
  };
});
