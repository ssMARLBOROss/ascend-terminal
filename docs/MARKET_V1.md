# ASCEND Market V1 — Command Center

## Purpose

The Market screen is the one place where the operator understands:
1. what the market is doing,
2. which liquidity/structure event happened,
3. what confirmation is still missing,
4. whether entry is still worth taking.

Main flow:

**Global Context → Smart Radar → Central Decision Chart → Decision Center → System Status**

## Keep on Market

- BTC / ETH / SOL context, breadth and global pressure.
- current/previous/next session flow.
- Smart Radar groups.
- confirmed Upper Wall / Balance / Lower Wall.
- YH/YL, ONH/ONL, IBH/IBL, RTH H/L, Open and VWAP.
- previous-session high/low liquidity clusters.
- HH/HL/LH/LL, BOS/CHOCH/MSS.
- setup lifecycle with timestamped, clickable events.
- Volume / RSI / Delta / CVD as context.
- SCALP / NORMAL mode.
- late-entry math: used range, lost move, remaining move, potential move, risk, R:R.
- structural SL and next-liquidity TP route.

## Keep off the Market screen

- duplicate top bars and duplicate symbol selectors.
- five-card duplicate market-pressure walls.
- large news ticker.
- admin/user controls.
- Telegram/Mini App configuration.
- deep journal tables.
- repeated RSI/structure summaries.

Those belong to dedicated views, not the central chart.

## Core sequence

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
→ 1m MICRO-BOS
→ CONFIRMED
→ ENTRY
→ STRUCTURAL SL / NEXT-LIQUIDITY TP
→ EXPANSION
→ NEW BALANCE
```

Math never chooses LONG/SHORT by itself. It decides whether a structurally valid route is still worth trading.

## Interaction rules

- A radar click selects the instrument and preserves current layout.
- A setup marker opens time, price, TF, session, level, explanation and next expected condition.
- Replay steps through events in chronological order.
- Compact/Comfortable changes density, not information.
- Side panels can collapse so the chart becomes the dominant workspace.
- LIVE execution remains unavailable until paper validation is complete.

## Safety

This rebuild branch is clean by design. Legacy production files were removed from this branch only; they remain preserved on `main` and in Git history while required behaviors are migrated.
