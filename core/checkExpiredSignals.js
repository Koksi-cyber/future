// /core/fetchEndPricesByCheckTime_v3.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FILE_PATH = path.join(__dirname, '../logs/signals_v3.json');
const MEXC_API = 'https://api.mexc.com/api/v3/klines';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '1m';
const DELAY = 100; // ms between requests

function msToMinute(ms) {
  return Math.floor(ms / 60000) * 60000;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(ms) {
  return new Date(ms).toLocaleString('en-GB');
}

async function fetchCandleForMinute(startMs) {
  const url = `${MEXC_API}?symbol=${SYMBOL}&interval=${INTERVAL}&startTime=${startMs}&limit=1`;
  try {
    const res = await axios.get(url);
    const candle = res.data[0];
    if (!candle) return null;
    return parseFloat(candle[4]); // close price
  } catch (err) {
    console.error(`❌ Error fetching candle for ${formatDate(startMs)}:`, err.message);
    return null;
  }
}

async function run() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error('❌ signals_v3.json not found.');
    return;
  }

  let signals = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

  // Group unique checkAt times (rounded)
  const pendingSignals = signals.filter(s => !s.endPrice && s.checkAt <= Date.now());
  const checkTimeMap = {};

  for (const entry of pendingSignals) {
    const roundedCheck = msToMinute(entry.checkAt);
    if (!checkTimeMap[roundedCheck]) checkTimeMap[roundedCheck] = [];
    checkTimeMap[roundedCheck].push(entry);
  }

  const uniqueTimestamps = Object.keys(checkTimeMap).map(Number);
  if (uniqueTimestamps.length === 0) {
    console.log('⏭ No signals ready for historical price check.');
    return;
  }

  console.log(`📡 Fetching ${uniqueTimestamps.length} 1m candles...`);

  let updated = false;

  for (const ts of uniqueTimestamps) {
    const closePrice = await fetchCandleForMinute(ts);
    if (closePrice === null) {
      console.warn(`⚠️ No candle for ${formatDate(ts)}`);
    } else {
      for (const signal of checkTimeMap[ts]) {
        signal.endPrice = closePrice;
        console.log(
          `✅ [${signal.checkTime}] ${signal.signal} → endPrice: ${closePrice} (entryPrice: ${signal.entryPrice})`
        );
        updated = true;
      }
    }

    await delay(DELAY); // pause before next request
  }

  if (updated) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(signals, null, 2));
    console.log('✅ signals_v3.json updated with historical endPrices.');
  } else {
    console.log('⏭ No updates made.');
  }
}

run();
