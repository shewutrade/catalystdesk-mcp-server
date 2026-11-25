---
name: catalystdesk-regime
description: Discover curated symbols and describe market regime, dispersion, and trade liquidity using the CatalystDesk MCP tools.
---

# CatalystDesk Market Regime

Discover live schemas and prices with `tools/list`. Ask the caller to choose parameters required by the selected schema.

| Tool | When to call |
| --- | --- |
| `list_curated_symbols` | Confirm which tickers are available. |
| `get_delayed_regime_lite` | Read free context delayed by at least 15 minutes. Identify any `synthetic_showcase: true` output as synthetic. |
| `get_session_status` | Read prepaid balance, itemized usage and available billing documents. |
| `get_polygon_data_status` | Check the current data source and the supplied Polygon / Massive key's tier. |
| `get_regime_snapshot` | Describe a ticker's live regime using caller-chosen `fast_period` and `slow_period`. |
| `compute_dynamic_regime` | Build a custom non-time bar regime with caller-chosen `bar_type`, `bar_threshold`, `fast_period`, and `slow_period`. |
| `compute_multiframe_resonance` | Compare alignment across two to four frames. The caller chooses the periods, bar type, and threshold for each frame. |
| `scan_parameter_surface` | Compare in-sample results across caller-chosen period pairs. Confirm the bar settings when supplied. |
| `compute_execution_guardrail` | Describe trade liquidity and volatility using the window and bounds requested by the caller. |
| `scan_curated_universe_regimes` | Compare dispersion across the curated universe with caller-chosen bar settings and periods. |

Treat all analytics as descriptive and non-advisory. Honor `executable: false` and `redistribution_allowed: false`. Preserve the stated source age and distinguish delayed or synthetic output when summarizing. A `503 source_stale` response deducts zero credits.

If a paid call returns `402` with `sessionBuyUrl`, direct the caller to that hosted card and Apple Pay checkout. After payment, they can run `npx -y @catalystdesk/mcp-server --save-token-stdin` in their terminal, paste the token into standard input, press Enter, and send EOF with Ctrl+D (Ctrl+Z then Enter on Windows). Running stdio bridges pick up the saved token on the next request when `CATALYSTDESK_SESSION_TOKEN` is unset. Clients that can sign Base USDC payments may use x402 per call or fund a session at `POST /v1/session/deposit`. Keep bearer tokens private.


With CatalystDesk MCP Server 1.3.1, call the free `get_session_status` tool using the prepaid bearer header. An optional `limit` from 1 to 100 controls the itemized history. Open `/v1/session/console` on the gateway for a CSV statement, receipts and available PDF invoices. Keep tokens in bearer headers or the console form.

Check `get_polygon_data_status` before attempting paid compute. Use your own
subscribed Polygon / Massive key with the `X-Polygon-Api-Key` header, bind it at
`/v1/session/console`, or save it for stdio with
`npx -y @catalystdesk/mcp-server --save-polygon-key-stdin`. See `/go/polygon`
for plan options. Missing, invalid, or ineligible keys receive synthetic
15-minute delayed context at zero charge.

A paid tool returning `429 polygon_rate_limited` deducts zero credits. Honor
the HTTP `Retry-After` header before retrying. During cooldown, the paid tool
error and `get_polygon_data_status` both report the remaining interval as an
integer `retry_after_seconds`. Stdio clients can wait that long before
sending another call and spending session or key probe quota.

During cooldown, `get_polygon_data_status` reports `polygon_entitlement: "rate_limited"`.
It preserves `key_valid` and `realtime_enabled` when a recent usable key check
or warm tenant ring supports them. Paid tools return `429 polygon_rate_limited`
until the cooldown expires.
