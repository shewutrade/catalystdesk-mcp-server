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


With CatalystDesk MCP Server 1.4.0, call the free `get_session_status` tool using the prepaid bearer header. An optional `limit` from 1 to 100 controls the itemized history. Open `/v1/session/console` on the gateway for a CSV statement, receipts and available PDF invoices. Keep tokens in bearer headers or the console form.

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

## V2.5 dual-loop workflow

`get_workspace_state -> preflight_trade -> execute -> reconcile_trade`

Open the [session console](https://x402.catalystdesk.ai/v1/session/console) and verify your email to claim $0.25 of compute credit for seven days, subject to the daily allocation. Save the token when it appears. One preflight and reconciliation pair costs $0.005. The trial covers 50 pairs. OTP rate limiters use process-memory counters that reset on container restart.

1. Call `get_workspace_state` with an active session token to read the current policy, exposure, pending approvals and event history.
2. Call `preflight_trade` with the symbol, venue type, side, notional and entry price. Include your own order book, fees and expected edge when available. On `BLOCK`, stop. The open-lease cap returns `max_open_leases_exceeded`. For prepaid and trial sessions, `ESCALATE_HUMAN` requires operator approval by email OTP in the Buyer Console. Submit the approved event ID within 15 minutes of the initial escalation. Direct per-call x402 entries above `max_auto_notional_usd` return `BLOCK` with `x402_direct_exceeds_auto_notional`.
3. On `ALLOW`, use the lease before it expires. Your execution system places the order and reports fills through `reconcile_trade`. `FILLED` and `PARTIAL` require a live `lease_id`. Send `filled_notional_usd` as the per-fill increment. A running cumulative total would count earlier fills again. Every `PARTIAL` requires `fill_seq` (1..10,000, up to 64 partial sequences per lease). Leased terminal `FILLED`, `CLOSED`, or `CANCELLED` may omit `fill_seq` or use a fresh sequence, including after 64 partials. A `PARTIAL` can use up to the remaining authorization and releases the lease when it exhausts that amount. A terminal `FILLED` can use up to 1.05x the remaining authorized notional. An identical `PARTIAL` retry with the same `fill_seq` returns `409 lease_already_reconciled` at zero charge. Reusing a retained sequence with different parameters returns `400 invalid_arguments`. Leased calls reject `report_id` and `report_seq` with `400 invalid_arguments`. Retrying a terminal or exhausted lease returns `409 lease_already_reconciled` while its receipt exists (24 hours, 512 tombstones per workspace). After expiry or eviction it returns `400 invalid_arguments`.

   Unleased `CLOSED` (positive or flat-book amount-zero) and unleased `CANCELLED` require `report_id` and a strictly increasing workspace `report_seq`. Reuse both on retry. Session clients can read the last accepted sequence in `get_workspace_state` under `metrics.report_seq`. Retry matching treats `bbb` and `BBB` alike, and `100.0` and `100` alike. Identical retries return `409 lease_already_reconciled` at zero charge within the separate 24-hour, 512-report receipt map. After expiry or eviction the `report_seq` high-water mark rejects the retry with `400 invalid_arguments`. Use amount-zero `CLOSED` to book PnL only when the symbol is flat. Use reduce-only for exits that your venue enforces as reduce-only.
4. Call `run_quant_ci_gate` with periodic returns and the total number of trials. Supply the period-by-strategy Sharpe matrix for the CSCV/PBO check. Review both thresholds before using a strategy.
5. Ground a catalyst in SEC EDGAR with `get_sec_catalyst_filings` and `get_insider_form4_flow`. Cite the accession and archive link. Distinguish open-market purchases and sales from grants, exercises and tax withholding.

These five paid tools require no Polygon key. Prices per successful computation are $0.003 for preflight, $0.002 for reconciliation, $0.030 for Quant CI, $0.020 for catalyst filings and $0.030 for Form 4 flow. A BLOCK is a completed computation. An unknown SEC ticker or an upstream SEC failure costs zero. Direct x402 calls build a workspace for the payer and payment scope. Prepaid workspaces retain their history through token rotation.
