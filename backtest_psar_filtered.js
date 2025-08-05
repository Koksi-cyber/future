/**
 * PSAR crossover strategy with additional look‑back filter.
 *
 * This variant of the Parabolic SAR strategy requires that the price
 * remain on one side of the PSAR for a specified number of bars before
 * a crossover can trigger a trade.  The goal is to reduce false
 * signals resulting from whipsaws.  After the cross, the next candle
 * must confirm by moving in the same direction【907667091262717†L95-L101】, and a trade
 * is executed on that confirming candle.  Trades are filtered by
 * EMA200 direction as in backtest_psar.js.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PSAR, EMA } = require('./node_modules/technicalindicators');

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

async function backtest() {
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880;
  let lookback = 3; // number of bars price must stay on one side of PSAR before crossing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      csvFile = args[i + 1];
      i++;
    } else if (args[i] === '--minutes' && args[i + 1]) {
      maxMinutes = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--lookback' && args[i + 1]) {
      lookback = parseInt(args[i + 1], 10);
      i++;
    }
  }
  const csvPath = path.resolve(__dirname, csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }
  const candles = loadCandles(csvPath, maxMinutes);
  if (candles.length < 200) {
    console.error('Not enough data for PSAR strategy.');
    return;
  }
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const psar = PSAR.calculate({ high: highs, low: lows, step: 0.02, max: 0.2 });
  const closes = candles.map(c => c.close);
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  let totalTrades = 0;
  let correctTrades = 0;
  for (let i = lookback; i < candles.length - 2; i++) {
    if (psar[i - 1] === undefined || psar[i] === undefined) continue;
    const closeCurr = candles[i].close;
    const closePrev = candles[i - 1].close;
    const closeNext = candles[i + 1].close;
    const psarCurr = psar[i];
    const psarPrev = psar[i - 1];
    const ema200 = ema200Arr[i] !== undefined ? ema200Arr[i] : null;
    let direction = null;
    // Determine if price has been below PSAR for `lookback` bars
    let belowCount = 0;
    let aboveCount = 0;
    for (let j = i - lookback; j < i; j++) {
      if (closes[j] <= psar[j]) belowCount++;
      if (closes[j] >= psar[j]) aboveCount++;
    }
    // Up cross candidate: price had been below PSAR for lookback bars and now crosses above
    if (belowCount === lookback && closePrev <= psarPrev && closeCurr > psarCurr) {
      direction = 'UP';
    }
    // Down cross candidate: price had been above PSAR for lookback bars and now crosses below
    if (aboveCount === lookback && closePrev >= psarPrev && closeCurr < psarCurr) {
      direction = direction === 'UP' ? null : 'DOWN';
    }
    if (!direction) continue;
    // Confirm next candle continues in cross direction
    const continuation = direction === 'UP' ? closeNext > closeCurr : closeNext < closeCurr;
    if (!continuation) continue;
    // EMA200 filter
    if (ema200 !== null) {
      if (direction === 'UP' && closeCurr < ema200) continue;
      if (direction === 'DOWN' && closeCurr > ema200) continue;
    }
    totalTrades++;
    const entryPrice = closeNext;
    const exitPrice = candles[i + 2].close;
    const isCorrect = direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    if (isCorrect) correctTrades++;
  }
  console.log(`PSAR filtered strategy (lookback=${lookback}) results`);
  console.log('Total trades opened:', totalTrades);
  console.log('Correct trades     :', correctTrades);
  const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
  console.log('Accuracy           :', accuracy.toFixed(2) + '%');
}
if (require.main === module) backtest();