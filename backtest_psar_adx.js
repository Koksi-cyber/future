/**
 * Backtest script for a Parabolic SAR plus ADX strategy.
 *
 * This script expands upon the earlier PSAR crossover strategy by
 * requiring that the underlying market is trending strongly before
 * taking a trade.  Many trading guides (for example, RealBinaryOptions
 * Reviews) describe a PSAR and ADX combination for binary options:
 * traders monitor a 5‑minute chart to find trades in the direction
 * of a sustained trend, entering after a pullback when price crosses
 * the Parabolic SAR and ADX indicates a strong trend【918883237774240†L69-L82】.  The
 * article notes that when applied in trending markets and with
 * appropriate expiries (15–60 minutes), this method can yield
 * roughly 60–70% win rates【918883237774240†L80-L83】.
 *
 * To adapt this idea to the supplied 1‑minute XAUUSD data, we:
 *   • calculate the Parabolic SAR on each bar using the default
 *     parameters (step = 0.02, max = 0.2);
 *   • compute the 200‑period EMA to identify the long‑term trend;
 *   • compute the 14‑period Average Directional Index (ADX) to
 *     measure trend strength;
 *   • only trade when ADX exceeds a configurable threshold (e.g. 20);
 *   • only take long trades when price is above the EMA200 and
 *     short trades when below;
 *   • require that the Parabolic SAR flips (price crosses the
 *     indicator) and that the next candle continues in the same
 *     direction (momentum confirmation, as recommended by
 *     TradingCenter【907667091262717†L95-L101】);
 *   • optionally require a minimum number of bars between PSAR
 *     flips to avoid choppy reversals.
 *
 * The script supports expiries of 1, 5, or 10 minutes.  For example,
 * a 5‑minute expiry means that after a signal, the trade outcome is
 * judged on the candle five bars later.  You can adjust the ADX
 * threshold and the minimum PSAR persistence via command‑line
 * arguments.
 *
 * Usage:
 *   node backtest_psar_adx.js [--file <csvFile>] [--minutes <N>]
 *     [--expiry <1|5|10>] [--adx <threshold>] [--minFlips <K>]
 *
 * Example:
 *   node backtest_psar_adx.js --expiry 5 --adx 25 --minFlips 3
 *
 * The CSV data is expected to have the format:
 *   date,time,open,high,low,close,volume
 * Synthetic volumes are generated internally since the supplied
 * dataset lacks volume information.  Only the price data is used
 * for the strategy.
 */

const fs = require('fs');
const path = require('path');
const { PSAR, EMA, ADX } = require('./node_modules/technicalindicators');

function getSyntheticVolume(timeString) {
  const hour = parseInt(timeString.split(':')[0], 10);
  let min = 100;
  let max = 1500;
  if (hour < 8) {
    max = 400;
  } else if (hour < 16) {
    min = 400;
    max = 800;
  } else {
    min = 800;
    max = 1500;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Load candle data from a CSV file.  Only the first `maxRows` lines
 * are read to speed up backtesting.  The file is expected to be
 * comma‑separated with the columns date,time,open,high,low,close,volume.
 *
 * @param {string} csvPath path to the CSV file
 * @param {number} maxRows maximum number of rows to read
 * @returns {Array<{open:number, high:number, low:number, close:number, volume:number}>}
 */
function loadCandles(csvPath, maxRows) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const candles = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.trim().split(',');
    if (parts.length < 7) continue;
    const timeStr = parts[1];
    candles.push({
      open: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      close: parseFloat(parts[5]),
      volume: getSyntheticVolume(timeStr)
    });
    if (maxRows && candles.length >= maxRows) break;
  }
  return candles;
}

/**
 * Backtest the PSAR+ADX strategy on the provided candles.  The
 * function iterates through the candles, detects PSAR flips and
 * evaluates trades with the specified expiry.  It returns an object
 * summarising the total and correct trades.
 *
 * @param {Array} candles array of candle objects
 * @param {number} expiryBars number of bars for the trade expiry (1, 5 or 10)
 * @param {number} adxThreshold minimum ADX value required to trade
 * @param {number} minFlips minimum number of bars since last PSAR flip
 */
function backtestStrategy(candles, expiryBars = 1, adxThreshold = 20, minFlips = 1, psarStep = 0.02, psarMax = 0.2, rangeMultiplier = 0) {
  if (candles.length < 250) {
    throw new Error('Insufficient data for PSAR+ADX strategy');
  }
  // Precompute indicators
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const psarArr = PSAR.calculate({ high: highs, low: lows, step: psarStep, max: psarMax });
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  const adxArr = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  let totalTrades = 0;
  let correctTrades = 0;
  let barsSinceFlip = 0;
  // iterate starting at index 1 to allow referencing previous candle
  for (let i = 1; i < candles.length - (expiryBars + 1); i++) {
    // Skip if indicators not yet computed
    if (psarArr[i - 1] === undefined || psarArr[i] === undefined) {
      barsSinceFlip++;
      continue;
    }
    const closePrev = closes[i - 1];
    const closeCurr = closes[i];
    const closeNext = closes[i + 1];
    const psarPrev = psarArr[i - 1];
    const psarCurr = psarArr[i];
    const ema200 = ema200Arr[i] !== undefined ? ema200Arr[i] : null;
    const adx = adxArr[i] !== undefined ? adxArr[i].adx : null;
    let direction = null;
    // detect PSAR cross
    if (closePrev <= psarPrev && closeCurr > psarCurr) {
      direction = 'UP';
    }
    if (closePrev >= psarPrev && closeCurr < psarCurr) {
      if (direction === 'UP') {
        // conflicting directions (shouldn't happen) – skip
        direction = null;
      } else {
        direction = 'DOWN';
      }
    }
    if (!direction) {
      barsSinceFlip++;
      continue;
    }
    // Confirm continuation on next candle
    const continued = direction === 'UP' ? closeNext > closeCurr : closeNext < closeCurr;
    if (!continued) {
      barsSinceFlip++;
      continue;
    }
    // Check minFlips: require a certain number of bars since last PSAR flip
    if (barsSinceFlip < minFlips) {
      barsSinceFlip = 0;
      continue;
    }
    barsSinceFlip = 0;
    // Range filter: require the current bar's range to exceed average range times multiplier
    if (rangeMultiplier > 0) {
      // Compute average range of last 14 bars (high-low)
      const lookback = 14;
      if (i >= lookback) {
        let sumRange = 0;
        for (let j = i - lookback + 1; j <= i; j++) {
          sumRange += (highs[j] - lows[j]);
        }
        const avgRange = sumRange / lookback;
        const currRange = highs[i] - lows[i];
        if (currRange < avgRange * rangeMultiplier) {
          continue;
        }
      }
    }
    // Trend filter: price relative to EMA200
    if (ema200 !== null) {
      if (direction === 'UP' && closeCurr < ema200) continue;
      if (direction === 'DOWN' && closeCurr > ema200) continue;
    }
    // ADX filter
    if (adx !== null && adx < adxThreshold) continue;
    // Open trade at candle i+1; evaluate after expiryBars
    totalTrades++;
    const entryPrice = closes[i + 1];
    const exitPrice = closes[i + 1 + expiryBars];
    const isWin = direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    if (isWin) correctTrades++;
  }
  return { total: totalTrades, correct: correctTrades, accuracy: totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0 };
}

// Main execution block
async function run() {
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880;
  let expiry = 1;
  let adxThreshold = 20;
  let minFlips = 1;
  let psarStep = 0.02;
  let psarMax = 0.2;
  let rangeMultiplier = 0;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        csvFile = args[i + 1];
        i++;
        break;
      case '--minutes':
        maxMinutes = parseInt(args[i + 1], 10);
        i++;
        break;
      case '--expiry':
        expiry = parseInt(args[i + 1], 10);
        i++;
        break;
      case '--adx':
        adxThreshold = parseFloat(args[i + 1]);
        i++;
        break;
      case '--minFlips':
        minFlips = parseInt(args[i + 1], 10);
        i++;
        break;
      case '--step':
        psarStep = parseFloat(args[i + 1]);
        i++;
        break;
      case '--max':
        psarMax = parseFloat(args[i + 1]);
        i++;
        break;
      case '--range':
        rangeMultiplier = parseFloat(args[i + 1]);
        i++;
        break;
    }
  }
  const csvPath = path.resolve(__dirname, csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }
  const candles = loadCandles(csvPath, maxMinutes);
  const res = backtestStrategy(candles, expiry, adxThreshold, minFlips, psarStep, psarMax, rangeMultiplier);
  console.log(`PSAR+ADX backtest (expiry=${expiry}min, ADX>=${adxThreshold}, minFlips=${minFlips}, step=${psarStep}, max=${psarMax}, rangeMult=${rangeMultiplier})`);
  console.log(`Total trades opened: ${res.total}`);
  console.log(`Winning trades     : ${res.correct}`);
  console.log(`Accuracy           : ${res.accuracy.toFixed(2)}%`);
}

if (require.main === module) {
  run().catch(err => console.error(err));
}