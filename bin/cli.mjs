#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const endpoint = process.env.CATALYSTDESK_MCP_URL || 'https://x402.catalystdesk.ai/mcp';
const token = process.env.CATALYSTDESK_SESSION_TOKEN;
let protocolVersion = '2025-11-25';
let sessionId = '';

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function error(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

async function readReply(response, id) {
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (type !== 'text/event-stream') return response.json();
  if (!response.body) return null;

  const stream = Readable.fromWeb(response.body, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let data = [];
  let last = null;
  function flush() {
    if (!data.length) return null;
    const payload = data.join('\n');
    data = [];
    try {
      const reply = JSON.parse(payload);
      return reply?.jsonrpc === '2.0' && (Object.hasOwn(reply, 'result') || Object.hasOwn(reply, 'error')) ? reply : null;
    } catch {
      return null;
    }
  }

  try {
    for await (const line of lines) {
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      if (line !== '') continue;
      const reply = flush();
      if (reply?.id === id) return reply;
      if (reply) last = reply;
    }
    return flush() ?? last;
  } finally {
    lines.close();
    stream.destroy();
  }
}

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    error(null, -32700, 'Invalid JSON');
    continue;
  }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    error(null, -32600, 'Invalid JSON-RPC request');
    continue;
  }
  const hasId = Object.hasOwn(message, 'id');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocolVersion,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(message),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    const returnedSession = response.headers.get('mcp-session-id');
    if (response.status === 404 && sessionId) sessionId = '';
    else if (returnedSession) sessionId = returnedSession;
    if (!hasId) {
      await response.body?.cancel();
      continue;
    }
    const reply = await readReply(response, message.id);
    if (reply?.jsonrpc !== '2.0' || reply.id !== message.id) {
      error(message.id, -32000, `Invalid gateway response (HTTP ${response.status})`);
      continue;
    }
    if (message.method === 'initialize' && typeof reply.result?.protocolVersion === 'string'
        && reply.result.protocolVersion) {
      protocolVersion = reply.result.protocolVersion;
    }
    write(reply);
  } catch {
    if (hasId) error(message.id, -32000, 'Gateway request failed');
  }
}
