/**
 * Backtest a Keltner Channel breakout strategy with EMA trend filter.
 *
 * Keltner Channels consist of a moving average (typically 20‑period
 * EMA) with bands set a multiple of the Average True Range (ATR) above
 * and below it.  When price breaks above the upper band in the
 * direction of the prevailing trend, it may signal the start of a
 * strong move.  Conversely, a break below the lower band in a
 * downtrend can signal continuation lower.  To avoid whipsaws, we
 * require a 50‑EMA and 200‑EMA to be aligned with the breakout: we
 * only go long when EMA50 > EMA200 and the close crosses above the
 * Keltner upper band; we only go short when EMA50 < EMA200 and the
 * close crosses below the lower band.  As with the PSAR strategy,
 * trades are opened on the next candle and evaluated after an
 * adjustable expiry period.
 *
 * This implementation uses the KeltnerChannels indicator from the
 * `technicalindicators` library.  We use default parameters (period
 * 20, multiplier 2).  Synthetic volumes are generated and ignored.
 */

const fs = require('fs');
const path = require('path');
const { KeltnerChannels, EMA } = require('./node_modules/technicalindicators');

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

function backtest(candles, expiryBars = 1) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  // compute keltner channels with default period 20 and multiplier 2
  const kcArr = KeltnerChannels.calculate({ close: closes, high: highs, low: lows, period: 20, multiplier: 2 });
  const ema50Arr = EMA.calculate({ period: 50, values: closes });
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  let total = 0;
  let correct = 0;
  // KeltnerChannels returns an array starting after `period` bars
  for (let i = 0; i < candles.length - (expiryBars + 1); i++) {
    const kc = kcArr[i];
    if (!kc) continue;
    const idx = i + (20 - 1); // kcArr aligns with index (period-1)
    // Indices for ema arrays: they start after period bars
    const ema50 = ema50Arr[idx];
    const ema200 = ema200Arr[idx];
    if (ema50 === undefined || ema200 === undefined) continue;
    const closeCurr = closes[idx];
    const closePrev = closes[idx - 1];
    const kcUpper = kc.upper;
    const kcLower = kc.lower;
    // Determine breakout direction.  For a contrarian approach,
    // we'll bet on mean reversion: go DOWN when price closes above the
    // upper band and go UP when price closes below the lower band.  We
    // still use EMA alignment to avoid fighting strong trends.
    let direction = null;
    // price closes above upper band: short reversal if trend is neutral or bearish
    if (closePrev <= kcUpper && closeCurr > kcUpper) {
      // If ema50 < ema200 (bearish) or roughly equal (no trend), we take short
      if (ema50 <= ema200) {
        direction = 'DOWN';
      }
    }
    // price closes below lower band: long reversal if trend is neutral or bullish
    if (closePrev >= kcLower && closeCurr < kcLower) {
      if (ema50 >= ema200) {
        direction = direction ? null : 'UP';
      }
    }
    if (!direction) continue;
    const entry = closes[idx + 1];
    const exit = closes[idx + 1 + expiryBars];
    const win = direction === 'UP' ? exit > entry : exit < entry;
    total++;
    if (win) correct++;
  }
  return { total, correct, accuracy: total > 0 ? (correct / total) * 100 : 0 };
}

async function run() {
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880;
  let expiry = 1;
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
    }
  }
  const csvPath = path.resolve(__dirname, csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }
  const candles = loadCandles(csvPath, maxMinutes);
  const res = backtest(candles, expiry);
  console.log(`Keltner breakout backtest (expiry=${expiry})`);
  console.log(`Total trades opened: ${res.total}`);
  console.log(`Winning trades     : ${res.correct}`);
  console.log(`Accuracy           : ${res.accuracy.toFixed(2)}%`);
}

if (require.main === module) {
  run().catch(err => console.error(err));
}