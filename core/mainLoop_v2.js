require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { analyzeCandles } = require('./candleInterpreter');
const { checkPendingSignalsV2 } = require('./signalTracker_v2'); // ✅ updated
const log = require('console-log-level')({ level: 'info' });
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYMBOL = 'BTCUSDT';
const INTERVAL = '1m';
const LIMIT = 100;
const INTERVAL_MS = 60 * 1000;
const MEXC_API = 'https://api.mexc.com/api/v3/klines';
const LOG_FILE = path.join(__dirname, '../logs/signals_v2.json');

async function fetchCandles(symbol, limit = 100) {
  const url = `${MEXC_API}?symbol=${symbol}&interval=${INTERVAL}&limit=${limit}`;
  const res = await axios.get(url);
  return res.data.map(c => ({
    time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
  }));
}

async function getGptSignal(candles, symbol) {
  const analysis = analyzeCandles(candles);

  const messages = [
    {
      role: 'system',
      content: `You are a professional binary options analyst with 100 years of trading experience. Only predict if price will be HIGHER or LOWER in the next 5 minutes if highly confident.`
    },
    { role: 'user', content: analysis }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.3,
    });

    const reply = completion.choices[0].message.content.trim().toUpperCase();
    if (reply === 'UP' || reply === 'DOWN') {
      return { signal: reply, reason: analysis };
    }
  } catch (err) {
    log.error(`OpenAI error: ${err.message}`);
  }

  return { signal: 'NONE' };
}

function logSignalV2(symbol, signal, price, reason) {
  const entry = {
    timestamp: Date.now(),
    symbol,
    signal,
    entryPrice: price,
    checkAt: Date.now() + 5 * 60 * 1000,
    reason,
    result: 'PENDING'
  };

  const file = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '[]';
  const logs = JSON.parse(file);
  logs.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

async function runLoop() {
  log.info(`🟢 GPT Signal Bot v2 running for ${SYMBOL}`);

  while (true) {
    try {
      const candles = await fetchCandles(SYMBOL, LIMIT);
      const signal = await getGptSignal(candles, SYMBOL);

      if (signal.signal !== 'NONE') {
        const price = candles[candles.length - 1].close;
        log.info(`🚀 SIGNAL: ${signal.signal} → ${price}`);
        logSignalV2(SYMBOL, signal.signal, price, signal.reason);
      } else {
        log.info(`⚪ No confident signal returned.`);
      }

      // ✅ Check v2 signals specifically
      await checkPendingSignalsV2();

    } catch (err) {
      log.error(`Loop error: ${err.message}`);
    }

    log.info(`⏳ Waiting 60 seconds...\n`);
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

runLoop();
