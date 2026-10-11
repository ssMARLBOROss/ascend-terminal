import unittest
from market_participation_v1 import (
    BybitBook, MexcBook, event, norm_symbol, parse_mexc, parse_bybit, number, snapshot
)

NOW=1791766800000

class MarketTests(unittest.TestCase):
    def test_symbol_allowlist(self):
        self.assertEqual(norm_symbol("BTC_USDT"),"BTCUSDT")
        self.assertEqual(norm_symbol("SOLUSDT"),"SOLUSDT")
        self.assertFalse(norm_symbol("BTCUSD"))
        self.assertFalse(norm_symbol("FRAUDUSDT"))

    def test_trade_direction_dedup_and_no_liquidation_imputation(self):
        x={"channel":"push.deal","symbol":"BTC_USDT","data":{
            "T":1,"t":NOW-1000,"p":"80000","v":"2.5"}}
        result=parse_mexc(x,NOW)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["payload"]["side"],"BUY")
        self.assertEqual(result[0]["payload"]["unit"],"CONTRACTS")
        self.assertEqual(result[0]["event_id"],parse_mexc(x,NOW)[0]["event_id"])
        self.assertEqual(parse_mexc({**x,"data":{**x["data"],"T":99}},NOW),[])
        self.assertEqual(parse_mexc({**x,"channel":"push.depth"},NOW),[])

    def test_oi_source(self):
        data={"channel":"push.ticker","symbol":"ETH_USDT",
              "data":{"holdVol":"12345.5","timestamp":NOW-300}}
        oi=parse_mexc(data,NOW)
        self.assertEqual(oi[0]["kind"],"OPEN_INTEREST")
        self.assertEqual(oi[0]["payload"]["unit"],"CONTRACTS")

    def test_bybit_liquidations_position_side_is_not_order_side(self):
        x={"topic":"allLiquidation.BTCUSDT","data":[
          {"T":NOW-100,"s":"BTCUSDT","S":"Buy","v":"3","p":"100"},
          {"T":NOW-100,"s":"BTCUSDT","S":"Sell","v":"4","p":"101"}]}
        result=parse_bybit(x,NOW)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0]["payload"]["liquidated_position"],"LONG")
        self.assertEqual(result[1]["payload"]["liquidated_position"],"SHORT")
        self.assertEqual(result[0]["payload"]["price_type"],"BANKRUPTCY_PRICE")
        self.assertEqual(parse_bybit({"topic":"liquidation.BTCUSDT","data":[]},NOW),[])

    def test_order_book_requires_snapshot_then_deltas(self):
        b=BybitBook("BTCUSDT")
        delta={"topic":"orderbook.50.BTCUSDT","type":"delta","ts":NOW-10,
               "data":{"u":2,"seq":101,"b":[["99","2"]],"a":[["100","3"]]}}
        self.assertIsNone(b.apply(delta,NOW))
        snapshot={**delta,"type":"snapshot","data":{**delta["data"],"u":1,"seq":100}}
        book=b.apply(snapshot,NOW)
        self.assertIsNotNone(book)
        self.assertEqual(book["payload"]["best_bid"],99)
        self.assertEqual(book["payload"]["best_ask"],100)
        book=b.apply(delta,NOW)
        self.assertIsNotNone(book)
        self.assertIsNone(b.apply({**delta,"data":{**delta["data"],"seq":100}},NOW))
        self.assertFalse(b.valid)

    def test_mexc_snapshot_delta_and_version_gap(self):
        book=MexcBook("BTC_USDT")
        snap={"success":True,"data":{
            "version":100,"timestamp":NOW-10,
            "bids":[[99,10,1],[98,20,1]],
            "asks":[[101,10,1],[102,15,1]]}}
        self.assertTrue(book.seed(snap))
        event={"channel":"push.depth","symbol":"BTC_USDT","ts":NOW-10,
               "data":{"version":101,"bids":[[99,12,1]],"asks":[[101,0,1]]}}
        result=book.apply(event,NOW)
        self.assertIsNotNone(result)
        self.assertEqual(result["payload"]["best_bid"],99)
        self.assertEqual(result["payload"]["best_ask"],102)
        self.assertEqual(result["payload"]["unit"],"CONTRACTS")
        self.assertIsNone(book.apply({**event,"data":{**event["data"],"version":101}},NOW),
                          "older duplicate ignored")
        self.assertEqual(book.version,101)
        self.assertIsNone(book.apply({**event,"data":{**event["data"],"version":103}},NOW),
                          "version gap resets the book")
        self.assertIsNone(book.version)
        self.assertIsNone(book.apply({**event,"data":{**event["data"],"version":104}},NOW))
        self.assertTrue(book.seed(snap))
        self.assertIsNotNone(book.apply(event,NOW))
        self.assertFalse(book.seed({"data":{"version":110,"bids":[[110,1]],"asks":[[100,1]]}}))

    def test_bad_prices_and_late_events_rejected(self):
        self.assertIsNone(number(float("nan")))
        self.assertIsNone(event("MEXC","BTC_USDT","TRADE",NOW-90_000_000,
           {"price":100},received_ms=NOW))
        self.assertIsNone(event("BYBIT","BTC_USDT","FAKE",NOW,{},received_ms=NOW))

    def test_empty_database_fails_closed(self):
        import asyncio
        p=asyncio.run(snapshot(None,"BTC_USDT"))
        self.assertEqual(p["status"],"NO DATA")
        self.assertIsNone(p["cvd"])
        self.assertIsNone(p["liquidations"])

if __name__=="__main__":
    unittest.main()
