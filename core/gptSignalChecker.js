// /core/gptSignalChecker.js

require('dotenv').config();
const { OpenAI } = require('openai');
const log = require('console-log-level')({ level: 'info' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GPT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

/**
 * Sends indicator-enhanced candle data to GPT for binary signal analysis
 * @param {Array} candlesWithIndicators - Array of enriched candles
 * @param {string} symbol - e.g., "BTCUSDT"
 * @returns {Promise<Object>} - { signal: "UP" | "DOWN" | "NONE", confidence, reason }
 */
async function getGptSignal(candlesWithIndicators, symbol = 'BTCUSDT') {
  const latestCandles = candlesWithIndicators.slice(-30);

  const prompt = `
You are one of the most elite binary options analysts in the world — in the top 0.01%.
You’ve been profitably trading for over 100 years.

You will be given the last 30× 1-minute candlesticks for a crypto pair (${symbol}), with:
- open, high, low, close, volume
- EMA 5, 10, 20
- RSI
- MACD line, signal line, histogram

Your task:
- Identify if there’s a high-confidence 5-minute binary options trade opportunity right now.
- Only give a signal if the trade setup is very strong (based on confluence of indicators + candle structure).
- Otherwise say "NONE" to skip it.

Respond in JSON:
{
  "signal": "UP" | "DOWN" | "NONE",
  "confidence": 0-100,
  "reason": "Explain in 1–2 sentences using indicators and price action"
}
`;

  const systemMessage = { role: 'system', content: 'You are a binary options trading expert.' };
  const userMessage = {
    role: 'user',
    content: `${prompt}\n\nLatest data:\n${JSON.stringify(latestCandles, null, 2)}`
  };

  try {
    const chat = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [systemMessage, userMessage],
      temperature: 0.3
    });

    const response = chat.choices[0]?.message?.content;
    const cleaned = response.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!['UP', 'DOWN', 'NONE'].includes(parsed.signal)) throw new Error('Invalid signal');

    log.info(`GPT Signal: ${parsed.signal} (${parsed.confidence}%) → ${parsed.reason}`);
    return parsed;

  } catch (err) {
    log.error(`GPT signal fetch failed: ${err.message}`);
    return { signal: 'NONE', confidence: 0, reason: 'Error or invalid GPT response' };
  }
}

module.exports = { getGptSignal };
