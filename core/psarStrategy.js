/**
 * PSAR strategy for generating binary option signals on a 1‑minute chart.
 *
 * The strategy identifies a Parabolic SAR crossover on the previous
 * candle and requires that the latest candle continues in the same
 * direction.  It also filters trades based on a 200‑period EMA.
 * If conditions are met, the function returns a signal object with
 * direction ("UP"/"DOWN"), confidence and a reason.  Otherwise it
 * returns a skipped signal.
 *
 * The logic is based on guidance from TradingCenter.org, which
 * suggests using PSAR on a 1‑minute chart, waiting for a price
 * crossover, and confirming with the next candle【907667091262717†L95-L101】.  The EMA
 * filter helps avoid trading against the prevailing trend.
 */

const { PSAR, EMA } = require('technicalindicators');

/**
 * Compute a PSAR signal from an array of recent candles.
 *
 * @param {Array<{open:number, high:number, low:number, close:number, volume:number}>} candles
 *        Array of candle objects with at least three elements.  Candles
 *        should be ordered from oldest to newest.
 * @returns {Object} A signal object: { signal: 'UP'|'DOWN'|'NONE', confidence: number, reason: string, skipped: boolean }
 */
function psarSignal(candles) {
  const result = { signal: 'NONE', confidence: 0, reason: '', skipped: true };
  if (!Array.isArray(candles) || candles.length < 3) return result;
  // Extract high, low and close arrays
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  // Compute PSAR series; the array aligns with candles length.
  const psar = PSAR.calculate({ high: highs, low: lows, step: 0.02, max: 0.2 });
  if (psar.length < candles.length) {
    // PSAR returns an array shorter by one element; pad with initial psar[0]
    const diff = candles.length - psar.length;
    for (let i = 0; i < diff; i++) {
      psar.unshift(psar[0]);
    }
  }
  // Compute EMA200 on close prices
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  // Align EMA length by prepending undefined for missing bars
  while (ema200Arr.length < candles.length) ema200Arr.unshift(undefined);
  const n = candles.length;
  // We'll look at the last three candles: index n-3 (prev), n-2 (cross), n-1 (latest)
  const prevIdx = n - 3;
  const crossIdx = n - 2;
  const latestIdx = n - 1;
  // Ensure indices are valid
  if (prevIdx < 0 || crossIdx < 0 || latestIdx < 0) return result;
  const prevClose = closes[prevIdx];
  const crossClose = closes[crossIdx];
  const latestClose = closes[latestIdx];
  const prevPsar = psar[prevIdx];
  const crossPsar = psar[crossIdx];
  const ema200 = ema200Arr[crossIdx];
  // Determine cross direction
  let direction = null;
  if (prevClose <= prevPsar && crossClose > crossPsar) direction = 'UP';
  if (prevClose >= prevPsar && crossClose < crossPsar) direction = direction === 'UP' ? null : 'DOWN';
  if (!direction) return result;
  // Confirm continuation
  const continuation = direction === 'UP' ? latestClose > crossClose : latestClose < crossClose;
  if (!continuation) return result;
  // EMA trend filter
  if (ema200 !== undefined) {
    if (direction === 'UP' && crossClose < ema200) return result;
    if (direction === 'DOWN' && crossClose > ema200) return result;
  }
  // Build signal
  result.signal = direction;
  result.confidence = 80; // fixed confidence for PSAR signals
  result.reason = `PSAR cross ${direction} with continuation and EMA200 filter`;
  result.skipped = false;
  return result;
}

module.exports = psarSignal;