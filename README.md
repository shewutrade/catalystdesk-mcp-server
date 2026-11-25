# CatalystDesk MCP Server 1.3.1

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
