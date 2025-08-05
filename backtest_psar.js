/**
 * Backtest script implementing a Parabolic SAR crossover strategy for
 * 1‑minute binary options.  The strategy follows the guidance from
 * TradingCenter.org, which suggests switching to the 1‑minute chart,
 * adding the Parabolic SAR with default settings (step 0.02, max 0.20),
 * and triggering trades when the price crosses the PSAR.  After a
 * cross, a trade is opened only if the next price continues in the
 * same direction as the cross【907667091262717†L95-L101】.  To reduce false
 * signals, this implementation also requires that the price is on
 * the appropriate side of its EMA200 (long trades when above, short
 * trades when below).
 *
 * Each trade lasts one minute, and accuracy statistics are printed at
 * the end.  Synthetic volumes are generated because the provided
 * dataset lacks volume data.
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
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/);
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
  if (candles.length < 250) {
    console.error('Not enough data for PSAR strategy.');
    return;
  }
  // Precompute PSAR values using high and low arrays.  The PSAR calculation
  // ignores the close series and uses the default step (0.02) and max (0.2).
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const psar = PSAR.calculate({ high: highs, low: lows, step: 0.02, max: 0.2 });
  // Precompute EMA200 on closing prices
  const closes = candles.map(c => c.close);
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  let totalTrades = 0;
  let correctTrades = 0;
  // Because PSAR array begins at index 1, align indexes accordingly. We'll use index i
  // for candle[i], with psar[i] representing PSAR value at that candle.
  for (let i = 1; i < candles.length - 2; i++) {
    // We need a valid PSAR for the current and previous candles
    if (psar[i - 1] === undefined || psar[i] === undefined) continue;
    const closePrev = candles[i - 1].close;
    const closeCurr = candles[i].close;
    const closeNext = candles[i + 1].close;
    const psarPrev = psar[i - 1];
    const psarCurr = psar[i];
    const ema200 = ema200Arr[i] !== undefined ? ema200Arr[i] : null;
    // Determine cross direction
    let direction = null;
    // Up cross: previously below or equal PSAR then above
    if (closePrev <= psarPrev && closeCurr > psarCurr) {
      direction = 'UP';
    }
    // Down cross: previously above or equal PSAR then below
    if (closePrev >= psarPrev && closeCurr < psarCurr) {
      direction = direction === 'UP' ? null : 'DOWN';
    }
    if (!direction) continue;
    // Confirm next candle moves in same direction
    const continuation = direction === 'UP' ? closeNext > closeCurr : closeNext < closeCurr;
    if (!continuation) continue;
    // EMA200 trend filter: require price relative to EMA200
    if (ema200 !== null) {
      if (direction === 'UP' && closeCurr < ema200) continue;
      if (direction === 'DOWN' && closeCurr > ema200) continue;
    }
    // Trade executed at next candle (index i+1), expires at i+2
    totalTrades++;
    const entryPrice = closeNext;
    const exitPrice = candles[i + 2].close;
    const isCorrect = direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    if (isCorrect) correctTrades++;
  }
  console.log('PSAR crossover strategy results');
  console.log('Total trades opened:', totalTrades);
  console.log('Correct trades     :', correctTrades);
  const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
  console.log('Accuracy           :', accuracy.toFixed(2) + '%');
}

if (require.main === module) {
  backtest();
}