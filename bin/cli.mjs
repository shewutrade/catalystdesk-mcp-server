#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const endpoint = process.env.CATALYSTDESK_MCP_URL || 'https://x402.catalystdesk.ai/mcp';
const tokenPattern = /^cd_sess_[A-Za-z0-9_-]{43}$/;

function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    const host = url.hostname;
    return url.protocol === 'http:' && (
      ['localhost', '[::1]', '::1'].includes(host) || /^127(?:\.\d{1,3}){3}$/.test(host)
    );
  } catch {
    return false;
  }
}

function resolveTokenFile() {
  return resolveCredentialFile(process.env.CATALYSTDESK_TOKEN_FILE, 'session_token');
}

function resolvePolygonKeyFile() {
  return resolveCredentialFile(process.env.CATALYSTDESK_POLYGON_KEY_FILE, 'polygon_api_key');
}

function resolveCredentialFile(override, name) {
  if (override) return override;
  const home = os.homedir();
  if (!path.isAbsolute(home)) throw new Error('CatalystDesk credential directory unavailable');
  return path.join(home, '.config', 'catalystdesk', name);
}

async function saveCredential(value, credentialFile) {
  await mkdir(path.dirname(credentialFile), { recursive: true, mode: 0o700 });
  const temporary = `${credentialFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${value}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, credentialFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readCredentialInput() {
  let supplied = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    supplied += chunk;
    if (supplied.length > 1024) return '';
  }
  return supplied;
}

const saveFromStdin = process.argv[2] === '--save-token-stdin';
if (saveFromStdin || process.argv[2] === '--save-token') {
  try {
    const expectedArguments = saveFromStdin ? 3 : 4;
    const supplied = process.argv.length === expectedArguments
      ? (saveFromStdin ? (await readCredentialInput()).trim() : process.argv[3])
      : '';
    if (supplied.length !== 51 || !tokenPattern.test(supplied)) {
      process.stderr.write('Expected a CatalystDesk session token.\n');
      process.exit(2);
    }
    await saveCredential(supplied, resolveTokenFile());
    await new Promise((resolve) => process.stdout.write('CatalystDesk session token saved.\n', resolve));
  } catch {
    process.stderr.write('Could not save the CatalystDesk session token.\n');
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

function validPolygonKey(key) {
  return typeof key === 'string' && key.length >= 12 && key.length <= 128 && !/[^!-~]/u.test(key);
}

function stripLineEnding(text) {
  return text.endsWith('\r\n') ? text.slice(0, -2) : text.endsWith('\n') ? text.slice(0, -1) : text;
}

const polygonCommand = process.argv[2];
if (typeof polygonCommand === 'string' && polygonCommand.startsWith('--save-polygon-key')
    && polygonCommand !== '--save-polygon-key-stdin') {
  process.stderr.write('Read the Polygon key from stdin with --save-polygon-key-stdin.\n');
  process.exit(2);
}
if (['--save-polygon-key-stdin', '--clear-polygon-key'].includes(polygonCommand)) {
  const clear = polygonCommand === '--clear-polygon-key';
  try {
    if (process.argv.length !== 3) {
      process.stderr.write('Invalid CatalystDesk Polygon key command arguments.\n');
      process.exit(2);
    }
    if (clear) {
      await rm(resolvePolygonKeyFile(), { force: true });
    } else {
      const supplied = stripLineEnding(await readCredentialInput());
      if (!validPolygonKey(supplied)) {
        process.stderr.write('Expected a Polygon API key with 12 to 128 printable ASCII characters and no spaces.\n');
        process.exit(2);
      }
      await saveCredential(supplied, resolvePolygonKeyFile());
    }
    await new Promise((resolve) => process.stdout.write(
      clear ? 'CatalystDesk Polygon key cleared.\n' : 'CatalystDesk Polygon key saved.\n', resolve));
  } catch {
    process.stderr.write('Could not update the CatalystDesk Polygon key file.\n');
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

async function requestPolygonKey() {
  let key;
  if (Object.hasOwn(process.env, 'CATALYSTDESK_POLYGON_API_KEY')) {
    key = process.env.CATALYSTDESK_POLYGON_API_KEY;
  } else {
    try {
      key = stripLineEnding(await readFile(resolvePolygonKeyFile(), 'utf8'));
    } catch {
      return '';
    }
  }
  return validPolygonKey(key) ? key : '';
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
  if (!isAllowedEndpoint(endpoint)) {
    if (hasId) error(message.id, -32000, 'Refusing insecure non-loopback HTTP MCP endpoint');
    continue;
  }
  try {
    const token = await requestToken();
    const polygonKey = message.method === 'tools/call' ? await requestPolygonKey() : '';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocolVersion,
        'User-Agent': 'catalystdesk-stdio/1.3.0',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(polygonKey ? { 'X-Polygon-Api-Key': polygonKey } : {}),
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
