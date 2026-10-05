# ASCEND architecture

## Target shape

```text
Exchange feeds
    ↓
Data adapters / normalizer
    ↓
Time-safe market state
    ↓
ASCEND worker / event engine
    ↓
Shared contracts
    ↓
API + event stream
    ↓
Terminal
```

## Ownership

### apps/terminal
Responsible for:
- chart,
- radar,
- session flow,
- setup lifecycle,
- decision explanation,
- paper controls,
- journal/analytics views later.

It must not contain exchange-specific decision logic.

### apps/api
Responsible for:
- read APIs,
- terminal session/auth later,
- user/admin management later,
- journal persistence endpoints later.

It must not calculate trading direction in HTTP controllers.

### apps/worker
Responsible for:
- data normalization,
- time-safe level freezing,
- structure engine,
- setup state machine,
- risk/route calculations,
- emitting ordered ASCEND events.

### packages/contracts
Single source of truth for shared DTOs and event types.

### packages/chart-adapter
The terminal depends on this interface, not directly on one chart provider.

## Data infrastructure

Planned/target:
- PostgreSQL — durable candles/events/journal/backtests.
- Redis — hot state, radar queues, active setup state.
- Object storage — optional historical archives.

## Deployment rule

A preview branch must be deployable independently from production. Production migration happens only after:
1. UI approval,
2. live data parity,
3. event replay parity,
4. no-look-ahead tests,
5. paper execution validation.
