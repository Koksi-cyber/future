const fs = require('fs');
const path = require('path');
const { fetchCandles } = require('./priceFetcher');

const LOG_FILE = path.join(__dirname, '../logs/signals.json');

function loadSignals() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '[]');
    return [];
  }

  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('❌ Failed to parse signals.json. Resetting file...');
    fs.writeFileSync(LOG_FILE, '[]');
    return [];
  }
}

function saveSignals(signals) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(signals, null, 2));
}

function logSignal(symbol, signal, price) {
  const signals = loadSignals();
  const now = Date.now();
  signals.push({
    timestamp: now,
    symbol,
    signal,
    entryPrice: price,
    checkAt: now + 5 * 60 * 1000,
    result: 'PENDING'
  });
  saveSignals(signals);
}

async function checkPendingSignals() {
  const signals = loadSignals();
  const now = Date.now();
  let changed = false;

  for (const s of signals) {
    if (s.result === 'PENDING' && now >= s.checkAt) {
      try {
        const candles = await fetchCandles(s.symbol, 1);
        const current = candles[candles.length - 1].close;
        const isUp = current > s.entryPrice;
        const isDown = current < s.entryPrice;

        if (s.signal === 'UP') {
          s.result = isUp ? 'CORRECT' : 'WRONG';
        } else if (s.signal === 'DOWN') {
          s.result = isDown ? 'CORRECT' : 'WRONG';
        } else {
          s.result = 'SKIPPED';
        }
        s.checkedPrice = current;
        s.checkedAt = now;
        changed = true;
      } catch (err) {
        console.error(`Failed to check result: ${err.message}`);
      }
    }
  }

  if (changed) saveSignals(signals);
}

function calculateAccuracy(sinceMs = 0) {
  const signals = loadSignals();
  const now = Date.now();
  const filtered = signals.filter(s => s.result !== 'PENDING' && s.timestamp >= sinceMs);
  const correct = filtered.filter(s => s.result === 'CORRECT').length;
  const total = filtered.length;

  const percent = total > 0 ? ((correct / total) * 100).toFixed(2) : 'N/A';

  return {
    from: new Date(sinceMs).toISOString(),
    to: new Date(now).toISOString(),
    total,
    correct,
    percent
  };
}

module.exports = {
  logSignal,
  checkPendingSignals,
  calculateAccuracy
};
