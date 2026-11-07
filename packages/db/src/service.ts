import { asc, desc, eq } from 'drizzle-orm';
import type { Agent, CostLedgerEntry, Run, Span, SpanPatch } from '@observatory/core';
import type { Db } from './client';
import { agents, costLedger, runs, spans } from './schema';

const toJSON = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

const fromJSON = <T>(value: string | null): T | undefined =>
  value === null ? undefined : (JSON.parse(value) as T);

/* ------------------------------------------------------------------ runs */

export function createRun(db: Db, run: Run): void {
  db.insert(runs)
    .values({
      id: run.id,
      objective: run.objective,
      status: run.status,
      budgetUsd: run.budgetUsd ?? null,
      maxTokens: run.maxTokens ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      createdAt: run.createdAt,
      meta: toJSON(run.meta),
    })
    .run();
}

const rowToSpan = (row: typeof spans.$inferSelect): Span => ({
  id: row.id,
  runId: row.runId,
  agentId: row.agentId ?? undefined,
  parentSpanId: row.parentSpanId ?? undefined,
  type: row.type as Span['type'],
  name: row.name,
  status: row.status as Span['status'],
  startedAt: row.startedAt,
  endedAt: row.endedAt ?? undefined,
  inputTokens: row.inputTokens ?? undefined,
  outputTokens: row.outputTokens ?? undefined,
  costUsd: row.costUsd ?? undefined,
  usageFidelity: row.usageFidelity as Span['usageFidelity'],
  error: row.error ?? undefined,
  retryOf: row.retryOf ?? undefined,
  data: fromJSON(row.data),
});

const rowToLedgerEntry = (row: typeof costLedger.$inferSelect): CostLedgerEntry => ({
  id: row.id,
  runId: row.runId,
  spanId: row.spanId ?? undefined,
  tokensIn: row.tokensIn,
  tokensOut: row.tokensOut,
  costUsd: row.costUsd,
  costClass: row.costClass as CostLedgerEntry['costClass'],
  priceVersion: row.priceVersion ?? undefined,
  fidelity: row.fidelity as CostLedgerEntry['fidelity'],
  createdAt: row.createdAt,
});

const rowToRun = (row: typeof runs.$inferSelect): Run => ({
  id: row.id,
  objective: row.objective,
  status: row.status as Run['status'],
  budgetUsd: row.budgetUsd ?? undefined,
  maxTokens: row.maxTokens ?? undefined,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt ?? undefined,
  createdAt: row.createdAt,
  meta: fromJSON(row.meta),
});

export function getRun(db: Db, runId: string): Run | undefined {
  const row = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!row) return undefined;
  return rowToRun(row);
}

export function setRunStatus(
  db: Db,
  runId: string,
  status: Run['status'],
  finishedAt?: number,
): void {
  db.update(runs)
    .set(finishedAt === undefined ? { status } : { status, finishedAt })
    .where(eq(runs.id, runId))
    .run();
}

/* ---------------------------------------------------------------- agents */

export function addAgent(db: Db, agent: Agent): void {
  db.insert(agents)
    .values({
      id: agent.id,
      runId: agent.runId,
      name: agent.name,
      role: agent.role ?? null,
      provider: agent.provider,
      model: agent.model,
      params: toJSON(agent.params),
      createdAt: agent.createdAt,
    })
    .run();
}

const rowToAgent = (row: typeof agents.$inferSelect): Agent => ({
  id: row.id,
  runId: row.runId,
  name: row.name,
  role: row.role ?? undefined,
  provider: row.provider as Agent['provider'],
  model: row.model,
  params: fromJSON(row.params),
  createdAt: row.createdAt,
});

export function listAgents(db: Db, runId: string): Agent[] {
  return db.select().from(agents).where(eq(agents.runId, runId)).all().map(rowToAgent);
}

/** Every agent in the store, oldest first — used by the dashboard hub. */
export function listAllAgents(db: Db): Agent[] {
  return db.select().from(agents).all().map(rowToAgent);
}

/** Runs, newest first — used by the dashboard. */
export function listRuns(db: Db, options?: { limit?: number }): Run[] {
  return db
    .select()
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(options?.limit ?? 200)
    .all()
    .map(rowToRun);
}

/* ----------------------------------------------------------------- spans */

export function appendSpan(db: Db, span: Span): void {
  db.insert(spans)
    .values({
      id: span.id,
      runId: span.runId,
      agentId: span.agentId ?? null,
      parentSpanId: span.parentSpanId ?? null,
      type: span.type,
      name: span.name,
      status: span.status,
      startedAt: span.startedAt,
      endedAt: span.endedAt ?? null,
      inputTokens: span.inputTokens ?? null,
      outputTokens: span.outputTokens ?? null,
      costUsd: span.costUsd ?? null,
      usageFidelity: span.usageFidelity,
      error: span.error ?? null,
      retryOf: span.retryOf ?? null,
      data: toJSON(span.data),
    })
    .run();
}

export function closeSpan(db: Db, spanId: string, patch: SpanPatch): void {
  db.update(spans)
    .set({
      status: patch.status,
      endedAt: patch.endedAt ?? null,
      inputTokens: patch.inputTokens ?? null,
      outputTokens: patch.outputTokens ?? null,
      costUsd: patch.costUsd ?? null,
      usageFidelity: patch.usageFidelity ?? 'estimated',
      error: patch.error ?? null,
    })
    .where(eq(spans.id, spanId))
    .run();
}

export function listSpans(db: Db, runId: string): Span[] {
  return db
    .select()
    .from(spans)
    .where(eq(spans.runId, runId))
    .orderBy(asc(spans.startedAt))
    .all()
    .map(rowToSpan);
}

/** Everything in the spans table, oldest first — used by `observatory tail`. */
export function listAllSpans(db: Db): Span[] {
  return db.select().from(spans).orderBy(asc(spans.startedAt)).all().map(rowToSpan);
}

/* ----------------------------------------------------------- cost ledger */

export function recordCost(db: Db, entry: CostLedgerEntry): void {
  db.insert(costLedger)
    .values({
      id: entry.id,
      runId: entry.runId,
      spanId: entry.spanId ?? null,
      tokensIn: entry.tokensIn,
      tokensOut: entry.tokensOut,
      costUsd: entry.costUsd,
      costClass: entry.costClass,
      priceVersion: entry.priceVersion ?? null,
      fidelity: entry.fidelity,
      createdAt: entry.createdAt,
    })
    .run();
}

export function listLedger(db: Db, runId: string): CostLedgerEntry[] {
  return db
    .select()
    .from(costLedger)
    .where(eq(costLedger.runId, runId))
    .orderBy(asc(costLedger.createdAt))
    .all()
    .map(rowToLedgerEntry);
}
