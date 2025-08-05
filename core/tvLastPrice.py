# /core/tvLastPrice.py
import os
import json
from dotenv import load_dotenv
from tvDatafeed import TvDatafeed, Interval

load_dotenv()

symbol = os.getenv("TV_SYMBOL")
exchange = os.getenv("TV_EXCHANGE")

try:
    tv = TvDatafeed()
except:
    username = os.getenv("TV_USERNAME")
    password = os.getenv("TV_PASSWORD")
    tv = TvDatafeed(username=username, password=password)

try:
    df = tv.get_hist(
        symbol=symbol,
        exchange=exchange,
        interval=Interval.in_1_minute,
        n_bars=1
    )
    if df is None or df.empty:
        raise Exception("No data returned")

    last_price = df.iloc[-1]["close"]
    print(json.dumps({ "price": last_price }))
except Exception as e:
    print(json.dumps({ "error": str(e) }))
