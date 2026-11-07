import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { WebSocketServer, type WebSocket } from 'ws';
import { getRun, listAgents, listLedger, listSpans, openDatabase, type Db } from '@observatory/db';
import { Hub, type HubEvent } from './hub';

export interface ServerOptions {
  /** Path to the SQLite file, or an already-open :memory: db for tests. */
  dbPath?: string;
  db?: Db;
  port?: number;
  host?: string;
  /** Local dashboard build to serve (SPA fallback for non-API routes). */
  distDir?: string | null;
  pollMs?: number;
}

export interface RunningServer {
  port: number;
  url: string;
  app: FastifyInstance;
  close(): Promise<void>;
}

export const DEFAULT_PORT = 8787;

export async function startObservatoryServer(options: ServerOptions = {}): Promise<RunningServer> {
  const db = options.db ?? openDatabase(options.dbPath ?? 'data/observatory.db');
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // ---- optional SPA hosting (must register BEFORE boot/listen)
  const distDir = options.distDir === undefined ? defaultDistDir() : options.distDir;
  if (distDir && existsSync(distDir)) {
    await app.register(fastifyStatic, { root: distDir });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        await reply.code(404).send({ error: 'not found' });
        return;
      }
      await reply.sendFile('index.html');
    });
  }

  app.get('/api/healthz', async () => ({ ok: true }));

  app.get('/api/runs', async () => hub.snapshot().runs);

  app.get('/api/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = getRun(db, runId);
    if (!run) {
      await reply.code(404).send({ error: 'run not found' });
      return;
    }
    return {
      run,
      agents: listAgents(db, runId),
      spans: listSpans(db, runId),
      ledger: listLedger(db, runId),
    };
  });

  // ---- live fan-out
  const pollMs = options.pollMs ?? 400;
  const hub = new Hub(db, pollMs);
  const sockets = new Set<WebSocket>();

  const send = (socket: WebSocket, event: HubEvent): void => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  };
  const broadcast = (events: HubEvent[]): void => {
    for (const event of events) for (const socket of sockets) send(socket, event);
  };

  const pump = setInterval(() => broadcast(hub.poll()), pollMs);

  // ---- wire the WebSocket onto the underlying http server
  await app.listen({ port: options.port ?? DEFAULT_PORT, host: options.host ?? '127.0.0.1' });
  const wss = new WebSocketServer({ server: app.server, path: '/ws' });
  wss.on('connection', (socket) => {
    sockets.add(socket);
    send(socket, { type: 'snapshot', snapshot: hub.clientSnapshot() });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });

  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : DEFAULT_PORT;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    app,
    close: async () => {
      clearInterval(pump);
      for (const socket of sockets) socket.close();
      wss.close();
      await app.close();
    },
  };
}

function defaultDistDir(): string | null {
  // When running from the repo, serve the dashboard build if it exists.
  const candidate = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../dashboard/dist',
  );
  return existsSync(candidate) ? candidate : null;
}

// ---- CLI entry: `pnpm dev:server` (uses tsx watch at the root)
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  void startObservatoryServer({
    dbPath: process.env.OBSERVATORY_DB ?? 'data/observatory.db',
    port: Number(process.env.PORT ?? DEFAULT_PORT),
  });
}
