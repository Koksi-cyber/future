/**
 * Backtest a PSAR crossover strategy with triple EMA confirmation.
 *
 * The idea is that by stacking multiple EMAs (e.g. 50, 100 and 200),
 * we can ensure the broader trend aligns with the Parabolic SAR signal.
 * Many traders use EMA stacks to gauge whether a trend has strong
 * hierarchical support: in a bullish trend, EMA50 > EMA100 > EMA200;
 * in a bearish trend, EMA50 < EMA100 < EMA200.  When the PSAR
 * indicator flips and price continues in the same direction, a trade
 * is taken only if the EMA stack supports that direction.  This
 * approach aims to filter out whipsaws and capture only strong
 * directional moves.
 *
 * Each trade is opened on the bar following the PSAR flip and
 * evaluated after `expiryBars` bars.  Synthetic volumes are used
 * because the provided dataset does not include real volume.
 *
 * Usage:
 *   node backtest_psar_emaStack.js --expiry <bars> --minutes <rows>
 */

const fs = require('fs');
const path = require('path');
const { PSAR, EMA } = require('./node_modules/technicalindicators');

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

function backtestStrategy(candles, expiryBars = 1, psarStep = 0.02, psarMax = 0.2) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const psarArr = PSAR.calculate({ high: highs, low: lows, step: psarStep, max: psarMax });
  const ema50Arr = EMA.calculate({ period: 50, values: closes });
  const ema100Arr = EMA.calculate({ period: 100, values: closes });
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  let total = 0;
  let correct = 0;
  for (let i = 1; i < candles.length - (expiryBars + 1); i++) {
    if (psarArr[i - 1] === undefined || psarArr[i] === undefined) continue;
    const closePrev = closes[i - 1];
    const closeCurr = closes[i];
    const closeNext = closes[i + 1];
    const psarPrev = psarArr[i - 1];
    const psarCurr = psarArr[i];
    // Determine PSAR flip direction
    let direction = null;
    if (closePrev <= psarPrev && closeCurr > psarCurr) direction = 'UP';
    if (closePrev >= psarPrev && closeCurr < psarCurr) direction = (direction === 'UP' ? null : 'DOWN');
    if (!direction) continue;
    // Confirm continuation on next candle
    const continued = direction === 'UP' ? closeNext > closeCurr : closeNext < closeCurr;
    if (!continued) continue;
    // EMA stack filter
    const ema50 = ema50Arr[i];
    const ema100 = ema100Arr[i];
    const ema200 = ema200Arr[i];
    if (ema50 === undefined || ema100 === undefined || ema200 === undefined) continue;
    const bullishStack = ema50 > ema100 && ema100 > ema200;
    const bearishStack = ema50 < ema100 && ema100 < ema200;
    if ((direction === 'UP' && !bullishStack) || (direction === 'DOWN' && !bearishStack)) {
      continue;
    }
    // Trade
    total++;
    const entry = closes[i + 1];
    const exit = closes[i + 1 + expiryBars];
    const win = direction === 'UP' ? exit > entry : exit < entry;
    if (win) correct++;
  }
  return { total, correct, accuracy: total > 0 ? (correct / total) * 100 : 0 };
}

async function run() {
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880;
  let expiry = 1;
  let psarStep = 0.02;
  let psarMax = 0.2;
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
      case '--step':
        psarStep = parseFloat(args[i + 1]);
        i++;
        break;
      case '--max':
        psarMax = parseFloat(args[i + 1]);
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
  const res = backtestStrategy(candles, expiry, psarStep, psarMax);
  console.log(`PSAR+EMAStack backtest (expiry=${expiry}min, step=${psarStep}, max=${psarMax})`);
  console.log(`Total trades opened: ${res.total}`);
  console.log(`Winning trades     : ${res.correct}`);
  console.log(`Accuracy           : ${res.accuracy.toFixed(2)}%`);
}

if (require.main === module) {
  run().catch(err => console.error(err));
}