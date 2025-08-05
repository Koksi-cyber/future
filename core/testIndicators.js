// /core/checkAndFormatSignals_v3.js
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../logs/signals_v3.json');
const API_URL = 'https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT';
const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes in ms
const EXACT_WINDOW = 10_000; // ±10 seconds

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false });
}

function formatDateTime(ms) {
  return new Date(ms).toLocaleString('en-US', { hour12: false });
}

async function fetchCurrentPrice() {
  try {
    const res = await axios.get(API_URL);
    return parseFloat(res.data.price);
  } catch (err) {
    console.error('❌ Failed to fetch MEXC price:', err.message);
    return null;
  }
}

async function run() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error('❌ signals_v3.json not found.');
    return;
  }

  const now = Date.now();
  let signals = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  let updated = false;

  for (let signal of signals) {
    if (signal.result !== null) continue;

    const targetConfirmTime = signal.timestamp + EXPIRY_MS;
    const timeUntilConfirm = targetConfirmTime - now;

    // Only confirm if 5 minutes have passed
    if (timeUntilConfirm > 0) continue;

    const livePrice = await fetchCurrentPrice();
    if (!livePrice) continue;

    const wentUp = livePrice > signal.priceAtSignal;
    const result =
      signal.signal === 'UP' ? (wentUp ? 'correct' : 'wrong') :
      signal.signal === 'DOWN' ? (!wentUp ? 'correct' : 'wrong') :
      'invalid';

    const confirmedAtTime = Date.now();
    const confirmedDelay = Math.abs(confirmedAtTime - targetConfirmTime);
    const isExact = confirmedDelay <= EXACT_WINDOW;

    // Update the signal with confirmation details
    signal.result = result;
    signal.confirmedAt = formatTime(confirmedAtTime);
    signal.priceAtConfirmation = livePrice;
    signal.confirmedAfterExactly5min = isExact;
    signal.signalTime = formatDateTime(signal.timestamp);

    updated = true;

    console.log(
      `📌 [${signal.signalTime}] Signal ${signal.signal} → ${result.toUpperCase()} @ ${livePrice} (${formatTime(confirmedAtTime)} | ${isExact ? '⏱ Exact' : '🕒 Delayed'})`
    );
  }

  if (updated) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(signals, null, 2));
    console.log('✅ signals_v3.json updated.');
  } else {
    console.log('⏭ No signals ready to confirm yet.');
  }
}

run();
