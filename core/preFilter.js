const { calculateEMA, calculateRSI, calculateMACD, calculateStochastic } = require('./indicators');
const { interpretCandlePattern } = require('./candleInterpreter');

function calculateAverageVolume(candles, lookback = 20) {
  const recent = candles.slice(-lookback);
  const totalVolume = recent.reduce((sum, c) => sum + parseFloat(c.volume), 0);
  return totalVolume / lookback;
}

function detectFibZones(candles) {
  const highs = candles.map(c => parseFloat(c.high));
  const lows = candles.map(c => parseFloat(c.low));
  const recentHigh = Math.max(...highs.slice(-100));
  const recentLow = Math.min(...lows.slice(-100));
  const fib0618 = recentHigh - (recentHigh - recentLow) * 0.618;
  return { fib0618, recentHigh, recentLow };
}

function detectVolumeBias(candles, avgVolume) {
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const volNow = parseFloat(last.volume);
  const body = parseFloat(last.close) - parseFloat(last.open);
  const bullish = body > 0;
  const bearish = body < 0;
  const spike = volNow > avgVolume * 1.5;

  if (spike && bullish) return 'BUY_BIAS';
  if (spike && bearish) return 'SELL_BIAS';
  return 'NEUTRAL';
}

function preFilter(candles) {
  if (candles.length < 220) {
    return { shouldTrade: false, reason: 'Not enough candles', confirmations: [], context: {} };
  }

  const closePrices = candles.map(c => parseFloat(c.close));
  const emaFast = calculateEMA(closePrices, 7);   // EMA7
  const emaSlow = calculateEMA(closePrices, 20);  // EMA20
  const rsi = calculateRSI(closePrices, 14);
  const macd = calculateMACD(closePrices);
  const stochastic = calculateStochastic(candles);
  const avgVolume = calculateAverageVolume(candles, 20);
  const latestCandle = candles.at(-1);
  const prevCandle = candles.at(-2);
  const pattern = interpretCandlePattern(prevCandle, latestCandle);
  const { fib0618 } = detectFibZones(candles);

  const confirmations = [];

  const emaFastCurrent = emaFast.at(-1);
  const emaSlowCurrent = emaSlow.at(-1);
  const price = parseFloat(latestCandle.close);

  // ✅ Fast Trend: EMA7 vs EMA20
  const trendUp = emaFastCurrent > emaSlowCurrent;
  const trendDown = emaFastCurrent < emaSlowCurrent;
  if (trendUp || trendDown) {
    confirmations.push(`Fast Trend: ${trendUp ? 'UP' : 'DOWN'} (EMA7 ${trendUp ? '>' : '<'} EMA20)`);
  }

  // ✅ RSI bounce
  const rsiValue = rsi.at(-1);
  const rsiPrev = rsi.at(-2);
  if ((rsiValue < 30 && rsiValue > rsiPrev) || (rsiValue > 70 && rsiValue < rsiPrev)) {
    confirmations.push(`RSI bounce: ${rsiValue.toFixed(2)}`);
  }

  // ✅ Candle pattern
  if (pattern && pattern !== 'None') {
    confirmations.push(`Candle Pattern: ${pattern}`);
  }

  // ✅ Pullback to EMA20
  if (Math.abs(price - emaSlowCurrent) / emaSlowCurrent < 0.0015) {
    confirmations.push('Pullback: Touched EMA20');
  }

  // ✅ Momentum Shift: MACD or Stochastic
  let macdCrossed = false;
  let macdHist = [], macdSignal = [], macdLine = [];
  if (macd && macd.macd?.length >= 2 && macd.signal?.length >= 2) {
    macdHist = macd.histogram;
    macdSignal = macd.signal;
    macdLine = macd.macd;
    macdCrossed = macdLine.at(-2) < macdSignal.at(-2) && macdLine.at(-1) > macdSignal.at(-1);
  }

  const stochCrossed = stochastic.k.at(-2) < stochastic.d.at(-2) &&
                       stochastic.k.at(-1) > stochastic.d.at(-1);

  if (macdCrossed || stochCrossed) {
    confirmations.push('Momentum Shift: MACD or Stochastic crossover');
  }

  // ✅ Volume spike on reversal candle
  const latestVol = parseFloat(latestCandle.volume);
  if (latestVol > avgVolume * 1.5 && ['Doji', 'Hammer', 'Shooting Star'].includes(pattern)) {
    confirmations.push('Volume Spike on Reversal Candle');
  }

  // ✅ Timing: Near Fib 0.618
  if (Math.abs(price - fib0618) / fib0618 < 0.002) {
    confirmations.push('Timing Zone: Near Fib 0.618');
  }

  // 🧠 Volume Bias (soft GPT context)
  const volumeBias = detectVolumeBias(candles, avgVolume);

  const shouldTrade = confirmations.length >= 4;

  return {
    shouldTrade,
    confirmations,
    context: {
      ema7: emaFastCurrent,
      ema20: emaSlowCurrent,
      rsi: rsiValue,
      pattern,
      macdHist: macdHist.slice(-2),
      stochastic: {
        k: stochastic.k.slice(-2),
        d: stochastic.d.slice(-2),
      },
      price,
      fib0618,
      avgVolume,
      latestVolume: latestVol,
      volumeBias
    }
  };
}

module.exports = preFilter;
