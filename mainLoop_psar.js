require('dotenv').config();
const fs = require('fs');
const path = require('path');
const psarSignal = require('./core/psarStrategy');
const getCandles = require('./core/priceFetcher');

// Pull config from .env
const SYMBOL = process.env.TV_SYMBOL || process.env.SYMBOL || 'BTCUSDT';
const EXCHANGE = process.env.TV_EXCHANGE || 'BINANCE';

// Log file for 1‑minute expiry signals
const LOG_FILE_PSAR = path.resolve('logs', 'signals_psar.json');

async function fetchCandles() {
  try {
    const candles = await getCandles(SYMBOL, EXCHANGE);
    if (!candles || candles.length === 0) throw new Error('Empty array');
    // Add a timestamp to each candle to match expected format
    return candles.map(c => ({
      timestamp: Date.now(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }));
  } catch (err) {
    console.error('❌ Error fetching candles:', err.message);
    return [];
  }
}

function saveSignal(signal, price) {
  const now = Date.now();
  const entry = {
    timestamp: now,
    signalTime: new Date(now).toLocaleString('en-GB', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    symbol: SYMBOL,
    signal: signal.signal,
    confidence: signal.confidence,
    reason: signal.reason,
    entryPrice: price,
    result: 'PENDING',
    confirmedAt: null,
    endPrice: null,
    // PSAR strategy uses 1‑minute expiry
    checkAt: now + 1 * 60 * 1000
  };
  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    const logs = fs.existsSync(LOG_FILE_PSAR)
      ? JSON.parse(fs.readFileSync(LOG_FILE_PSAR, 'utf8'))
      : [];
    logs.push(entry);
    fs.writeFileSync(LOG_FILE_PSAR, JSON.stringify(logs, null, 2));
    console.log(`📝 Logged PSAR Signal: ${signal.signal} | ${signal.confidence}% @ ${price}`);
  } catch (err) {
    console.error('❌ Failed to write PSAR signal logs:', err.message);
  }
}

async function runLoop() {
  console.log(`[PSAR Loop] Fetching ${SYMBOL} candles from ${EXCHANGE}...`);
  const candles = await fetchCandles();
  if (candles.length < 210) {
    console.warn(`⚠️ Not enough candles fetched (${candles.length})`);
    return;
  }
  console.log(`📊 PSAR analysis on ${candles.length} candles...`);
  const signal = psarSignal(candles);
  if (!signal.skipped && ['UP', 'DOWN'].includes(signal.signal)) {
    const price = parseFloat(candles.at(-1).close);
    saveSignal(signal, price);
  } else {
    console.log('⏭ No PSAR signal at this time.');
  }
}

console.log('🟢 Binary Options PSAR Bot Started...\n');
runLoop();
setInterval(runLoop, 60 * 1000);