# CatalystDesk MCP Server

`@catalystdesk/mcp-server` is a dependency-free Node.js 18+ bridge from MCP stdio to the CatalystDesk Streamable HTTP gateway. Start it with `npx -y @catalystdesk/mcp-server`. The default endpoint is `https://x402.catalystdesk.ai/mcp`. Set `CATALYSTDESK_MCP_URL` to connect to another CatalystDesk gateway.

The showcase serves synthetic trade summaries delayed by at least 15 minutes. Showcase analytics carry `availability: "delayed_showcase"`, `synthetic_showcase: true`, and `delay_seconds: 900`. Analytics are free in showcase mode and share a 20-requests-per-hour IP limit. Live paid mode accepts x402 on Base and uses USDC. The free `get_delayed_regime_lite` tool returns 15-minute-delayed trade context when the live gateway has public feed coverage.

| Live tool | USDC per call |
| --- | ---: |
| `get_regime_snapshot` | 0.015 |
| `compute_dynamic_regime` | 0.035 |
| `compute_execution_guardrail` | 0.045 |
| `compute_multiframe_resonance` | 0.060 |
| `scan_curated_universe_regimes` | 0.120 |
| `scan_parameter_surface` | 0.150 |

Prepaid sessions start at 1 USDC via `POST /v1/session/deposit`. Set `CATALYSTDESK_SESSION_TOKEN` to an existing session token to send it as a bearer credential. Clients that sign their own x402 proofs can forward them in `tools/call` under `params._meta["x402/payment"]`. The bridge preserves the gateway's tool result and payment metadata.

The tools report descriptive statistics with `"executable": false` and `"redistribution_allowed": false`. They provide no trade recommendations and expose no raw prices or quotes.
