# ASCEND Market V1 — Command Center

This branch is the clean rebuild of the main working screen. It does **not** change live trading logic.

## Main screen
Global Context → Smart Radar → Central Decision Chart → Decision Panel → System Status.

### Keep on Market
- BTC / ETH / SOL context, breadth, global pressure, session/fuel.
- Smart Radar groups.
- Session Flow: previous → current → next.
- Confirmed Market Walls: Upper Wall / Balance / Lower Wall.
- YH/YL, ONH/ONL, IBH/IBL, RTH H/L, Open, VWAP.
- Previous-session High/Low Liquidity Clusters.
- HH/HL/LH/LL, BOS/CHOCH/MSS.
- Setup lifecycle and clickable event markers.
- Volume / RSI / Delta / CVD.
- SCALP / NORMAL context and late-entry math.

### Move off the main screen
- duplicate top bars and duplicate symbol selectors;
- old five-card Market Pressure wall;
- large news ticker;
- admin/user controls;
- Telegram/Mini App controls;
- deep journal tables;
- duplicated RSI/structure summaries.

Those features are not deleted from the product. They move to their own pages.

## Core sequence
MARKET STATE → BALANCE → LIQUIDITY → REACTION → MTF STRUCTURE → ENTRY → SL/TP → RESULT

BALANCE → APPROACH → TOUCH → PROBE/SWEEP → RECLAIM or ACCEPT → WATCH → 30m Context → 15m Session Direction → 10m CHOCH → SHIFTING → 5m MSS → 3m Retest + HL/LH → 1m Micro-BOS → CONFIRMED → ENTRY.

Math does not decide LONG/SHORT by itself. It gates whether a setup is worth running.

## Safety
Existing root Python/HTML/Cloudflare files remain untouched until the new Market preview is approved. After approval we migrate live feeds and only then retire duplicated legacy UI.
