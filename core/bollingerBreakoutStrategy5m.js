const { BollingerBands, ADX } = require('technicalindicators');

/**
 * Bollinger breakout strategy for fast‑moving markets on a 5‑minute expiry.
 *
 * This strategy hunts for momentum breakouts when volatility expands after a
 * period of contraction (“squeeze”).  It uses a 20‑period Bollinger Band
 * with ±2 standard deviations on a 1‑minute chart.  A breakout signal is
 * generated when the price closes above the upper band or below the lower
 * band and the Average Directional Index (ADX) exceeds a user‑specified
 * threshold.  Optionally, a squeeze filter can be applied to require that
 * the current band width is less than a percentage of its recent average,
 * ensuring that breakouts only occur after low volatility.
 *
 * For a CALL signal: the previous close must be below or at the upper band,
 * and the current close must be above the upper band.  For a PUT signal:
 * the previous close must be above or at the lower band, and the current
 * close must be below the lower band.  Signals are held for five bars.
 *
 * @param {Array} candles  Array of candle objects with {open, high, low, close}
 * @param {Object} options Optional configuration values
 * @param {number} options.period Bollinger period (default 20)
 * @param {number} options.stdDev Number of standard deviations (default 2)
 * @param {number} options.adxLen ADX period (default 14)
 * @param {number} options.adxThreshold Minimum ADX for breakout (default 30)
 * @param {number|null} options.squeezeMult Squeeze filter multiplier (e.g. 0.8 means width < 80% of average width).  Set to null to disable squeeze filter
 * @returns {Array} Array of signals {index, direction, confidence}
 */
function bollingerBreakoutStrategy5m(candles, options = {}) {
  const {
    period = 20,
    stdDev = 2,
    adxLen = 14,
    adxThreshold = 30,
    squeezeMult = 0.8,
  } = options;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  // Compute Bollinger Bands
  const bb = BollingerBands.calculate({ period, stdDev, values: closes });
  // BollingerBands.calculate returns objects with upper, middle, lower; length shorter by period
  const bbOffset = candles.length - bb.length;
  // Compute band width and average width for squeeze filter
  const widths = bb.map(({ upper, lower }) => upper - lower);
  const avgWidth = widths.map((_, idx) => {
    const start = Math.max(0, idx - period + 1);
    const slice = widths.slice(start, idx + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / slice.length;
  });
  // Compute ADX
  const adxVals = ADX.calculate({ period: adxLen, close: closes, high: highs, low: lows });
  const adxOffset = candles.length - adxVals.length;

  const signals = [];
  for (let i = 1; i < candles.length - 5; i++) {
    const bbIdx  = i - bbOffset;
    const adxIdx = i - adxOffset;
    if (bbIdx <= 0 || adxIdx < 0) continue;
    const prev = closes[i - 1];
    const curr = closes[i];
    const upper = bb[bbIdx].upper;
    const lower = bb[bbIdx].lower;
    const width = widths[bbIdx];
    const avg   = avgWidth[bbIdx];
    const adx   = adxVals[adxIdx].adx;
    if (isNaN(adx) || adx < adxThreshold) continue;
    // squeeze filter
    if (squeezeMult !== null && (width >= squeezeMult * avg)) continue;
    // breakout up
    if (prev <= upper && curr > upper) {
      signals.push({ index: i, direction: 'UP', confidence: Math.min((adx - adxThreshold) / 50 + 0.5, 0.95) });
    }
    // breakout down
    if (prev >= lower && curr < lower) {
      signals.push({ index: i, direction: 'DOWN', confidence: Math.min((adx - adxThreshold) / 50 + 0.5, 0.95) });
    }
  }
  return signals;
}

module.exports = bollingerBreakoutStrategy5m;