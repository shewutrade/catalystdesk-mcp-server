#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const endpoint = process.env.CATALYSTDESK_MCP_URL || 'https://x402.catalystdesk.ai/mcp';
const tokenPattern = /^cd_sess_[A-Za-z0-9_-]{43}$/;

function resolveTokenFile() {
  const override = process.env.CATALYSTDESK_TOKEN_FILE;
  if (override) return override;
  const home = os.homedir();
  if (!path.isAbsolute(home)) throw new Error('CatalystDesk token directory unavailable');
  return path.join(home, '.config', 'catalystdesk', 'session_token');
}

async function saveToken(token) {
  const tokenFile = resolveTokenFile();
  await mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = `${tokenFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${token}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, tokenFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readTokenInput() {
  let supplied = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    supplied += chunk;
    if (supplied.length > 1024) return '';
  }
  return supplied.trim();
}

const saveFromStdin = process.argv[2] === '--save-token-stdin';
if (saveFromStdin || process.argv[2] === '--save-token') {
  try {
    const expectedArguments = saveFromStdin ? 3 : 4;
    const supplied = process.argv.length === expectedArguments
      ? (saveFromStdin ? await readTokenInput() : process.argv[3])
      : '';
    if (supplied.length !== 51 || !tokenPattern.test(supplied)) {
      process.stderr.write('Expected a CatalystDesk session token.\n');
      process.exit(2);
    }
    await saveToken(supplied);
    await new Promise((resolve) => process.stdout.write('CatalystDesk session token saved.\n', resolve));
  } catch {
    process.stderr.write('Could not save the CatalystDesk session token.\n');
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

async function requestToken() {
  if (Object.hasOwn(process.env, 'CATALYSTDESK_SESSION_TOKEN')) {
    return process.env.CATALYSTDESK_SESSION_TOKEN;
  }
  try {
    const saved = (await readFile(resolveTokenFile(), 'utf8')).trim();
    return tokenPattern.test(saved) ? saved : '';
  } catch {
    return '';
  }
}
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
    const token = await requestToken();
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
