import { describe, expect, it } from 'vitest';
import {
  AdvisorySchema,
  AgentSchema,
  ContextReportSchema,
  CostLedgerEntrySchema,
  GuardrailEventSchema,
  RunSchema,
  SpanSchema,
  TaskSchema,
  isIdOf,
  newId,
} from '../src';

const t = 1730000000000;

describe('domain schemas', () => {
  it('validates a well-formed Run', () => {
    const run = RunSchema.parse({
      id: newId('run'),
      objective: 'research and summarize the state of agentic observability',
      status: 'pending',
      budgetUsd: 0.5,
      startedAt: t,
      createdAt: t,
    });
    expect(isIdOf('run', run.id)).toBe(true);
  });

  it('rejects a non-positive budget', () => {
    expect(() =>
      RunSchema.parse({
        id: newId('run'),
        objective: 'x',
        status: 'pending',
        budgetUsd: 0,
        startedAt: t,
        createdAt: t,
      }),
    ).toThrow();
  });

  it('rejects an empty objective', () => {
    expect(() =>
      RunSchema.parse({
        id: newId('run'),
        objective: '',
        status: 'running',
        startedAt: t,
        createdAt: t,
      }),
    ).toThrow();
  });

  it('validates an Agent', () => {
    const agent = AgentSchema.parse({
      id: newId('agent'),
      runId: newId('run'),
      name: 'researcher',
      role: 'gathers sources',
      provider: 'openai',
      model: 'gpt-4o-mini',
      createdAt: t,
    });
    expect(agent.provider).toBe('openai');
  });

  it('defaults Span usageFidelity to estimated', () => {
    const span = SpanSchema.parse({
      id: newId('span'),
      runId: newId('run'),
      type: 'llm',
      name: 'first-call',
      status: 'running',
      startedAt: t,
    });
    expect(span.usageFidelity).toBe('estimated');
  });

  it('rejects negative token counts on a Span', () => {
    expect(() =>
      SpanSchema.parse({
        id: newId('span'),
        runId: newId('run'),
        type: 'llm',
        name: 'x',
        status: 'completed',
        startedAt: t,
        inputTokens: -1,
      }),
    ).toThrow();
  });

  it('validates a Task', () => {
    const task = TaskSchema.parse({
      id: newId('task'),
      runId: newId('run'),
      agentId: newId('agent'),
      title: 'collect sources',
      status: 'claimed',
    });
    expect(task.status).toBe('claimed');
  });

  it('validates a GuardrailEvent', () => {
    const event = GuardrailEventSchema.parse({
      id: newId('guardrail'),
      runId: newId('run'),
      rule: 'budget-hard-stop',
      severity: 'critical',
      action: 'block',
      createdAt: t,
    });
    expect(event.action).toBe('block');
  });

  it('rejects a ContextReport breakdown of all zeros', () => {
    expect(() =>
      ContextReportSchema.parse({
        id: newId('contextReport'),
        runId: newId('run'),
        windowTokens: 128000,
        usedTokens: 9000,
        breakdown: {
          system: 0,
          tools: 0,
          history: 0,
          toolResults: 0,
          lastUserMessage: 0,
          other: 0,
        },
        fidelity: 'estimated',
        createdAt: t,
      }),
    ).toThrow();
  });

  it('validates a CostLedgerEntry', () => {
    const entry = CostLedgerEntrySchema.parse({
      id: newId('ledger'),
      runId: newId('run'),
      spanId: newId('span'),
      tokensIn: 1200,
      tokensOut: 350,
      costUsd: 0.00218,
      priceVersion: 'pricing-2026-11',
      fidelity: 'exact',
      createdAt: t,
    });
    expect(entry.fidelity).toBe('exact');
  });

  it('keeps Advisory lifecycle inside its enum', () => {
    expect(() =>
      AdvisorySchema.parse({
        id: newId('advisory'),
        runId: newId('run'),
        type: 'stale-tool-results',
        evidence: 'tool result never referenced in 5 turns',
        status: 'retired', // not a valid state
        createdAt: t,
      }),
    ).toThrow();
  });
});
