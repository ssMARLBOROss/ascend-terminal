# ASCEND Core — canonical working rules

This document describes the current working core for implementation. Research ideas are explicitly separated below.

## 1. Non-negotiable execution rules

1. No look-ahead. A level/event can be used only after it exists at that timestamp.
2. Session open is permission to trade, not an entry signal.
3. Enter only after structural confirmation.
4. A touch or sweep activates observation; it never creates a trade by itself.
5. Every decision must be reproducible from timestamped events.
6. Structural SL is derived from the invalidation point.
7. Targets come from the next meaningful liquidity/structure objective, not from an old external signal target.
8. If confirmation arrives too late and the useful move is already consumed, the setup is skipped.

## 2. Core state machine

```text
MARKET STATE
→ BALANCE
→ FROZEN LIQUIDITY LEVEL
→ APPROACH
→ TOUCH
→ PROBE / SWEEP
→ RECLAIM / ACCEPTANCE
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
→ MANAGE
→ EXPANSION
→ NEW BALANCE
```

## 3. Structure hierarchy

- 30m — higher context.
- 15m — direction of the active session.
- 10m — CHOCH / transition.
- 5m — MSS.
- 3m — retest + HL/LH.
- 1m — micro-BOS / exact trigger.

Higher timeframes remain available for global context and major support/resistance.

## 4. Levels

Core level families:

- YH / YL
- ONH / ONL
- RTH High / Low
- IBH / IBL
- Session Open
- VWAP
- Balance / Equilibrium
- previous-session high/low liquidity clusters
- confirmed Upper / Lower market walls

Every level must expose status `FROZEN | LIVE | EXPECTED`.

## 5. Reaction semantics

- `PROBE` — price tests the area without a confirmed liquidity take.
- `SWEEP` — liquidity is taken beyond the level.
- `RECLAIM` — price returns back through the level after probe/sweep.
- `ACCEPTANCE` — price holds beyond the level and establishes value there.

Reclaim and acceptance are mutually important branches: rejection and continuation must both be represented.

## 6. Context vs decision

Primary decision:
- market structure and time-safe liquidity events.

Confirming context:
- volume,
- VWAP,
- reaction quality.

Research/context only unless separately validated:
- RSI MTF recovery logic,
- Session Fuel / Session Power,
- GG-PROXY,
- Delta/CVD as independent veto logic.

These context fields may be displayed and logged, but they do not have authority to cancel a structurally correct setup in the current core.

## 7. SCALP vs NORMAL

Both modes use the same structural truth. They differ in route expectations and tolerated remaining move.

The terminal must show:
- confirmation time,
- entry time,
- used range,
- lost move,
- remaining move,
- potential move,
- risk,
- R:R,
- next target liquidity.

## 8. Event log contract

Every core event needs:
- eventId,
- sequenceId,
- instrument,
- timeframe,
- type,
- timestamp,
- price,
- session,
- level,
- direction,
- explanation,
- nextExpected,
- payload.

The UI must be able to replay these events one-by-one and explain why the system moved from WATCH to SHIFTING to CONFIRMED.

## 9. Research isolation

GG comparison and RSI strict/soft tests live outside the production decision state machine.

Until exact GG oscillator code is available, results are labelled `GG-PROXY`.

Historical external TP values are used only for BASELINE comparison. ASCEND variants recalculate Entry → Structural SL → next liquidity target after ASCEND confirmation.
