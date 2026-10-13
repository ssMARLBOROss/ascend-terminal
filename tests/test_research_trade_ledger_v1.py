"""Offline validation of immutable ledger and reproducible 5m study."""
import copy
import time
import unittest

import research_trade_ledger_v1 as L
import research_replay_v1 as R

BASE={
 "experiment_id":"ASCEND_REPLAY_5M_V1","trade_id":"btc_001",
 "symbol":"BTC_USDT","side":"LONG","source":"MODEL_REPLAY",
 "outcome":"TP","entry_ts":1788854400,"exit_ts":1788858000,
 "entry":100.0,"stop":99.0,"target":102.0,"exit_price":102.0,
 "fee_pct":0.0008,"slippage_pct":0.0004,
 "model_version":"ASCEND_PROXY_V1","data_ref":"BINANCE_USDM_5M:BTC_USDT:1788854400",
 "look_ahead_check":"CLOSED_BOS_NEXT_OPEN",
}
class LedgerTests(unittest.TestCase):
 def test_valid_closed_trade_and_exact_cost_r(self):
  t=L.validate(BASE)
  self.assertAlmostEqual(t["net_r"],1.88)
  self.assertFalse(t["verified_exchange_fill"])
  report=L.summarize([t])
  self.assertEqual(report["model"]["closed"],1)
  self.assertIsNone(report["broker_verified_fills"])
  self.assertEqual(report["status"],"INSUFFICIENT_MODEL_SAMPLE")

 def test_not_allow_real_or_impossible_prices(self):
  for change in ({"source":"REAL_FILL"},{"exit_ts":1788854400},
                 {"side":"SHORT"},{"stop":101},{"target":98},
                 {"data_ref":""},{"entry":float("inf")},
                 {"fee_pct":-0.001}):
   with self.subTest(change=change):
    with self.assertRaises(ValueError):
     L.validate({**BASE,**change})

 def test_100_trade_goal_counts_model_only(self):
  models=[]
  for k in range(100):
   x=L.validate({**BASE,"trade_id":f"btc_{k}","entry_ts":1788854400+k*7200,
     "exit_ts":1788858000+k*7200})
   models.append(x)
  s=L.summarize(models)
  self.assertEqual(s["model"]["closed"],100)
  self.assertEqual(s["status"],"SAMPLE_TARGET_MET")
  self.assertIsNone(s["broker_verified_fills"])

class ReplayTests(unittest.TestCase):
 def bars(self):
  d0=1788739200  # UTC day boundary expected by calculation
  d0=(d0//86400)*86400
  a=[{"time":d0+i*300,"open":100,"high":100.2,
      "low":99.8,"close":100} for i in range(864)]
  for i in (96,):
   a[i].update({"open":100,"high":100.3,"low":99.4,"close":100})
  a[97].update({"open":100,"high":101.2,"low":99.9,"close":100.6})
  a[98].update({"open":100.6,"high":100.8,"low":100.5,"close":100.7})
  a[99].update({"open":100.7,"high":104.0,"low":100.5,"close":103.2})
  return a
 def test_trade_recorded_from_closed_sweep_and_bos(self):
  records=R.replay("BTC_USDT",self.bars(),source="BINANCE_USDM_5M")
  self.assertGreaterEqual(len(records),1)
  x=records[0]
  self.assertEqual(x["source"],"MODEL_REPLAY")
  self.assertEqual(x["model_version"],R.MODEL)
  self.assertGreaterEqual(x["entry_ts"],x["bos_ts"])
  self.assertIn(x["outcome"],("TP","SL","TIME"))
  self.assertFalse(x["verified_exchange_fill"])
  self.assertEqual(x["look_ahead_check"],"CLOSED_BOS_NEXT_OPEN")
  self.assertEqual(R.analyze(records)["goal_100_met"],False)
 def test_missing_candle_disqualifies_day(self):
  b=[v for j,v in enumerate(self.bars()) if j!=50]
  results=R.replay("BTC_USDT",b,source="BINANCE_USDM_5M")
  self.assertFalse(any(x["sweep_ts"]==self.bars()[96]["time"] for x in results))
 def test_candle_mutation_after_trade_does_not_change_past(self):
  before=R.replay("BTC_USDT",self.bars(),source="BINANCE_USDM_5M")
  future=self.bars()
  for i in range(300,864):
   future[i]["high"]=110
   future[i]["close"]=109
   future[i]["low"]=99
  after=R.replay("BTC_USDT",future,source="BINANCE_USDM_5M")
  a=next(x for x in before if x["sweep_ts"]==self.bars()[96]["time"])
  b=next(x for x in after if x["sweep_ts"]==self.bars()[96]["time"])
  self.assertEqual((a["entry_ts"],a["exit_ts"],a["net_r"]),
                   (b["entry_ts"],b["exit_ts"],b["net_r"]))

if __name__=="__main__":
 unittest.main()
