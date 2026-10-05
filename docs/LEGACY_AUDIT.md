# Legacy audit

The rebuild branch intentionally removes the old root monolith so there is one obvious application entry point.

The previous implementation remains preserved in Git history on `main`, especially commit:

`6f2d104d19a4325330ec36b7afbd7fcf4bb4cdea`

## Removed from rebuild root

- `index.html` — large monolithic UI.
- `main.py` — mixed API/UI/Telegram runtime.
- `terminal_api_v2.py` — legacy API module.
- `history_store.py` — legacy history/storage module.
- `bybit_collector.py` — legacy collector.
- `platform_proxy.py` — old proxy.
- `share_app.py` — duplicate share implementation.
- `worker.js` + `wrangler.toml` — old Cloudflare share gate.
- root `requirements.txt` — legacy Python runtime dependencies.
- `README.next.md` — merged into the canonical README.

## What must be migrated, not copied blindly

Useful behavior from legacy code should be reimplemented behind the new boundaries:

- MEXC/Bybit symbol and candle adapters.
- historical storage/backfill.
- session transition history.
- breadth and radar data.
- guest/owner access as a dedicated auth/share module.

No old monolith file should be reintroduced into the repository root.

## Cleanup rule

If a legacy behavior is still required:
1. identify the behavior,
2. write the new contract,
3. migrate only that behavior,
4. add a test,
5. then consider the migration complete.
