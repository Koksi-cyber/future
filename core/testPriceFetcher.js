// resetToPendingSignals_v3.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../logs/signals_v3.json');

if (!fs.existsSync(filePath)) {
  console.error('❌ signals_v3.json not found.');
  process.exit(1);
}

let raw = fs.readFileSync(filePath, 'utf8');
let signals = JSON.parse(raw);

signals = signals.map(signal => ({
  timestamp: signal.timestamp,
  signal: signal.signal,
  symbol: signal.symbol,
  confidence: signal.confidence,
  reason: signal.reason,
  entryPrice: signal.priceAtSignal, // rename field
  result: 'PENDING',
  checkAt: signal.timestamp + 5 * 60 * 1000 // 5 minutes later
}));

fs.writeFileSync(filePath, JSON.stringify(signals, null, 2));
console.log('✅ signals_v3.json reset for PENDING flow.');
