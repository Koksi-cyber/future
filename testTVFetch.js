// testTVFetch.js
const fetchCandlesFromTV = require('./core/tvPriceFetcher');

fetchCandlesFromTV()
  .then(data => {
    console.log('✅ Fetched candles:', data.length);
    console.log(data.slice(-3)); // Show last 3 candles
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
