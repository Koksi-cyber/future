const { EMA, RSI, MACD } = require('technicalindicators');

/**
 * Enhances candle array with EMA, RSI, MACD, and volume avg indicators.
 * @param {Array} candles - Array of {timestamp, open, high, low, close, volume}
 * @returns {Array} - Array with indicators added to each candle
 */
function calculateIndicators(candles) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  // ✅ Compute Fast EMAs
  const ema7 = EMA.calculate({ period: 7, values: closes });
  const ema20 = EMA.calculate({ period: 20, values: closes });

  // ✅ RSI (period 14)
  const rsi14 = RSI.calculate({ period: 14, values: closes });

  // ✅ MACD (standard 12/26/9)
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });

  // ✅ Rolling 5-candle volume average (for spike detection)
  const avgVolumeWindow = 5;
  const volumeAvgs = candles.map((_, i, arr) => {
    if (i < avgVolumeWindow - 1) return null;
    const slice = arr.slice(i - avgVolumeWindow + 1, i + 1);
    const sum = slice.reduce((total, c) => total + c.volume, 0);
    return sum / avgVolumeWindow;
  });

  const offset = candles.length;

  return candles.map((candle, index) => ({
    ...candle,
    ema7: ema7[index - (offset - ema7.length)] || null,
    ema20: ema20[index - (offset - ema20.length)] || null,
    rsi: rsi14[index - (offset - rsi14.length)] || null,
    macdLine: macd[index - (offset - macd.length)]?.MACD || null,
    signalLine: macd[index - (offset - macd.length)]?.signal || null,
    histogram: macd[index - (offset - macd.length)]?.histogram || null,
    volumeAvg5: volumeAvgs[index] || null
  }));
}

module.exports = { calculateIndicators };
