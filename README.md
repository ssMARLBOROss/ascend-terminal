# ASCEND Terminal

ASCEND is being rebuilt as one clean repository with three runtime areas:

- `apps/terminal` — the working trading terminal.
- `apps/api` — management/read API.
- `apps/worker` — market-data + ASCEND core processing.
- `packages/contracts` — one shared data/event contract.
- `packages/chart-adapter` — chart abstraction so the core is not tied to one chart library.
- `infra` — local/prod infrastructure.
- `docs` — canonical product/core documentation.

## Current product rule

The main Market screen is a decision workspace, not a dashboard wall:

**GLOBAL CONTEXT → SMART RADAR → CENTRAL CHART → DECISION CENTER → SYSTEM STATUS**

The terminal must explain every setup chronologically and keep the chart as the primary workspace.

## ASCEND decision chain

```text
MARKET STATE
→ BALANCE
→ FROZEN LIQUIDITY LEVEL
→ APPROACH / TOUCH
→ PROBE or SWEEP
→ RECLAIM or ACCEPTANCE
→ WATCH
→ 30m CONTEXT
→ 15m SESSION DIRECTION
→ 10m CHOCH / TRANSITION
→ SHIFTING
→ 5m MSS
→ 3m RETEST + HL/LH
→ 1m MICRO-BOS / ENTRY TRIGGER
→ CONFIRMED
→ SCALP or NORMAL ENTRY
→ STRUCTURAL SL
→ NEXT-LIQUIDITY TP
→ EXPANSION
→ NEW BALANCE
```

Structure Engine is the primary decision block. Volume and VWAP are confirming context. RSI MTF and Session Fuel/Power remain research context and must not cancel a structurally valid setup.

## Level semantics

Levels must be time-safe and carry a state:

- `FROZEN` — already known at the evaluated timestamp.
- `LIVE` — currently forming.
- `EXPECTED` — projected/context-only.

Core levels include YH/YL, ONH/ONL, RTH H/L, IBH/IBL, Session Open, VWAP, Balance, session liquidity clusters and confirmed market walls.

No future session high/low may be used before it was known.

## Radar

The radar finds situations; it does not create trades.

Primary states:

- `WATCH`
- `SHIFTING`
- `CONFIRMED / ENTRY READY`

Groups can include HOT NOW, RC30 LONG, RC70 SHORT, YH/YL approach, ONH/ONL approach and other server-side filters.

## Research boundary

The GG work is an isolated research contour. Until exact GG-Osc source code exists it is called `GG-PROXY`, not exact GG.

Research variants:

- BASELINE
- ASCEND CORE
- GG-PROXY STRICT
- GG-PROXY SOFT
- ASCEND + GG STRICT
- ASCEND + GG SOFT

Research results must not silently change the production core.

## Development

```bash
npm install
npm run dev:terminal
npm run build
```

The Railway preview uses `apps/terminal/Dockerfile`.

## Repository cleanup

The old root Python/HTML/Cloudflare monolith was intentionally removed from this rebuild branch. It is still preserved in `main` history and in commit `6f2d104d19a4325330ec36b7afbd7fcf4bb4cdea` while useful behavior is migrated deliberately.

See:

- `docs/CORE.md`
- `docs/MARKET_V1.md`
- `docs/ARCHITECTURE.md`
- `docs/LEGACY_AUDIT.md`
