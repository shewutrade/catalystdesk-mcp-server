# CatalystDesk MCP Server 1.4.0

## V2.5 dual-loop workflow

`get_workspace_state -> preflight_trade -> execute -> reconcile_trade`

Open the [session console](https://x402.catalystdesk.ai/v1/session/console) and verify your email to claim $0.25 of compute credit for seven days, subject to the daily allocation. Save the token when it appears. One preflight and reconciliation pair costs $0.005. The trial covers 50 pairs. OTP rate limiters use process-memory counters that reset on container restart.

1. Workspace access through `get_workspace_state` and the Buyer Console requires a prepaid or trial session token. Call `get_workspace_state` to read the current policy, exposure, pending approvals and event history. Operators can also sign in to the Buyer Console by verified email to set an existing position.
2. Call `preflight_trade` with the symbol, venue type, side, notional and entry price. Include your own order book, fees and expected edge when available. On `BLOCK`, stop. The open-lease cap returns `max_open_leases_exceeded`. For prepaid and trial sessions, `ESCALATE_HUMAN` requires operator approval by email OTP in the Buyer Console. Submit the approved event ID within 15 minutes of the initial escalation. Direct per-call x402 entries above `max_auto_notional_usd` return `BLOCK` with `x402_direct_exceeds_auto_notional`.
3. On `ALLOW`, use the lease before it expires. Your execution system places the order and reports fills through `reconcile_trade`. `FILLED` and `PARTIAL` require a live `lease_id`. Send `filled_notional_usd` as the per-fill increment. A running cumulative total would count earlier fills again. Every `PARTIAL` requires `fill_seq` (1..10,000, up to 64 partial sequences per lease). Leased terminal `FILLED`, `CLOSED`, or `CANCELLED` may omit `fill_seq` or use a fresh sequence, including after 64 partials. A `PARTIAL` can use up to the remaining authorization and releases the lease when it exhausts that amount. A terminal `FILLED` can use up to 1.05x the remaining authorized notional. An identical `PARTIAL` retry with the same `fill_seq` returns `409 lease_already_reconciled` at zero charge. Reusing a retained sequence with different parameters returns `400 invalid_arguments`. Leased calls reject `report_id` and `report_seq` with `400 invalid_arguments`. Retrying a terminal or exhausted lease returns `409 lease_already_reconciled` while its receipt exists (24 hours, 512 tombstones per workspace). After expiry or eviction it returns `400 invalid_arguments`.

   Unleased `CLOSED` (positive or flat-book amount-zero) and unleased `CANCELLED` require `report_id` and a strictly increasing workspace `report_seq`. Reuse both on retry. Session clients can read the last accepted sequence in `get_workspace_state` under `metrics.report_seq`. Retry matching treats `bbb` and `BBB` alike, and `100.0` and `100` alike. Identical retries return `409 lease_already_reconciled` at zero charge within the separate 24-hour, 512-report receipt map. After expiry or eviction the `report_seq` high-water mark rejects the retry with `400 invalid_arguments`. Use amount-zero `CLOSED` to book PnL only when the symbol is flat. Use reduce-only for exits that your venue enforces as reduce-only.
4. Call `run_quant_ci_gate` with periodic returns and the total number of trials. Supply the period-by-strategy Sharpe matrix for the CSCV/PBO check. The scorecard reports how many strategies passed Quant CI badge checks in `verified_strategies_count`, using caller-supplied return series and trial matrices. Review both thresholds before using a strategy.
5. Ground a catalyst in SEC EDGAR with `get_sec_catalyst_filings` and `get_insider_form4_flow`. Cite the accession and archive link. Distinguish open-market purchases and sales from grants, exercises and tax withholding.

These five paid tools require no Polygon key. Prices per successful computation are $0.003 for preflight, $0.002 for reconciliation, $0.030 for Quant CI, $0.020 for catalyst filings and $0.030 for Form 4 flow. A BLOCK is a completed computation. An unknown SEC ticker or an upstream SEC failure costs zero. Direct x402 calls build a workspace for the payer and payment scope. Prepaid workspaces retain their history through token rotation.

## Polygon / Massive market data

Use your own subscribed Polygon / Massive key for real-time U.S. equity inputs.
With a supported delayed subscription, paid tools use your 15-minute delayed
window. Missing, invalid, or ineligible keys get synthetic context on the
same delay at zero charge. When Polygon throttles a key, paid tools return
`429 polygon_rate_limited` and deduct zero credits. Honor the HTTP
`Retry-After` header before retrying. The MCP tool error includes the same
interval as an integer `retry_after_seconds`. Stdio clients can wait that
long before sending another call and spending session or key probe quota.
Call `get_polygon_data_status` to check the key, tier, and cooldown.

For stdio, run `npx -y @catalystdesk/mcp-server --save-polygon-key-stdin` and
enter the key, followed by EOF. For `tools/call` requests, the CLI uses the
owner-only local key file or an explicitly set `CATALYSTDESK_POLYGON_API_KEY`,
which takes precedence. Use `--clear-polygon-key` to remove the file.
Remote HTTP clients can send `X-Polygon-Api-Key` or bind a key to their prepaid
session at [the session console](https://x402.catalystdesk.ai/v1/session/console).
See [Polygon / Massive plans](https://x402.catalystdesk.ai/go/polygon?plan=stocks-advanced).

`@catalystdesk/mcp-server` is a dependency-free Node.js 18+ bridge from MCP stdio to the CatalystDesk Streamable HTTP gateway. Start it with `npx -y @catalystdesk/mcp-server`. The default endpoint is `https://x402.catalystdesk.ai/mcp`. Set `CATALYSTDESK_MCP_URL` to connect to another CatalystDesk gateway.

The free `get_delayed_regime_lite` tool returns 15-minute-delayed trade context from your usable Polygon / Massive key. Without a usable key, the gateway serves clearly labeled synthetic context around the clock with `availability: "delayed_showcase"`, `synthetic_showcase: true`, and `delay_seconds: 900`. Free delayed discovery is limited to 20 requests per hour per IP by default.

## Connect an MCP client

| Client | Setup |
| --- | --- |
| Google Antigravity | Use the bundled `plugin.json` and `mcp_config.json`. |
| Gemini CLI | Use the bundled `gemini-extension.json` and skill for the extension. |
| Claude Code | Run `claude mcp add catalystdesk-regime -- npx -y @catalystdesk/mcp-server`, or load the bundled plugin and `.mcp.json`. |
| Claude Desktop and Cursor | Add the `mcpServers` entry from `mcp_config.json` to the client's MCP settings. |
| OpenAI Codex | Run `codex mcp add catalystdesk-regime -- npx -y @catalystdesk/mcp-server`. |
| ChatGPT | Use the Streamable HTTP endpoint for a remote app. Submission metadata is in `openai/chatgpt-connector.json`. Paid calls require a client that can send a prepaid bearer token or x402 proof. |
| VS Code | In `.vscode/mcp.json`, add a stdio server under `servers` with `command: "npx"` and `args: ["-y", "@catalystdesk/mcp-server"]`. |

## Pay for live compute

Buy a $5, $25, or $100 pack using a card or Apple Pay where enabled. After payment, save the token locally so running stdio bridges pick it up on their next request. [Hosted checkout](https://x402.catalystdesk.ai/v1/session/buy)

```sh
npx -y @catalystdesk/mcp-server --save-token-stdin
```

Paste the token into the command's input, press Enter, then send EOF with Ctrl+D (Ctrl+Z then Enter on Windows). The token stays out of the shell command and its argument list. The bridge reads `~/.config/catalystdesk/session_token` on each request. `CATALYSTDESK_TOKEN_FILE` selects a different file. Leave `CATALYSTDESK_SESSION_TOKEN` unset in the MCP client to use the saved file. An explicitly set value takes precedence, including an empty value.

| Live tool | USDC per call |
| --- | ---: |
| `get_regime_snapshot` | 0.015 |
| `compute_dynamic_regime` | 0.035 |
| `compute_execution_guardrail` | 0.045 |
| `compute_multiframe_resonance` | 0.060 |
| `scan_curated_universe_regimes` | 0.120 |
| `scan_parameter_surface` | 0.150 |

For Base USDC, use x402 per call or fund a session starting at 1 USDC via `POST /v1/session/deposit`. Clients that sign their own x402 proofs can forward them in `tools/call` under `params._meta["x402/payment"]`. Both prepaid rails use the same bearer flow and a 24-hour expiry. Failed calls, including `503 source_stale`, deduct zero credits.

The tools report descriptive statistics with `"executable": false` and `"redistribution_allowed": false`. They provide no trade recommendations and expose no raw prices or quotes.

## Review usage and invoices

Call the free `get_session_status` tool with your prepaid bearer token to see the balance, itemized paid usage and available billing documents. The optional `limit` is 1 to 100. For REST access, use `GET /v1/session/usage` with the same bearer header. Add `?format=csv` to export up to 200 rows with `limit`.

Open the [session console](https://x402.catalystdesk.ai/v1/session/console) to view paid calls, export a CSV statement or download available invoices after the balance expires. Hosted card checkout supports business tax identifiers and official PDF invoices.
