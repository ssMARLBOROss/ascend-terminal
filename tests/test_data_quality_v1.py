"""No network or real trade execution. Run: PYTHONPATH=. python tests/test_data_quality_v1.py"""
import unittest
from unittest.mock import AsyncMock, patch
import data_quality_v1 as Q

def bar(t):
    return {"ts":t,"open":100,"high":101,"low":99,"close":100.5}

class DataQualityV1(unittest.TestCase):
    def test_60_closed_minutes(self):
        now=1_799_000_030
        right=(now//60)*60-60
        rows=[bar(right-60*i) for i in range(60)]
        r=Q.assess_minutes(rows,now)
        self.assertEqual((r["status"],r["observed"],r["missing"]),("LIVE",60,0))
        self.assertEqual(r["coverage_pct"],100.0)
        self.assertFalse(r["gap_fill_applied"])

    def test_gap_is_explicit(self):
        now=1_799_000_030
        right=(now//60)*60-60
        rows=[bar(right-60*i) for i in range(60) if i!=12]
        r=Q.assess_minutes(rows,now)
        self.assertEqual(r["status"],"PARTIAL")
        self.assertEqual(r["missing"],1)
        self.assertIn(right-12*60,r["missing_first"])

    def test_stale(self):
        now=1_799_000_030
        right=(now//60)*60-60
        rows=[bar(right-i*60) for i in range(8,30)]
        r=Q.assess_minutes(rows,now)
        self.assertEqual(r["status"],"STALE")
        self.assertGreater(r["age_after_close_sec"],180)

    def test_no_data(self):
        self.assertEqual(Q.assess_minutes([],1_799_000_030)["status"],"NO DATA")

    def test_duplicate_and_invalid(self):
        now=1_799_000_030
        right=(now//60)*60-60
        rows=[bar(right-60*i) for i in range(60)]
        rows.append(bar(right))
        rows.append({"ts":right-3*60,"open":100,"high":1,"low":99,"close":100})
        r=Q.assess_minutes(rows,now)
        self.assertEqual(r["status"],"PARTIAL")
        self.assertEqual(r["duplicates"],1)
        self.assertEqual(r["malformed"],1)

    def test_participation_cannot_become_full_cvd(self):
        d={"cvd":{"status":"PARTIAL","cumulative_cvd":None},
           "delta_oi":{"status":"PARTIAL","source":"MEXC"},
           "order_book":{"status":"LIVE","source":"MEXC","snapshot_verified":False},
           "liquidations":{"status":"PARTIAL","source":"BYBIT"}}
        r=Q.stream_health(d)
        self.assertEqual(r["cvd"]["cumulative_cvd_available"],False)
        self.assertEqual(r["book"]["status"],"PARTIAL")
        self.assertEqual(r["liquidations"]["source"],"BYBIT")

if __name__=="__main__":
    unittest.main()
