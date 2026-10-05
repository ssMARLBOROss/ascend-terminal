# ASCEND Terminal — Next architecture

The current production root remains live while the clean terminal is developed under apps/.

## New workspace
- apps/terminal — React + TypeScript command center
- apps/api — NestJS + Fastify management API skeleton
- apps/worker — data/core worker skeleton
- packages/contracts — shared event/data contracts
- packages/chart-adapter — chart abstraction
- docs/MARKET_V1.md — approved Market screen behavior
- docs/LEGACY_AUDIT.md — migration/cleanup map

Run the new preview with npm install && npm run dev:terminal.

Do not remove the root legacy deployment until the new Market preview is approved and live data compatibility is verified.
