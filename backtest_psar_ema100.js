/**
 * Variant of PSAR crossover strategy using EMA100 instead of EMA200
 * as the trend filter.  The rest of the logic is identical to
 * backtest_psar.js.  This file is generated to compare performance
 * across different EMA periods.
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
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      csvFile = args[i + 1];
      i++;
    } else if (args[i] === '--minutes' && args[i + 1]) {
      maxMinutes = parseInt(args[i + 1], 10);
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
  const emaArr = EMA.calculate({ period: 100, values: closes });
  let totalTrades = 0;
  let correctTrades = 0;
  for (let i = 1; i < candles.length - 2; i++) {
    if (psar[i - 1] === undefined || psar[i] === undefined) continue;
    const closePrev = candles[i - 1].close;
    const closeCurr = candles[i].close;
    const closeNext = candles[i + 1].close;
    const psarPrev = psar[i - 1];
    const psarCurr = psar[i];
    const ema = emaArr[i] !== undefined ? emaArr[i] : null;
    let direction = null;
    if (closePrev <= psarPrev && closeCurr > psarCurr) direction = 'UP';
    if (closePrev >= psarPrev && closeCurr < psarCurr) direction = direction === 'UP' ? null : 'DOWN';
    if (!direction) continue;
    const continuation = direction === 'UP' ? closeNext > closeCurr : closeNext < closeCurr;
    if (!continuation) continue;
    if (ema !== null) {
      if (direction === 'UP' && closeCurr < ema) continue;
      if (direction === 'DOWN' && closeCurr > ema) continue;
    }
    totalTrades++;
    const entryPrice = closeNext;
    const exitPrice = candles[i + 2].close;
    const isCorrect = direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    if (isCorrect) correctTrades++;
  }
  console.log('PSAR crossover strategy (EMA100) results');
  console.log('Total trades opened:', totalTrades);
  console.log('Correct trades     :', correctTrades);
  const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
  console.log('Accuracy           :', accuracy.toFixed(2) + '%');
}
if (require.main === module) backtest();