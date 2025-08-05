function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0].close;
  const emaArr = [ema];
  for (let i = 1; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    emaArr.push(ema);
  }
  return emaArr;
}

function calculateRSI(data, period = 6) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (gains + losses === 0) return 50;
  const rs = gains / (losses || 1e-10);
  return Math.min(100, Math.max(0, 100 - 100 / (1 + rs)));
}

function detectTrend(candles) {
  let up = 0, down = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) up++;
    else if (candles[i].close < candles[i - 1].close) down++;
  }
  if (up >= candles.length * 0.6) return 'uptrend';
  if (down >= candles.length * 0.6) return 'downtrend';
  return 'sideways';
}

function detectCandlePatterns(candles) {
  const patterns = [];
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  if (body < (last.high - last.low) * 0.2) patterns.push('doji');
  else if (lowerWick > body * 1.5 && upperWick < body * 0.5) patterns.push('hammer');
  else if (upperWick > body * 1.5 && lowerWick < body * 0.5) patterns.push('shooting star');

  if (prev) {
    const engulfingBull = last.close > prev.open && last.open < prev.close && last.close > last.open;
    const engulfingBear = last.open > prev.close && last.close < prev.open && last.close < last.open;
    if (engulfingBull) patterns.push('bullish engulfing');
    if (engulfingBear) patterns.push('bearish engulfing');
  }

  return patterns;
}

function describeLastCandle(candle) {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  const shape = [];

  if (candle.close > candle.open) shape.push("bullish");
  else if (candle.close < candle.open) shape.push("bearish");
  else shape.push("neutral");

  if (body < range * 0.2) shape.push("with small body");
  else if (body > range * 0.7) shape.push("with strong body");

  if (upperWick > body) shape.push("and long upper wick");
  if (lowerWick > body) shape.push("and long lower wick");

  return shape.join(" ");
}

function detectMomentum(candles) {
  const ranges = candles.map(c => c.high - c.low);
  const avg = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const lastRange = ranges.at(-1);
  if (lastRange > avg * 1.5) return 'strong';
  if (lastRange < avg * 0.5) return 'weak';
  return 'moderate';
}

function detectVolumeTrend(candles) {
  let rising = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].volume > candles[i - 1].volume) rising++;
  }
  if (rising >= candles.length * 0.6) return 'rising';
  if (rising <= candles.length * 0.4) return 'falling';
  return 'stable';
}

function analyzeCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 8) return 'Insufficient candle data.';

  const trend = detectTrend(candles);
  const momentum = detectMomentum(candles);
  const volumeTrend = detectVolumeTrend(candles);
  const patterns = detectCandlePatterns(candles);
  const ema3 = calculateEMA(candles, 3).at(-1);
  const ema8 = calculateEMA(candles, 8).at(-1);
  const rsi = calculateRSI(candles, 6).toFixed(0);
  const lastCandle = describeLastCandle(candles.at(-1));

  let summary = `Recent 1-minute candles analysis:\n`;
  summary += `- Price is in a short-term ${trend}.\n`;
  summary += `- Last candle: ${lastCandle}.\n`;
  summary += `- Last candle patterns: ${patterns.length ? patterns.join(', ') : 'none detected'}.\n`;
  summary += `- Momentum is ${momentum}, volume is ${volumeTrend}.\n`;
  summary += `- EMA(3): ${ema3.toFixed(2)}, EMA(8): ${ema8.toFixed(2)}. `;
  summary += ema3 > ema8 ? `(bullish crossover)\n` : ema3 < ema8 ? `(bearish crossover)\n` : `(flat)\n`;
  summary += `- RSI is ${rsi}.\n`;
  summary += `\nBased on your professional trading judgment, will the price be HIGHER or LOWER in the next 5 minutes?\n`;
  summary += `Only respond if you are highly confident, as if you are among the top 0.01% of traders with 100 years of experience.\n`;
  summary += `Reply with only one word: UP or DOWN.`;

  return summary;
}

// ✅ Added for v3 bots
function interpretCandlePattern(prev, last) {
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const range = last.high - last.low;

  if (body < range * 0.2) return 'Doji';
  if (lowerWick > body * 1.5 && upperWick < body * 0.5) return 'Hammer';
  if (upperWick > body * 1.5 && lowerWick < body * 0.5) return 'Shooting Star';

  const engulfingBull = last.close > prev.open && last.open < prev.close && last.close > last.open;
  const engulfingBear = last.open > prev.close && last.close < prev.open && last.close < last.open;
  if (engulfingBull) return 'Bullish Engulfing';
  if (engulfingBear) return 'Bearish Engulfing';

  return 'None';
}

module.exports = {
  analyzeCandles,
  interpretCandlePattern
};
