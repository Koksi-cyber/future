# /core/tvFetcher.py
import sys
import os
import json
from dotenv import load_dotenv
from tvDatafeed import TvDatafeed, Interval

load_dotenv()

symbol = os.getenv("TV_SYMBOL") or sys.argv[1]
exchange = os.getenv("TV_EXCHANGE") or sys.argv[2]
n_bars = int(os.getenv("TV_BARS", "220"))  # ⬅️ Default now 220 to satisfy preFilter

# ✅ Use saved session if available (prevents login on every run)
try:
    tv = TvDatafeed()  # Uses cached session if available
except:
    # Fallback to first-time login (saves session for future use)
    username = os.getenv("TV_USERNAME")
    password = os.getenv("TV_PASSWORD")
    tv = TvDatafeed(username=username, password=password)

try:
    df = tv.get_hist(
        symbol=symbol,
        exchange=exchange,
        interval=Interval.in_1_minute,
        n_bars=n_bars
    )
    if df is None or df.empty:
        raise Exception(f"No data returned for {symbol} on {exchange}")

    print(df.to_json(orient="records"))
except Exception as e:
    print(json.dumps({"error": str(e)}))
