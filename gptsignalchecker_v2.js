// gptsignalchecker_v2.js
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { analyzeCandles } = require('./core/candleInterpreter');
const OpenAI = require('openai');

// === OPENAI SETUP ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === CONFIG ===
const MEXC_API = 'https://api.mexc.com/api/v3/klines';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '1m';
const LIMIT = 100;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o'; // default to gpt-4o
const LOG_FILE = path.join(__dirname, 'logs', 'signals-v2.json');

// === Fetch 1-minute candles ===
async function fetchCandles(symbol = SYMBOL, limit = LIMIT) {
  const url = `${MEXC_API}?symbol=${symbol}&interval=${INTERVAL}&limit=${limit}`;
  const res = await axios.get(url);
  return res.data.map(c => ({
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

// === Ask GPT for signal ===
async function askGPT(prompt) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const reply = response.choices[0].message.content.trim().toUpperCase();
  if (reply === 'UP' || reply === 'DOWN') return reply;
  return null;
}

// === Log Signal ===
function logSignal({ symbol, signal, prompt, rawResponse }) {
  const entry = {
    timestamp: Date.now(),
    symbol,
    signal,
    rawResponse,
    prompt
  };

  const file = LOG_FILE;
  let existing = [];

  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      existing = [];
    }
  }

  existing.push(entry);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

// === Main Signal Function ===
async function getSignal(symbol = SYMBOL, log = true) {
  try {
    const candles = await fetchCandles(symbol);
    const prompt = analyzeCandles(candles);
    const signal = await askGPT(prompt);

    if (log && signal) {
      logSignal({
        symbol,
        signal,
        prompt,
        rawResponse: signal
      });
    }

    return signal;
  } catch (err) {
    console.error('Signal generation failed:', err.message);
    return null;
  }
}

// === If run directly ===
if (require.main === module) {
  (async () => {
    const signal = await getSignal();
    console.log(`GPT Signal (v2):`, signal || 'No confident signal');
  })();
}

module.exports = { getSignal };
