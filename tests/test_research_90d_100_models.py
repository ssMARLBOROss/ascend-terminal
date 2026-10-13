"""Audit the published 100 MODEL_ONLY trade records; no exchange orders."""
import json
import unittest
from pathlib import Path
from research_trade_ledger_v1 import validate, summarize

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/"research/90d_20261013_ALL_100_MODEL_TRADES.json"

class JournalAudit(unittest.TestCase):
 def test_models_are_unique_closed_and_recomputable(self):
  result=json.loads(FILE.read_text())
  entries=result["records"]
  self.assertEqual(len(entries),100)
  self.assertEqual(len({(x["experiment_id"],x["trade_id"]) for x in entries}),100)
  self.assertEqual(result["metadata"]["barCount"],77760)
  self.assertTrue(result["metadata"]["zeroGaps"])
  self.assertEqual(result["metadata"]["tradeType"],"MODEL_ONLY_NOT_EXCHANGE_FILL")
  for t in entries:
   with self.subTest(trade=t["trade_id"]):
    clean=validate(t)
    self.assertAlmostEqual(clean["net_r"],t["net_r"],places=6)
    self.assertFalse(clean["verified_exchange_fill"])
    self.assertGreaterEqual(t["entry_ts"],t["bos_ts"])
    self.assertGreater(t["exit_ts"],t["entry_ts"])
    self.assertEqual(t["look_ahead_check"],"CLOSED_BOS_NEXT_OPEN")
    self.assertEqual(t["source"],"MODEL_REPLAY")
 def test_summary_independently_matches(self):
  result=json.loads(FILE.read_text())
  entries=result["records"]
  out=summarize(entries)
  self.assertEqual(out["model"]["closed"],100)
  self.assertEqual(out["status"],"SAMPLE_TARGET_MET")
  self.assertEqual(out["broker_verified_fills"],None)
  self.assertEqual(round(out["model"]["sum_r"],4),
                   round(result["summary"]["overall"]["sumR"],4))
  self.assertEqual(out["model"]["positive"],
                   result["summary"]["overall"]["positive"])
  self.assertLess(out["model"]["sum_r"],0)
  by_tags=lambda tag:[t for t in entries if tag in t["fvg_tags"]]
  for tag,name in (("SMALL_FVG","smallFvg"),("LARGE_FVG","largeFvg")):
   self.assertEqual(len(by_tags(tag)),result["summary"][name]["trades"])
   self.assertAlmostEqual(summarize(by_tags(tag))["model"]["sum_r"],
                          result["summary"][name]["sumR"],places=4)
if __name__=="__main__":unittest.main()
