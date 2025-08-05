require('dotenv').config();
const fs = require('fs');
const path = require('path');
const psarAdxSignal = require('./core/psarAdxStrategy');
const getCandles = require('./core/priceFetcher');

// Pull symbol/exchange from .env (fall back to defaults)
const SYMBOL = process.env.TV_SYMBOL || process.env.SYMBOL || 'BTCUSDT';
const EXCHANGE = process.env.TV_EXCHANGE || 'BINANCE';

// Load PSAR/ADX config from environment variables (optional)
const PSAR_STEP = parseFloat(process.env.PSAR_STEP) || 0.02;
const PSAR_MAX  = parseFloat(process.env.PSAR_MAX)  || 0.2;
const ADX_THRESHOLD = parseFloat(process.env.ADX_THRESHOLD) || 25;
const MIN_FLIPS = parseInt(process.env.PSAR_MIN_FLIPS || '2', 10);
const RANGE_MULT = parseFloat(process.env.PSAR_RANGE_MULT || '0');

// Log file for PSAR+ADX signals
const LOG_FILE = path.resolve('logs', 'signals_psar_adx.json');

async function fetchCandles() {
  try {
    const candles = await getCandles(SYMBOL, EXCHANGE);
    if (!candles || candles.length === 0) throw new Error('Empty array');
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
    // Use 1‑minute expiry for now; adjust if you change expiry
    checkAt: now + 1 * 60 * 1000
  };
  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    const logs = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) : [];
    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    console.log(`📝 Logged PSAR+ADX Signal: ${signal.signal} | ${signal.confidence}% @ ${price}`);
  } catch (err) {
    console.error('❌ Failed to write PSAR+ADX signal logs:', err.message);
  }
}

async function runLoop() {
  console.log(`[PSAR+ADX Loop] Fetching ${SYMBOL} candles from ${EXCHANGE}...`);
  const candles = await fetchCandles();
  if (candles.length < 210) {
    console.warn(`⚠️ Not enough candles fetched (${candles.length})`);
    return;
  }
  console.log(`📊 PSAR+ADX analysis on ${candles.length} candles...`);
  const config = {
    psarStep: PSAR_STEP,
    psarMax: PSAR_MAX,
    adxThreshold: ADX_THRESHOLD,
    minFlips: MIN_FLIPS,
    rangeMultiplier: RANGE_MULT
  };
  const signal = psarAdxSignal(candles, config);
  if (!signal.skipped && ['UP', 'DOWN'].includes(signal.signal)) {
    const price = parseFloat(candles.at(-1).close);
    saveSignal(signal, price);
  } else {
    console.log('⏭ No PSAR+ADX signal at this time.');
  }
}

console.log('🟢 Binary Options PSAR+ADX Bot Started...');
runLoop();
setInterval(runLoop, 60 * 1000);