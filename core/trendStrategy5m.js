const { EMA, ADX } = require('technicalindicators');

/**
 * Trend following strategy for 5‑minute binary options.
 *
 * This strategy is designed for trending markets and uses a triple filter:
 *  - a fast/slow EMA crossover (e.g. 50 vs 100) to identify the trend change;
 *  - a 200‑period EMA to filter trades in the direction of the dominant trend;
 *  - an ADX threshold to ensure the market is trending strongly.
 *
 * When the fast EMA crosses above the slow EMA and the close is above the
 * 200‑EMA, a CALL (up) signal is generated.  Conversely, when the fast
 * EMA crosses below the slow EMA and the close is below the 200‑EMA, a PUT
 * (down) signal is generated.  Each signal is held for five 1‑minute bars
 * (five minutes) to match a 5‑minute binary option expiry.
 *
 * The user can adjust the EMA lengths and the ADX threshold via the options
 * parameter.  A higher ADX threshold will reduce the number of trades but
 * increase the likelihood that signals occur in strong trends.  Default
 * parameters are tuned for BTC/USDT on a 1‑minute chart.
 *
 * @param {Array} candles  Array of candle objects with {open, high, low, close}
 * @param {Object} options Optional configuration values
 * @param {number} options.fastLen Length of the fast EMA (default 50)
 * @param {number} options.slowLen Length of the slow EMA (default 100)
 * @param {number} options.trendLen Length of the trend EMA (default 200)
 * @param {number} options.adxLen Length of the ADX period (default 14)
 * @param {number} options.adxThreshold Minimum ADX value to consider a market trending (default 25)
 * @returns {Array} Array of signals {index, direction, confidence}
 */
function trendStrategy5m(candles, options = {}) {
  const {
    fastLen = 50,
    slowLen = 100,
    trendLen = 200,
    adxLen = 14,
    adxThreshold = 25,
  } = options;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  // Precompute EMAs
  const fastEma = EMA.calculate({ period: fastLen, values: closes });
  const slowEma = EMA.calculate({ period: slowLen, values: closes });
  const trendEma = EMA.calculate({ period: trendLen, values: closes });
  // Precompute ADX
  const adxValues = ADX.calculate({ period: adxLen, close: closes, high: highs, low: lows });

  const signals = [];
  // The indicator arrays are shorter than the candles array.  Offsets:
  const fastOffset  = candles.length - fastEma.length;
  const slowOffset  = candles.length - slowEma.length;
  const trendOffset = candles.length - trendEma.length;
  const adxOffset   = candles.length - adxValues.length;

  for (let i = 1; i < candles.length - 5; i++) {
    // ensure indicators exist for this index
    const fastIdx  = i - fastOffset;
    const slowIdx  = i - slowOffset;
    const trendIdx = i - trendOffset;
    const adxIdx   = i - adxOffset;
    if (fastIdx < 1 || slowIdx < 1 || trendIdx < 0 || adxIdx < 0) continue;
    const prevFast = fastEma[fastIdx - 1];
    const prevSlow = slowEma[slowIdx - 1];
    const currFast = fastEma[fastIdx];
    const currSlow = slowEma[slowIdx];
    const currTrend= trendEma[trendIdx];
    const adx      = adxValues[adxIdx].adx;
    const price    = closes[i];
    if (isNaN(adx) || adx < adxThreshold) continue;
    // bullish crossover
    if (prevFast <= prevSlow && currFast > currSlow && price > currTrend) {
      signals.push({ index: i, direction: 'UP', confidence: Math.min((adx - adxThreshold) / 50 + 0.5, 0.95) });
    }
    // bearish crossover
    if (prevFast >= prevSlow && currFast < currSlow && price < currTrend) {
      signals.push({ index: i, direction: 'DOWN', confidence: Math.min((adx - adxThreshold) / 50 + 0.5, 0.95) });
    }
  }
  return signals;
}

module.exports = trendStrategy5m;