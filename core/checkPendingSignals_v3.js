// /core/checkPendingSignals_v3_loop.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_FILE = path.join(__dirname, '../logs/signals_v3.json');
const SYMBOL = 'BTCUSDT';
const PRICE_URL = `https://api.mexc.com/api/v3/ticker/price?symbol=${SYMBOL}`;
const INTERVAL_MS = 30 * 1000; // 30 seconds

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

async function fetchCurrentPrice() {
  try {
    const res = await axios.get(PRICE_URL);
    return // /core/checkPendingSignals_v3_loop.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SYMBOL = process.env.TV_SYMBOL || 'BTCUSDT';
const LOG_FILE = path.resolve('logs', 'signals_v3.json');
const INTERVAL_MS = 30 * 1000;

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

async function fetchCurrentPrice() {
  return new Promise((resolve, reject) => {
    const cmd = `python ./core/tvLastPrice.py`;
    exec(cmd, (error, stdout) => {
      if (error) return reject('Failed to run tvLastPrice.py');
      try {
        const result = JSON.parse(stdout);
        if (result.error) return reject(result.error);
        resolve(parseFloat(result.price));
      } catch (err) {
        reject('Invalid response from tvLastPrice.py');
      }
    });
  }).catch(err => {
    console.error('❌ Fetch price error:', err);
    return null;
  });
}

async function checkSignals() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('❌ signals_v3.json not found.');
    return;
  }

  const now = Date.now();
  let signals = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  let updated = false;

  for (const signal of signals) {
    if (signal.result !== 'PENDING') continue;
    if (now < signal.checkAt) continue;

    const currentPrice = await fetchCurrentPrice();
    if (!currentPrice) continue;

    const wentUp = currentPrice > signal.entryPrice;
    const result =
      signal.signal === 'UP' ? (wentUp ? 'CORRECT' : 'WRONG') :
      signal.signal === 'DOWN' ? (!wentUp ? 'CORRECT' : 'WRONG') :
      'INVALID';

    signal.endPrice = currentPrice;
    signal.confirmedAt = formatTime(now);
    signal.result = result;
    updated = true;

    console.log(
      `✅ Confirmed [${signal.signalTime}] ${signal.signal} → ${result} | entry: ${signal.entryPrice} → end: ${currentPrice}`
    );
  }

  if (updated) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(signals, null, 2));
    console.log('✅ signals_v3.json updated.');
  } else {
    console.log('⏭ Nothing to confirm yet.');
  }
}

async function startLoop() {
  console.log(`🔁 Checking ${SYMBOL} signals every ${INTERVAL_MS / 1000}s using TradingView...`);
  while (true) {
    await checkSignals();
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

startLoop();
parseFloat(res.data.price);
  } catch (err) {
    console.error('❌ Failed to fetch current price:', err.message);
    return null;
  }
}

async function checkSignals() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('❌ signals_v3.json not found.');
    return;
  }

  const now = Date.now();
  let signals = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  let updated = false;

  for (const signal of signals) {
    if (signal.result !== 'PENDING') continue;
    if (now < signal.checkAt) continue;

    const currentPrice = await fetchCurrentPrice();
    if (!currentPrice) continue;

    const wentUp = currentPrice > signal.entryPrice;
    const result =
      signal.signal === 'UP' ? (wentUp ? 'CORRECT' : 'WRONG') :
      signal.signal === 'DOWN' ? (!wentUp ? 'CORRECT' : 'WRONG') :
      'INVALID';

    signal.endPrice = currentPrice;
    signal.confirmedAt = formatTime(now);
    signal.result = result;
    updated = true;

    console.log(
      `✅ Confirmed [${signal.signalTime}] ${signal.signal} → ${result} | entry: ${signal.entryPrice} → end: ${currentPrice}`
    );
  }

  if (updated) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(signals, null, 2));
    console.log('✅ signals_v3.json updated.');
  } else {
    console.log('⏭ Nothing to confirm yet.');
  }
}

async function startLoop() {
  console.log('🔁 Starting signal checker loop (every 30s)...');
  while (true) {
    await checkSignals();
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

startLoop();
