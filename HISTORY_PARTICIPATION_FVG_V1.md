# ASCEND History & Market Participation V1 — deployment and fidelity

Research-only extension. **No changes to ENTRY READY criteria, Structure Engine, real orders or Telegram signal routing.** All new data are observational.

## Existing infrastructure verified

Railway `ascend-terminal-api` has healthy API, PostgreSQL, history collector and an existing archive bucket. Candle backfill runs via `history_store.py`; do not deploy a duplicate candle collector or duplicate Postgres. The new market recorder attaches to the **existing** `bybit-history-collector` service when `MARKET_PARTICIPATION_ENABLED=1`.

## Source isolation

| Sensor | Venue | Output | Status rules |
| --- | --- | --- | --- |
| `push.deal` | MEXC Futures | minute-aggregated BUY/SELL in contracts (batch written after 1m close) | PARTIAL: no before-start reconstruction and no complete tick continuity guarantee |
| `push.ticker`/`holdVol` | MEXC Futures | OI (contracts) at ~30s intervals | ΔOI only once 15m prior sample exists |
| `orderbook.50` | Bybit linear | local in-memory BID/ASK 50 depth (10s observation) | snapshot required; resets on reconnect; `NO DATA` until complete |
| `REST depth` + uncompressed `push.depth` | MEXC Futures | 50-level BID/ASK from REST snapshot plus strict version+1 WS deltas | on gap/reset fetch a new REST snapshot, discard stale delta; `NO DATA` without verified snapshot |
| `allLiquidation` | Bybit linear | exact liquidation position side and bankruptcy price, timestamp and native qty | PARTIAL until observation history exists; not MEXC liquidation data |
| FVG closed 3m | MEXC candles displayed in Terminal | OPEN/PARTIAL/FILLED, size divided by ATR14, formedAt/firstTouchAt | no candle before close / no look-ahead |
| SETUP event table | trustworthy server event producer | reserved schema; **no producer connected yet** | `NO DATA` until verified server-side signal source is installed |

MEXC native depth WS delta is interpreted only after a REST snapshot with a verified contiguous version chain. The panel prefers fresh `MEXC` book; when absent it displays independent `BYBIT` with the source label. It never infers execution solely from the removal of visible orders.

Bybit liquidation `S=Buy` means liquidated **LONG** position; `S=Sell` liquidated **SHORT** position. Bybit supplies the bankruptcy price, not guaranteed execution fill.

The ingestion service stores immutable venue-separated source observations into PostgreSQL. Trade summaries carry `source: WS_1M_AGG`. Raw per-print historical trades are **not** archived and must not be claimed as full reconstructible CVD. Tables are `ascend_market_events_v1` and `ascend_setup_events_v1`. A disconnected/reconnected websocket adds `STREAM_STATE` and prevents claims of 100% coverage. Actual end-to-end coverage depends on the live connection.

## Five starting bases

BTC, ETH, SOL, XRP, DOGE on MEXC and independent Bybit. Set on existing Railway service:

```dotenv
MARKET_PARTICIPATION_ENABLED=1
MARKET_PARTICIPATION_SYMBOLS=BTC,ETH,SOL,XRP,DOGE
```

Default is `0`, so deploying the code does not automatically start potentially costly streams. It uses the existing `DATABASE_URL`. Do not add API keys: only public market streams are used.

## Read-only API

`GET /api/v2/research/market-participation?symbol=BTC_USDT`

`GET /api/v2/research/history-lab?symbol=BTC_USDT`

Missing feed/database/server-producer reports `NO DATA`; never constructs zeros for missing trades. `History Lab` UI separates **local paper trades** from audited server events; it does not call paper trades actual exchange fills.

## Reproducible checks

```bash
node tests/cloudflare-fvg-research-v1.test.mjs
PYTHONPATH=. python tests/test_market_participation_v1.py
python -m py_compile market_participation_v1.py market_participation_collector_v1.py bybit_collector.py terminal_api_v2.py
node tests/cloudflare-confirmation-v2.test.mjs
node tests/cloudflare-v2-unified-setup.test.mjs
```

GitHub workflow: `ASCEND History Participation FVG V1`; all previous V2 core logic is unchanged.

## Next fidelity milestones

1. Verify Railway websocket connection plus streaming records, age/status, reconnect tests, DB counts. Until checked, do not claim production LIVE.
2. Authoritative server-side V2 SETUP producer with confirmed closed-candle timestamps and `setup_id`; avoid accepting unauthenticated, client-computed `ENTRY READY` submissions.
3. Independent paper execution ledger: immutable entry/SL/TP and fee snapshot; MFE/MAE, stop-first OHLC policy, slippage, funding.
4. Verify MEXC REST depth + WS chain in production and event continuity. Long-term raw stream archive in object storage if volume budgets allow.
5. 30/90-day calendar research IS/OOS, fee sensitivity and sample-size validity. The pilot Binance BTC/ETH/SOL research in `research/comparative-v2-20261012` is separate and produced **zero valid completed V2 setups**, so WR is undefined.
