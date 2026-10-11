import unittest
import capital_flow_mexc as cf


class FlowObservationsTest(unittest.TestCase):
    def test_spot_quote_turnover_and_mismatch(self):
        row=cf.parse_spot({"symbol":"BTCUSDT","quoteVolume":"1234500.50"},"BTCUSDT")
        self.assertEqual(row["status"],"READY")
        self.assertEqual(row["quote_turnover_24h_usdt"],1234500.50)
        self.assertEqual(cf.parse_spot({"symbol":"ETHUSDT","quoteVolume":"100"},"BTCUSDT")["status"],"NO_DATA")
        self.assertEqual(cf.parse_spot({"symbol":"BTCUSDT","quoteVolume":None},"BTCUSDT")["status"],"NO_DATA")

    def test_deals_signed_and_strict_time(self):
        now=1760000500000
        rows=[{"p":101,"v":20,"T":1,"t":now-2000},
              {"p":100,"v":12,"T":2,"t":now-1000},
              {"p":100,"v":12,"T":2,"t":now-1000},
              {"p":100,"v":9000,"T":1,"t":now-400000},
              {"p":101,"v":30,"T":3,"t":now-300},
              {"p":101,"v":7,"T":1,"t":now+70000}]
        result=cf.parse_deals({"success":True,"data":rows},now)
        self.assertEqual(result["status"],"READY")
        self.assertEqual(result["trade_count"],2)
        self.assertEqual(result["buy_contracts"],20)
        self.assertEqual(result["sell_contracts"],12)
        self.assertEqual(result["sample_delta_contracts"],8)
        self.assertEqual(result["cvd_status"],"NOT_CONNECTED")
        self.assertEqual(result["sample_window_sec"],1)

    def test_no_fake_flow_or_liquidations(self):
        now=1760000500000
        self.assertEqual(cf.parse_deals({"success":True,"data":[]},now)["status"],"NO_DATA")
        self.assertEqual(cf.parse_deals({"success":False,"data":[{"p":1,"v":1,"T":1,"t":now}]},now)["status"],"NO_DATA")

    def test_futures_contracts_not_usdt(self):
        row=cf.parse_futures_ticker({"amount_24h":1200000,"open_interest":54000,"funding_rate":0})
        self.assertEqual(row["status"],"READY")
        self.assertEqual(row["turnover_24h_usdt"],1200000)
        self.assertEqual(row["open_interest_contracts"],54000)
        self.assertEqual(row["oi_unit"],"contracts")
        self.assertEqual(row["funding_pct"],0)
        self.assertEqual(cf.parse_futures_ticker({})["status"],"NO_DATA")
        self.assertEqual(cf.parse_futures_ticker({"open_interest":0})["open_interest_contracts"],0)


if __name__=="__main__":
    unittest.main()
