// /core/indicators.js
const { EMA, RSI, MACD, Stochastic } = require('technicalindicators');

// Calculate EMA
function calculateEMA(values, period) {
  return EMA.calculate({ period, values });
}

// Calculate RSI
function calculateRSI(values, period = 14) {
  return RSI.calculate({ period, values });
}

// Calculate MACD
function calculateMACD(values) {
  return MACD.calculate({
    values,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
}

// Calculate Stochastic (%K and %D)
function calculateStochastic(candles, period = 14, signalPeriod = 3) {
  const high = candles.map(c => parseFloat(c.high));
  const low = candles.map(c => parseFloat(c.low));
  const close = candles.map(c => parseFloat(c.close));

  const result = Stochastic.calculate({
    high,
    low,
    close,
    period,
    signalPeriod
  });

  const k = result.map(r => r.k);
  const d = result.map(r => r.d);

  return { k, d };
}

module.exports = {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateStochastic
};
