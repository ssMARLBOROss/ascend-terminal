# ASCEND SMC Layer Controls V1

UI-only extension in `index.html` for the existing GitHub Pages/Cloudflare Worker terminal.

## User experience

- One **☷ Слои** button in the chart toolbar instead of four persistent technical switches.
- Collapsible four-part drawer: core chart (liquidity, structure, session H/L, VWAP), SMC zones (FVG, IFVG, OB, RB, STB/BTS, OTE), trading/risk (confirmation panel, educational risk note, paper order buttons), Research (journal preview, market participation).
- Presets: **Минимум**, **Рабочий**, **SMC**. Individual controls persist in browser localStorage key `ascend_smc_layers_v1`.
- Default view favors frozen liquidity and VWAP; extra structure/session labels are hidden, not disabled in the decision engine.
- Liquidity layer toggle uses a guard around the **existing** map drawing call. The structure sensor keeps analyzing in the background even when its markers are hidden; session H/L and VWAP delegate to their existing display handlers. FVG's chart zone draws from the existing closed-3m FVG detector. All draw operations are read-only.
- **IFVG / OB / RB / STB-BTS / OTE**: toggle rows are available but marked **NO DATA** until an independently tested read-only detector supplies verified zones. Enabling these rows must not generate an entry signal or fake price levels.
- Existing trade controls operate in **shadow/paper mode**, not live exchange orders.
- The **Risk / R:R** layer includes an independent position-size calculator (equity, risk %, entry, SL, TP, leverage) that computes theoretical notional, margin and R:R; it never sends orders, and excludes fees/funding/slippage from its estimate.
- The **previous sessions** toggle is retained inside the drawer even though the legacy toolbar button is hidden.

## Safety and architecture

This change **does not modify** ASCEND Core, confirmations, historical data ingestion, risk calculations, order-routing logic, Telegram signal routing, or automated trading. Toggle state controls **visibility only**, not execution logic.

`index.html` is self-contained because the active Cloudflare Worker fetches the single HTML file directly from the GitHub main branch; adding an ordinary relative external JS asset would route to the backend rather than the UI. Module source is bounded by identifiable marker comments inside the HTML.

## Verification

```bash
node tests/smc-layer-controls-v1.test.mjs
node tests/cloudflare-confirmation-v2.test.mjs
node tests/cloudflare-fvg-research-v1.test.mjs
```

If any of the tests fail, do not merge. Verify the layer drawer visually on both desktop and mobile. This feature branch is safe to review without rolling out changes to the deployed production terminal.
