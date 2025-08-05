// /core/priceFetcher.js
const fetchCandlesFromTV = require('./tvPriceFetcher');
require('dotenv').config();

/**
 * Fetches 1-minute candles using TradingView (tvDatafeed).
 * @param {string} symbol - e.g., "BTCUSDT"
 * @param {string} exchange - e.g., "BINANCE"
 * @returns {Promise<Array>} - Array of candles with OHLCV
 */
module.exports = async function getCandles(
  symbol = process.env.TV_SYMBOL,
  exchange = process.env.TV_EXCHANGE
) {
  try {
    const raw = await fetchCandlesFromTV(symbol, exchange);

    const formatted = raw.map(c => ({
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume)
    }));

    console.log(`📈 Fetched ${formatted.length} candles from TV for ${symbol} @ ${exchange}`);
    return formatted;
  } catch (err) {
    console.error('❌ TV Price Fetcher Error:', err);
    return [];
  }
};
