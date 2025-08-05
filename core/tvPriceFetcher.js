// /core/tvPriceFetcher.js
const { exec } = require('child_process');
require('dotenv').config();

function fetchCandlesFromTV(symbol = process.env.TV_SYMBOL, exchange = process.env.TV_EXCHANGE) {
  return new Promise((resolve, reject) => {
    const cmd = `python ./core/tvFetcher.py ${symbol} ${exchange}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) return reject(`Error: ${stderr || error.message}`);
      try {
        const result = JSON.parse(stdout);
        if (result.error) return reject(result.error);
        resolve(result);
      } catch (err) {
        reject(`Invalid JSON from tvFetcher.py: ${err.message}`);
      }
    });
  });
}

module.exports = fetchCandlesFromTV;
