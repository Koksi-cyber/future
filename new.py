from tvDatafeed import TvDatafeed, Interval

tv = TvDatafeed()

df = tv.get_hist(
    symbol="BTCUSDT",
    exchange="BINANCE",
    interval=Interval.in_1_minute,
    n_bars=60
)
print(df.tail(200))
print(type(df))

df.to_json(orient="records")
