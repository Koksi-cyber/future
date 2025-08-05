/**
 * Backtest for the SMA cross + PSAR + Stochastic strategy described on
 * ForexStrategiesResources.com.  The strategy uses a 5-period SMA
 * crossing a 13-period SMA to identify the trade direction, checks the
 * Parabolic SAR dot position relative to the candle, and confirms
 * momentum with the stochastic oscillator.  Entry rules are:
 *
 * 1. **Call option**: the 5‑period SMA crosses above the 13‑period
 *    SMA (bullish crossover); the PSAR dot is below the candle
 *    (indicating an uptrend); and the stochastic oscillator is above
 *    50【235428940845031†L254-L260】.
 * 2. **Put option**: the 5‑period SMA crosses below the 13‑period
 *    SMA (bearish crossover); the PSAR dot is above the candle; and
 *    the stochastic is below 50【235428940845031†L254-L268】.
 *
 * The expiry time can be 1, 2 or 3 candles (minutes).  This script
 * allows configuring the expiry length via the --expiry argument.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { SMA, PSAR, Stochastic } = require('./node_modules/technicalindicators');

dotenv.config({ path: path.resolve(__dirname, '.env') });

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

function loadCandles(csvPath, maxRows) {
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
  const candles = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.trim().split(',');
    if (parts.length < 7) continue;
    const [dateStr, timeStr, open, high, low, close] = parts;
    const [hh] = timeStr.split(':');
    candles.push({
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: getSyntheticVolume(timeStr),
      hour: parseInt(hh, 10)
    });
    if (maxRows && candles.length >= maxRows) break;
  }
  return candles;
}

function calculateSMA(values, period) {
  return SMA.calculate({ period, values });
}

async function backtest() {
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880;
  let expiry = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      csvFile = args[i + 1];
      i++;
    } else if (args[i] === '--minutes' && args[i + 1]) {
      maxMinutes = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--expiry' && args[i + 1]) {
      expiry = parseInt(args[i + 1], 10);
      i++;
    }
  }
  const csvPath = path.resolve(__dirname, csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }
  const candles = loadCandles(csvPath, maxMinutes);
  if (candles.length < 30) {
    console.error('Not enough data.');
    return;
  }
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  // Precompute SMA5 and SMA13
  const sma5 = calculateSMA(closes, 5);
  const sma13 = calculateSMA(closes, 13);
  // Align lengths (prepend undefined)
  while (sma5.length < closes.length) sma5.unshift(undefined);
  while (sma13.length < closes.length) sma13.unshift(undefined);
  // Precompute PSAR
  const psar = PSAR.calculate({ high: highs, low: lows, step: 0.03, max: 0.2 });
  while (psar.length < closes.length) psar.unshift(psar[0]);
  // Precompute Stochastic oscillator (use %K and %D with period 16, signal 9, smoothing 3 as per strategy suggestion)
  const stoch = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 16, signalPeriod: 9 });
  // stoch results start later; align arrays
  const stochK = stoch.map(r => r.k);
  const stochD = stoch.map(r => r.d);
  while (stochK.length < closes.length) {
    stochK.unshift(undefined);
    stochD.unshift(undefined);
  }
  let totalTrades = 0;
  let correctTrades = 0;
  for (let i = 2; i < candles.length - expiry; i++) {
    const sma5Prev = sma5[i - 1];
    const sma13Prev = sma13[i - 1];
    const sma5Curr = sma5[i];
    const sma13Curr = sma13[i];
    const psarCurr = psar[i];
    const highCurr = candles[i].high;
    const lowCurr = candles[i].low;
    const stochVal = stochK[i];
    let direction = null;
    if (
      sma5Prev !== undefined && sma13Prev !== undefined && sma5Curr !== undefined && sma13Curr !== undefined &&
      stochVal !== undefined
    ) {
      // Bullish crossover
      if (sma5Prev <= sma13Prev && sma5Curr > sma13Curr) {
        // PSAR dot below candle (use psar < low)
        if (psarCurr < lowCurr && stochVal > 50) {
          direction = 'UP';
        }
      }
      // Bearish crossover
      if (sma5Prev >= sma13Prev && sma5Curr < sma13Curr) {
        // PSAR dot above candle
        if (psarCurr > highCurr && stochVal < 50) {
          direction = 'DOWN';
        }
      }
    }
    if (!direction) continue;
    // Open trade at candle i with expiry N candles ahead
    totalTrades++;
    const entryPrice = candles[i].close;
    const exitPrice = candles[i + expiry].close;
    const isCorrect = direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    if (isCorrect) correctTrades++;
  }
  console.log(`SMA/PSAR/Stoch strategy results (expiry=${expiry}m)`);
  console.log('Total trades opened:', totalTrades);
  console.log('Correct trades     :', correctTrades);
  const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
  console.log('Accuracy           :', accuracy.toFixed(2) + '%');
}

if (require.main === module) backtest();