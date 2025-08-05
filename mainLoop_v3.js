require('dotenv').config();
const fs = require('fs');
const path = require('path');
const getGptSignal = require('./core/gptSignalChecker_v3');
const getCandles = require('./core/priceFetcher'); // ✅ uses tvDatafeed + enriched output

// ✅ Pull config from .env
const SYMBOL = process.env.TV_SYMBOL || process.env.SYMBOL || 'BTCUSDT';
const EXCHANGE = process.env.TV_EXCHANGE || 'BINANCE';

const LOG_FILE_V3 = path.resolve('logs', 'signals_v3.json'); // 5-min expiry
const LOG_FILE_V4 = path.resolve('logs', 'signals_v4.json'); // 1-min expiry

async function fetchCandles() {
  try {
    const candles = await getCandles(SYMBOL, EXCHANGE);
    if (!candles || candles.length === 0) throw new Error('Empty array');

    // tvDatafeed doesn't return timestamps; add current timestamp
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

  const baseEntry = {
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
  };

  const entryV3 = { ...baseEntry, checkAt: now + 5 * 60 * 1000 };
  const entryV4 = { ...baseEntry, checkAt: now + 1 * 60 * 1000 };

  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');

    const logsV3 = fs.existsSync(LOG_FILE_V3)
      ? JSON.parse(fs.readFileSync(LOG_FILE_V3, 'utf8'))
      : [];
    logsV3.push(entryV3);
    fs.writeFileSync(LOG_FILE_V3, JSON.stringify(logsV3, null, 2));

    const logsV4 = fs.existsSync(LOG_FILE_V4)
      ? JSON.parse(fs.readFileSync(LOG_FILE_V4, 'utf8'))
      : [];
    logsV4.push(entryV4);
    fs.writeFileSync(LOG_FILE_V4, JSON.stringify(logsV4, null, 2));

    console.log(`📝 Logged Signal: ${signal.signal} | ${signal.confidence}% @ ${price}`);
  } catch (err) {
    console.error('❌ Failed to write to signal logs:', err.message);
  }
}

async function runLoop() {
  console.log(`[v3 Loop] Fetching ${SYMBOL} candles from ${EXCHANGE}...`);
  const candles = await fetchCandles();

  if (candles.length < 30) {
    console.warn(`⚠️ Not enough candles fetched (${candles.length})`);
    return;
  }

  console.log(`📊 Analyzing ${candles.length} candles...`);
  const signal = await getGptSignal(candles, SYMBOL);

  if (!signal.skipped && ['UP', 'DOWN'].includes(signal.signal) && signal.confidence >= 75) {
    const price = parseFloat(candles.at(-1).close);
    saveSignal(signal, price);
  } else {
    console.log('⏭ No strong signal at this time.');
  }
}

console.log('🟢 Binary Options v3 Bot (TradingView + Fast EMA Mode) Started...\n');
runLoop();
setInterval(runLoop, 60 * 1000);
