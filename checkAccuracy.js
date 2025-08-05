const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'signals_v4.json');

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function parseTimeArg(arg) {
  const match = arg.match(/^--last\s+(\d+)(min|h)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'min') return Date.now() - value * 60 * 1000;
  if (unit === 'h') return Date.now() - value * 60 * 60 * 1000;
  return null;
}

function checkAccuracy() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('❌ signals.json not found.');
    return;
  }

  const content = fs.readFileSync(LOG_FILE, 'utf8').trim();
  let data;

  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error('❌ Failed to parse signals.json. Make sure it is valid JSON.');
    return;
  }

  if (!Array.isArray(data)) {
    console.error('❌ signals.json should contain an array of objects.');
    return;
  }

  // ⏳ Filter by --last time range (optional)
  const timeArgIndex = process.argv.findIndex(arg => arg === '--last');
  let timeLimit = null;
  if (timeArgIndex !== -1 && process.argv[timeArgIndex + 1]) {
    const raw = `--last ${process.argv[timeArgIndex + 1]}`;
    timeLimit = parseTimeArg(raw);
  }

  let total = 0, correct = 0, wrong = 0;

  const results = data
    .filter(entry =>
      entry.result !== 'PENDING' &&
      (!timeLimit || entry.timestamp >= timeLimit)
    )
    .map(entry => {
      const isCorrect = entry.result === 'CORRECT';
      total++;
      if (isCorrect) correct++;
      else wrong++;

      return {
        symbol: entry.symbol,
        signal: entry.signal,
        result: entry.result,
        timeAgo: getTimeAgo(entry.timestamp),
        status: isCorrect ? '✅ Correct' : '❌ Wrong'
      };
    });

  console.log(`\nTotal Signals Checked: ${total}`);
  console.log(`✅ Correct: ${correct}`);
  console.log(`❌ Wrong: ${wrong}`);
  console.log(`📊 Accuracy: ${total > 0 ? ((correct / total) * 100).toFixed(2) : 0}%\n`);

  results.forEach(r => {
    console.log(`[${r.timeAgo}] ${r.symbol} - Signal: ${r.signal}, Result: ${r.result} => ${r.status}`);
  });
}

// Run directly
if (require.main === module) {
  checkAccuracy();
}
