require('dotenv').config();
const { OpenAI } = require('openai');
const preFilter = require('./preFilter');
const fs = require('fs');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_SYMBOL = process.env.TV_SYMBOL || process.env.SYMBOL || 'BTCUSDT';
const TIMEFRAME = process.env.TIMEFRAME || '1m';

console.log('🧠 Running patched gptSignalChecker_v3.js...');

/**
 * Gets GPT-based binary options signal
 * @param {Array} candles - Candle data to analyze
 * @param {string} symbol - Trading pair (default from .env)
 */
async function getGptSignal(candles, symbol = DEFAULT_SYMBOL) {
  const filter = preFilter(candles);

  if (!filter.shouldTrade) {
    return {
      signal: 'NONE',
      confidence: 0,
      reason: 'Market does not meet minimum confirmation criteria',
      skipped: true
    };
  }

  const { confirmations, context } = filter;

  const volumeBiasNote = {
    BUY_BIAS: "⚠️ There is a recent spike in buying volume (green candle + high volume). Be cautious about shorting.",
    SELL_BIAS: "⚠️ There is a recent spike in selling volume (red candle + high volume). Be cautious about longing.",
    NEUTRAL: "Volume appears neutral with no directional spike."
  };

  const prompt = `
You are a top binary options trader with 100 years of experience. 
You are now analyzing a fast-moving scalping setup for GOLD (XAUUSD) using 1-minute candles. 
Your tools include EMA7, EMA20, RSI, MACD, candle patterns, volume spikes, and Fibonacci zones.
Only give a signal if multiple high-probability confluences align.

Symbol: ${symbol}
Timeframe: ${TIMEFRAME}
Trend: ${confirmations.find(c => c.includes('Fast Trend')) || 'Not clear'}
EMA7: ${context.ema7?.toFixed(2) || 'N/A'} | EMA20: ${context.ema20?.toFixed(2) || 'N/A'}
RSI: ${context.rsi?.toFixed(2) || 'N/A'}
Candle Pattern: ${context.pattern}
Price Action: ${confirmations.find(c => c.includes('Pullback')) || 'None'}
Volume Spike: ${confirmations.find(c => c.includes('Volume')) || 'Normal'}
MACD: Histogram = ${context.macdHist.join(', ')}
Stochastic: %K = ${context.stochastic.k.join(', ')}, %D = ${context.stochastic.d.join(', ')}
Fib Level: ${confirmations.find(c => c.includes('Fib')) || 'N/A'}

Volume Bias Insight: ${volumeBiasNote[context.volumeBias]}

Should we enter an UP or DOWN binary options trade for the next 1 minute?

Respond strictly in JSON format:
{
  "signal": "UP" | "DOWN" | "NONE",
  "confidence": 0–100,
  "reason": "Your brief reason"
}

Only return NONE if this setup is too risky or lacks strong confirmation.
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: 'Respond strictly in JSON and only after analyzing all confluences.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    });

    let raw = completion.choices[0].message.content.trim();
    console.log('🧠 Raw GPT Output:\n', raw); // Debug

    if (raw.startsWith('```json') || raw.startsWith('```')) {
      raw = raw.replace(/```json|```/g, '').trim();
    }

    const parsed = JSON.parse(raw);

    if (!['UP', 'DOWN', 'NONE'].includes(parsed.signal)) {
      console.warn('⚠️ GPT returned invalid signal value:', parsed.signal);
      throw new Error("Invalid signal");
    }

    if (typeof parsed.confidence !== 'number') {
      console.warn('⚠️ GPT returned invalid confidence value:', parsed.confidence);
      throw new Error("Invalid confidence");
    }

    return {
      ...parsed,
      skipped: false,
      priceAtSignal: context.price,
      timestamp: Date.now(),
      symbol
    };
  } catch (err) {
    console.error('❌ GPT Signal Error:', err.message);
    console.error('⚠️ GPT response may be malformed or incomplete');

    return {
      signal: 'NONE',
      confidence: 0,
      reason: 'Failed to parse or fetch GPT response',
      skipped: true
    };
  }
}

module.exports = getGptSignal;
