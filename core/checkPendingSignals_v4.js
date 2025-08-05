require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SYMBOL = process.env.TV_SYMBOL || 'BTCUSDT';
const LOG_FILE = path.resolve('logs', 'signals_v4.json');
const INTERVAL_MS = 5 * 1000; // check every 5 seconds for precision

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

async function fetchCurrentPrice() {
  return new Promise((resolve, reject) => {
    const cmd = `python ./core/tvFetcher.py`;
    exec(cmd, (error, stdout) => {
      if (error) return reject('❌ Failed to run tvFetcher.py');

      try {
        const candles = JSON.parse(stdout);
        if (!Array.isArray(candles) || candles.length === 0) {
          return reject('⚠️ No candle data returned');
        }

        const last = candles.at(-1);
        resolve(parseFloat(last.close));
      } catch (err) {
        reject('❌ Invalid JSON from tvFetcher.py');
      }
    });
  }).catch(err => {
    console.error('❌ Fetch price error:', err);
    return null;
  });
}

async function checkSignals() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('❌ signals_v4.json not found.');
    return;
  }

  const now = Date.now();
  let signals = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  let updated = false;

  for (const signal of signals) {
    if (signal.result !== 'PENDING') continue;

    // ✅ Wait until checkAt is reached
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

    // 🕐 Optional: Mark if confirmed late (2s+ delay)
    const delay = now - signal.checkAt;
    if (delay > 2000) {
      signal.confirmedLate = true;
      console.warn(`⚠️ Confirmed late by ${delay}ms`);
    }

    updated = true;

    console.log(
      `✅ Confirmed [${signal.signalTime}] ${signal.signal} → ${result} | entry: ${signal.entryPrice} → end: ${currentPrice}` +
      (signal.confirmedLate ? ` ⚠️ (late)` : '')
    );
  }

  if (updated) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(signals, null, 2));
    console.log('✅ signals_v4.json updated.\n');
  } else {
    console.log('⏭ Nothing to confirm yet.\n');
  }
}

async function startLoop() {
  console.log(`🔁 Starting v4 signal checker loop (every ${INTERVAL_MS / 1000}s) using TradingView (${SYMBOL})...`);
  while (true) {
    await checkSignals();
    await new Promise(res => setTimeout(res, INTERVAL_MS));
  }
}

startLoop();
