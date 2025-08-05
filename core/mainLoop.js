// /core/mainLoop.js

const { fetchCandles } = require('./priceFetcher');
const { calculateIndicators } = require('./indicatorCalculator');
const { getGptSignal } = require('./gptSignalChecker');
const { logSignal, checkPendingSignals } = require('./signalTracker');
const log = require('console-log-level')({ level: 'info' });

const SYMBOL = 'BTCUSDT';
const INTERVAL_MS = 60 * 1000; // 60 seconds

async function runLoop() {
  log.info(`🟢 Binary Options GPT Signal Bot started for ${SYMBOL}`);

  while (true) {
    try {
      // Step 1: Fetch 50 candles
      const rawCandles = await fetchCandles(SYMBOL, 50);

      // Step 2: Calculate indicators
      const enrichedCandles = calculateIndicators(rawCandles);

      // Step 3: Get GPT signal
      const signal = await getGptSignal(enrichedCandles, SYMBOL);

      // Step 4: Display or act on signal
      if (signal.signal !== 'NONE') {
        const currentPrice = enrichedCandles[enrichedCandles.length - 1].close;
        log.info(`🚀 TRADE SIGNAL: ${signal.signal} (${signal.confidence}%) → ${signal.reason}`);
        logSignal(SYMBOL, signal.signal, currentPrice); // log signal for future check
      } else {
        log.info(`⚪ No high-confidence signal at this time.`);
      }

      // Step 5: Check for any signals ready to verify
      await checkPendingSignals();

    } catch (err) {
      log.error(`Loop error: ${err.message}`);
    }

    // Step 6: Wait
    log.info(`⏳ Waiting ${INTERVAL_MS / 1000}s until next check...\n`);
    await new Promise(res => setTimeout(res, INTERVAL_MS));
  }
}

runLoop();
