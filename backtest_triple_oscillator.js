/**
 * Backtest script for binary options bot using Triple Oscillator strategy.
 *
 * This script loads a CSV file containing XAUUSD 1‑minute data and
 * generates synthetic volumes.  It computes RSI, Stochastic, and CCI
 * indicators on each candle and triggers trades only when all three
 * oscillators agree that the market is oversold (for a call) or
 * overbought (for a put).  A 200‑period EMA is used as a higher‑timeframe
 * filter: long trades are taken only when price is above its EMA200,
 * while short trades are taken only when price is below it.  Each trade
 * lasts one minute.  The final report includes total trades and
 * accuracy.
 *
 * This strategy is inspired by the "triple confirmation" method
 * discussed on LiteFinance: combining RSI, Stochastic, and CCI can
 * enhance trading performance because each oscillator alone may give
 * false signals, but together they form a stronger system【800739589050358†L416-L433】.
 * In practice, buy signals occur when all three indicators exit the
 * oversold zone simultaneously, and sell signals occur when they exit
 * the overbought zone【800739589050358†L504-L518】.  Here we adapt that logic
 * to a 1‑minute timeframe and filter trades with a 200‑period EMA.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  calculateEMA,
  calculateRSI,
  calculateStochastic
} = require('./core/indicators');
const { CCI } = require('./node_modules/technicalindicators');

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Synthetic volume generator reused from backtest.js
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
    const [hh, mm] = timeStr.split(':');
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
  // Input arguments
  const args = process.argv.slice(2);
  let csvFile = 'DAT_MT_XAUUSD_M1_202507.csv';
  let maxMinutes = 2880; // default: 2 days
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      csvFile = args[i + 1];
      i++;
    } else if (arg === '--minutes' && args[i + 1]) {
      maxMinutes = parseInt(args[i + 1], 10);
      i++;
    }
  }
  const csvPath = path.resolve(__dirname, csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }
  const data = loadCandles(csvPath, maxMinutes);
  if (data.length < 210) {
    console.error('Not enough data to run backtest.');
    return;
  }
  const history = [];
  let openTrades = [];
  let totalTrades = 0;
  let correctTrades = 0;
  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    history.push(candle);
    // Evaluate trade expiry
    if (openTrades.length) {
      const remaining = [];
      for (const trade of openTrades) {
        if (trade.expiryIndex === i) {
          const resultUp = data[i].close > trade.entryPrice;
          const resultDown = data[i].close < trade.entryPrice;
          const correct = (trade.direction === 'UP' && resultUp) || (trade.direction === 'DOWN' && resultDown);
          if (correct) correctTrades++;
          totalTrades++;
        } else {
          remaining.push(trade);
        }
      }
      openTrades = remaining;
    }
    // Need enough history to compute 200 EMA and indicators
    if (history.length < 200) continue;
    // Build arrays for indicator calculation
    const closes = history.map(c => c.close);
    const highs = history.map(c => c.high);
    const lows = history.map(c => c.low);
    // Compute EMA200
    const ema200Arr = calculateEMA(closes, 200);
    const ema200 = ema200Arr[ema200Arr.length - 1];
    // Compute RSI (14 period) and previous value
    const rsiArr = calculateRSI(closes);
    const rsi = rsiArr[rsiArr.length - 1];
    const rsiPrev = rsiArr[rsiArr.length - 2];
    // Compute Stochastic K and D (14,3) and previous values
    const { k, d } = calculateStochastic(history);
    const stochK = k[k.length - 1];
    const stochD = d[d.length - 1];
    const stochKPrev = k[k.length - 2];
    const stochDPrev = d[d.length - 2];
    // Compute CCI (14 period) and previous value
    const cciArr = CCI.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const cci = cciArr[cciArr.length - 1];
    const cciPrev = cciArr[cciArr.length - 2];
    // Determine oversold / overbought signals with reversal
    let signal = 'NONE';
    if (
      rsi !== undefined && rsiPrev !== undefined &&
      stochK !== undefined && stochD !== undefined && stochKPrev !== undefined && stochDPrev !== undefined &&
      cci !== undefined && cciPrev !== undefined
    ) {
      // Oversold: all oscillators below lower threshold and turning up
      const oversold = rsi < 35 && stochK < 20 && stochD < 20 && cci < -100;
      const turningUp = rsi > rsiPrev && stochK > stochKPrev && stochD > stochDPrev && cci > cciPrev;
      // Overbought: all oscillators above upper threshold and turning down
      const overbought = rsi > 65 && stochK > 80 && stochD > 80 && cci > 100;
      const turningDown = rsi < rsiPrev && stochK < stochKPrev && stochD < stochDPrev && cci < cciPrev;
      if (oversold && turningUp && candle.close > ema200) {
        signal = 'UP';
      } else if (overbought && turningDown && candle.close < ema200) {
        signal = 'DOWN';
      }
    }
    // Only trade when signal exists
    if (signal !== 'NONE') {
      openTrades.push({
        entryIndex: i,
        expiryIndex: i + 1,
        direction: signal,
        entryPrice: candle.close
      });
    }
  }
  console.log('Triple Oscillator strategy results');
  console.log('Total trades opened:', totalTrades);
  console.log('Correct trades     :', correctTrades);
  const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
  console.log('Accuracy           :', accuracy.toFixed(2) + '%');
}

if (require.main === module) {
  backtest();
}