import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocketRaw from 'ws';
import { addAgent, appendSpan, closeSpan, createRun, openDatabase } from '@observatory/db';
import { newId, RunSchema, SpanSchema } from '@observatory/core';
import { startObservatoryServer, type RunningServer } from '../src';

// :memory: for tests — server receives the open handle.
const db = openDatabase();

interface ServerEvent {
  type: string;
  snapshot?: {
    runs: Array<{ id: string }>;
    agents: Array<{ id: string }>;
    spans: Array<{ id: string; status: string }>;
  };
  [key: string]: unknown;
}

interface WsClient {
  next(): Promise<ServerEvent>;
  close(): void;
}

let server: RunningServer;

const t = () => Date.now();

async function freshRun(objective = 'test run'): Promise<string> {
  const t0 = t();
  const run = RunSchema.parse({
    id: newId('run'),
    objective,
    status: 'running',
    startedAt: t0,
    createdAt: t0,
  });
  createRun(db, run);
  return run.id;
}

beforeAll(async () => {
  server = await startObservatoryServer({ db, pollMs: 60, port: 0 });
});

afterAll(async () => {
  await server.close();
});

function wsEvents(): WsClient {
  const socket = new WebSocketRaw(`ws://127.0.0.1:${server.port}/ws`);
  const received: ServerEvent[] = [];
  const resolvers: Array<(v: ServerEvent) => void> = [];
  socket.on('message', (data) => {
    // FIFO: newest message is queued; a waiting resolver receives the OLDEST.
    received.push(JSON.parse(String(data)) as ServerEvent);
    const awaiting = resolvers.shift();
    if (awaiting) awaiting(received.shift() as ServerEvent);
  });
  return {
    next: () => {
      const queued = received.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise<ServerEvent>((resolve) => resolvers.push(resolve));
    },
    close: () => socket.close(),
  };
}

describe('observatory server (M2, read-only)', () => {
  it('healthz responds ok', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('REST: runs list + run detail; 404 unknown /api route; 404 unknown run', async () => {
    const runId = await freshRun();
    const list = await server.app.inject({ method: 'GET', url: '/api/runs' });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).map((r) => r.id)).toContain(runId);

    const detail = await server.app.inject({ method: 'GET', url: `/api/runs/${runId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      run: { id: runId, status: 'running' },
      agents: [],
      spans: [],
      ledger: [],
    });

    const missingRun = await server.app.inject({ method: 'GET', url: '/api/runs/run_nope' });
    expect(missingRun.statusCode).toBe(404);
    const unknownRoute = await server.app.inject({ method: 'GET', url: '/api/unknown' });
    expect(unknownRoute.statusCode).toBe(404);
  });

  it('WS: snapshot on connect, and snapshot-after-reconnect reflects live writes (E10)', async () => {
    const t0 = t();
    const runId = await freshRun('ws test run');
    const agentId = newId('agent');
    addAgent(db, {
      id: agentId,
      runId,
      name: 'researcher',
      provider: 'ollama',
      model: 'Qwen:latest',
      createdAt: t0,
    });
    const span = SpanSchema.parse({
      id: newId('span'),
      runId,
      agentId,
      type: 'llm',
      name: 'ollama:Qwen:latest',
      status: 'running',
      startedAt: t0,
    });
    appendSpan(db, span);

    const client1 = wsEvents();
    const first = await client1.next();
    expect(first.type).toBe('snapshot');
    expect(first.snapshot?.spans.map((s) => s.id)).toContain(span.id);
    client1.close();

    closeSpan(db, span.id, {
      status: 'completed',
      endedAt: t(),
      inputTokens: 7,
      outputTokens: 3,
      usageFidelity: 'exact',
    });

    const client2 = wsEvents();
    const second = await client2.next();
    expect(second.type).toBe('snapshot');
    const found = second.snapshot?.spans.find((s) => s.id === span.id);
    expect(found?.status).toBe('completed');
    client2.close();
  });

  it('live delta: a span closed after connect arrives as a span event', async () => {
    const runId = await freshRun('live delta run');
    const client = wsEvents();
    await client.next(); // snapshot

    const span = SpanSchema.parse({
      id: newId('span'),
      runId,
      type: 'tool',
      name: 'read-file',
      status: 'completed',
      startedAt: t(),
      endedAt: t(),
    });
    appendSpan(db, span);

    const next = await client.next();
    expect(next.type).toBe('span');
    const spanEvent = next as unknown as { span: { id: string } };
    expect(spanEvent.span.id).toBe(span.id);
    client.close();
  });
});
