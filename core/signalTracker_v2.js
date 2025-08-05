// /core/signalTracker_v2.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('console-log-level')({ level: 'info' });

const LOG_FILE = path.join(__dirname, '../logs/signals_v2.json');
const SYMBOL = 'BTCUSDT';
const MEXC_API = 'https://api.mexc.com/api/v3/klines';

async function fetchCurrentPrice(symbol) {
  const url = `${MEXC_API}?symbol=${symbol}&interval=1m&limit=1`;
  const res = await axios.get(url);
  return parseFloat(res.data[0][4]); // close price
}

async function checkPendingSignalsV2() {
  if (!fs.existsSync(LOG_FILE)) return;

  const raw = fs.readFileSync(LOG_FILE);
  const signals = JSON.parse(raw);
  const now = Date.now();

  let updated = false;

  for (const entry of signals) {
    if (entry.result === 'PENDING' && now >= entry.checkAt) {
      try {
        const price = await fetchCurrentPrice(entry.symbol);
        entry.checkedPrice = price;
        entry.checkedAt = now;

        const isCorrect = entry.signal === 'UP'
          ? price > entry.entryPrice
          : price < entry.entryPrice;

        entry.result = isCorrect ? 'CORRECT' : 'WRONG';
        log.info(`📈 Signal ${entry.signal} checked: ${entry.entryPrice} → ${price} = ${entry.result}`);
        updated = true;

      } catch (err) {
        log.error(`❌ Failed to check signal: ${err.message}`);
      }
    }
  }

  if (updated) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(signals, null, 2));
  }
}

module.exports = { checkPendingSignalsV2 };
