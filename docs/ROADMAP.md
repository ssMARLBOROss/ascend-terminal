# ASCEND rebuild roadmap

## Done

- [x] clean monorepo workspace
- [x] React + TypeScript terminal shell
- [x] NestJS/Fastify API skeleton
- [x] worker skeleton
- [x] shared contracts
- [x] ChartAdapter boundary
- [x] compact / comfortable UI
- [x] radar + session flow + walls + balance + lifecycle + decision center
- [x] mock scenario replay
- [x] Railway preview container
- [x] CI build
- [x] remove legacy root monolith from rebuild branch
- [x] canonical Core / Market / Architecture docs

## Next — Phase 1: real market data

- [ ] exchange adapter for MEXC futures universe
- [ ] optional Bybit adapter for comparison/fallback
- [ ] normalized candle contract for all required timeframes
- [ ] live ticker + breadth + BTC/ETH/SOL global context
- [ ] session clock and frozen session levels
- [ ] PostgreSQL candle/event storage
- [ ] Redis hot state

## Phase 2: core event engine

- [ ] time-safe YH/YL, ONH/ONL, RTH H/L, IBH/IBL
- [ ] Balance / market-wall builder
- [ ] Probe / Sweep detector
- [ ] Reclaim / Acceptance detector
- [ ] 30m → 15m → 10m → 5m → 3m → 1m structure chain
- [ ] WATCH → SHIFTING → CONFIRMED state machine
- [ ] structural SL + next-liquidity TP
- [ ] used/lost/remaining/potential move gate
- [ ] deterministic event replay tests

## Phase 3: operator workflow

- [ ] real chart adapter with candles and overlays
- [ ] live Smart Radar
- [ ] paper execution
- [ ] journal
- [ ] analytics
- [ ] terminal auth/users
- [ ] Telegram signal delivery
- [ ] Mini App handoff

## Phase 4: research

- [ ] reproducible 43-signal harness
- [ ] 30 in-sample / 13 pilot OOS split
- [ ] BASELINE vs ASCEND CORE
- [ ] GG-PROXY STRICT / SOFT
- [ ] ASCEND + GG-PROXY variants
- [ ] no-look-ahead verification
- [ ] fees/slippage parity

Research does not modify production core without a separate validation decision.
