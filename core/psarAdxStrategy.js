/**
 * Parabolic SAR + ADX strategy for binary options.
 *
 * This module generates a trading signal based on a Parabolic SAR
 * crossover, an Average Directional Index (ADX) filter, a long‑term
 * EMA trend filter and optional range and persistence requirements.
 * The strategy draws inspiration from RealBinaryOptionsReviews which
 * recommends combining PSAR and ADX on a 5‑minute chart to trade in
 * the direction of a developed trend【918883237774240†L69-L83】.  To adapt it to
 * 1‑minute data, we also allow custom PSAR step/max parameters,
 * require that the latest candle continues in the direction of the
 * PSAR flip【907667091262717†L95-L101】, and ensure that the crossover occurs
 * after a minimum number of bars since the last flip (to avoid
 * whipsaws).  A range filter optionally insists that the candle
 * triggering the signal has a range above a multiple of the recent
 * average range, which further weeds out weak signals.
 *
 * Configuration options may be passed via a second argument:
 * {
 *   psarStep: number (default 0.02),
 *   psarMax:  number (default 0.2),
 *   adxThreshold: number (default 20),
 *   minFlips: number (default 1),
 *   rangeMultiplier: number (default 0)
 * }
 *
 * The function returns an object containing the signal direction
 * ("UP", "DOWN" or "NONE"), a confidence score and a reason.  If
 * skipped is true, no trade should be taken.
 */

const { PSAR, EMA, ADX } = require('technicalindicators');

function psarAdxSignal(candles, config = {}) {
  const result = { signal: 'NONE', confidence: 0, reason: '', skipped: true };
  if (!Array.isArray(candles) || candles.length < 3) return result;
  const step = config.psarStep ?? 0.02;
  const max = config.psarMax ?? 0.2;
  const adxThreshold = config.adxThreshold ?? 20;
  const minFlips = config.minFlips ?? 1;
  const rangeMult = config.rangeMultiplier ?? 0;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  // Compute PSAR
  let psarArr = PSAR.calculate({ high: highs, low: lows, step: step, max: max });
  // PSAR returns array shorter by 1; pad to align
  if (psarArr.length < candles.length) {
    const diff = candles.length - psarArr.length;
    for (let i = 0; i < diff; i++) psarArr.unshift(psarArr[0]);
  }
  // Compute EMA200
  let ema200Arr = EMA.calculate({ period: 200, values: closes });
  while (ema200Arr.length < candles.length) ema200Arr.unshift(undefined);
  // Compute ADX
  let adxArr;
  try {
    adxArr = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    // ADX returns objects with {adx, pdi, mdi}.  Align length by prepending
    while (adxArr.length < candles.length) adxArr.unshift({ adx: undefined });
  } catch (e) {
    adxArr = new Array(candles.length).fill({ adx: undefined });
  }
  const n = candles.length;
  // Determine cross at second last bar (index n-2) using previous bar (n-3)
  const prevIdx = n - 3;
  const crossIdx = n - 2;
  const latestIdx = n - 1;
  if (prevIdx < 0 || crossIdx < 0 || latestIdx < 0) return result;
  const prevClose = closes[prevIdx];
  const crossClose = closes[crossIdx];
  const latestClose = closes[latestIdx];
  const prevPsar = psarArr[prevIdx];
  const crossPsar = psarArr[crossIdx];
  // Determine direction
  let direction = null;
  if (prevClose <= prevPsar && crossClose > crossPsar) direction = 'UP';
  if (prevClose >= prevPsar && crossClose < crossPsar) direction = direction === 'UP' ? null : 'DOWN';
  if (!direction) return result;
  // Continuation: require latest candle to move further in same direction
  const continuation = direction === 'UP' ? latestClose > crossClose : latestClose < crossClose;
  if (!continuation) return result;
  // Range filter: ensure the cross candle's range exceeds avgRange * rangeMult
  if (rangeMult > 0) {
    const lookback = 14;
    if (crossIdx >= lookback) {
      let sumRange = 0;
      for (let j = crossIdx - lookback + 1; j <= crossIdx; j++) {
        sumRange += (highs[j] - lows[j]);
      }
      const avgRange = sumRange / lookback;
      const currRange = highs[crossIdx] - lows[crossIdx];
      if (currRange < avgRange * rangeMult) return result;
    }
  }
  // PSAR persistence: ensure price has been on one side of PSAR for at least minFlips bars
  if (minFlips > 1) {
    // Determine side of close relative to PSAR at crossIdx (above/below)
    const currentSide = crossClose > crossPsar ? 'above' : 'below';
    let barsSinceFlip = 0;
    for (let j = crossIdx - 1; j >= 0; j--) {
      const side = closes[j] > psarArr[j] ? 'above' : 'below';
      barsSinceFlip++;
      if (side !== currentSide) break;
    }
    if (barsSinceFlip < minFlips) return result;
  }
  // EMA filter: only take longs above EMA200 and shorts below EMA200
  const ema200 = ema200Arr[crossIdx];
  if (ema200 !== undefined) {
    if (direction === 'UP' && crossClose < ema200) return result;
    if (direction === 'DOWN' && crossClose > ema200) return result;
  }
  // ADX filter: require ADX at crossIdx to exceed threshold
  const adxVal = adxArr[crossIdx] && adxArr[crossIdx].adx;
  if (adxVal !== undefined && adxVal < adxThreshold) return result;
  // Build signal.  Confidence increases when ADX is strong and when range filter is applied.
  let confidence = 70;
  if (adxVal !== undefined) confidence += Math.min(30, (adxVal - adxThreshold) * 2);
  if (rangeMult > 0) confidence += 5;
  confidence = Math.min(confidence, 100);
  result.signal = direction;
  result.confidence = confidence;
  result.reason = `PSAR cross ${direction} with continuation, ADX ${adxVal?.toFixed?.(2) ?? 'n/a'}, EMA200 filter`;
  result.skipped = false;
  return result;
}

module.exports = psarAdxSignal;