// testPriceFetcher.js
const getCandles = require('./core/priceFetcher');

getCandles().then(data => {
  console.log('✅ Candle count:', data.length);
  console.log(data.slice(-3));
});
