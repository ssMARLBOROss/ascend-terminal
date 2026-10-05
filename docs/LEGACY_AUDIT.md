# Legacy audit

Current production root is a working monolith and must not be destroyed before preview approval.

## Reuse
- terminal_api_v2.py: market feed, session/radar endpoints.
- history_store.py: historical storage and analysis.
- bybit_collector.py: exchange data capability.
- platform_proxy.py: review before adapter migration.
- worker.js: current edge/auth/share gate until replacement is ready.

## Replace gradually
- index.html: monolithic UI. Replace with apps/terminal after visual approval.
- main.py: split management API, data worker and compatibility layer.

## Candidate duplication
- share_app.py overlaps current Cloudflare worker sharing logic. Keep temporarily, then choose one implementation after ChartShareToken lands.

## Rule
No deletion on main until the new preview reproduces required behavior and passes a manual checklist.
