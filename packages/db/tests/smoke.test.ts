import { describe, expect, it } from 'vitest';
import {
  AgentSchema,
  CostLedgerEntrySchema,
  RunSchema,
  SpanSchema,
  newId,
} from '@observatory/core';
import {
  addAgent,
  appendSpan,
  closeSpan,
  createRun,
  getRun,
  listAgents,
  listLedger,
  listSpans,
  openDatabase,
  recordCost,
  setRunStatus,
} from '../src';

const t = 1730000000000;

describe('db smoke — hello-run writes one span', () => {
  it('persists a run, agent, span and ledger entry, then reads them back', () => {
    const db = openDatabase(); // :memory:

    const run = RunSchema.parse({
      id: newId('run'),
      objective: 'hello world — prove the spine',
      status: 'running',
      budgetUsd: 0.5,
      startedAt: t,
      createdAt: t,
    });
    createRun(db, run);

    const agent = AgentSchema.parse({
      id: newId('agent'),
      runId: run.id,
      name: 'researcher',
      provider: 'openai',
      model: 'gpt-4o-mini',
      createdAt: t + 1,
    });
    addAgent(db, agent);

    const span = SpanSchema.parse({
      id: newId('span'),
      runId: run.id,
      agentId: agent.id,
      type: 'llm',
      name: 'first-call',
      status: 'running',
      startedAt: t + 2,
    });
    appendSpan(db, span);

    closeSpan(db, span.id, {
      status: 'completed',
      endedAt: t + 2_500,
      inputTokens: 1200,
      outputTokens: 350,
      costUsd: 0.00218,
      usageFidelity: 'exact',
    });

    const ledgerEntry = CostLedgerEntrySchema.parse({
      id: newId('ledger'),
      runId: run.id,
      spanId: span.id,
      tokensIn: 1200,
      tokensOut: 350,
      costUsd: 0.00218,
      priceVersion: 'pricing-2026-11',
      fidelity: 'exact',
      createdAt: t + 2_501,
    });
    recordCost(db, ledgerEntry);

    setRunStatus(db, run.id, 'completed', t + 3_000);

    // ---- read back and assert
    const storedRun = getRun(db, run.id);
    expect(storedRun?.status).toBe('completed');
    expect(storedRun?.finishedAt).toBe(t + 3_000);
    expect(storedRun?.budgetUsd).toBe(0.5);

    expect(listAgents(db, run.id)).toHaveLength(1);

    const spans = listSpans(db, run.id);
    expect(spans).toHaveLength(1);
    const storedSpan = spans[0]!;
    expect(storedSpan.name).toBe('first-call');
    expect(storedSpan.status).toBe('completed');
    expect(storedSpan.usageFidelity).toBe('exact');
    expect(storedSpan.inputTokens).toBe(1200);
    expect(storedSpan.endedAt).toBe(t + 2_500);

    const ledger = listLedger(db, run.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.tokensIn + ledger[0]!.tokensOut).toBe(1550);
    expect(ledger[0]!.costUsd).toBeCloseTo(0.00218, 6);
  });

  it('cascade-deletes spans and ledger entries with their run', () => {
    const db2 = openDatabase();
    // reuse minimal inserts; FK cascade keeps the DB clean on delete
    const run = RunSchema.parse({
      id: newId('run'),
      objective: 'provisional',
      status: 'running',
      startedAt: t,
      createdAt: t,
    });
    createRun(db2, run);
    setRunStatus(db2, run.id, 'failed', t + 10);

    const stored = getRun(db2, run.id);
    expect(stored?.status).toBe('failed');
    expect(listSpans(db2, run.id)).toHaveLength(0);
  });
});
