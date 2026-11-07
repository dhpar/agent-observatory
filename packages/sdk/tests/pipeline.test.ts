import { describe, expect, it } from 'vitest';
import { createObservatory } from '../src';
import type { ChatTransport, StreamEvent, StreamUsage } from '../src';

const modelSpec = {
  provider: 'ollama',
  model: 'llama3.2',
  baseURL: 'http://localhost:11434/v1',
  openWeights: true,
} as const;

const userTurn = [{ role: 'user' as const, content: 'hello' }];

function fakeTransport(
  deltas: string[],
  usage: StreamUsage | undefined,
  fail?: Error,
): ChatTransport {
  return async function* () {
    for (const delta of deltas) yield { type: 'text-delta', delta } satisfies StreamEvent;
    if (fail) {
      yield { type: 'error', error: fail } satisfies StreamEvent;
      return;
    }
    yield { type: 'finish', usage, finishReason: 'stop' } satisfies StreamEvent;
  };
}

describe('tracing spine (M1)', () => {
  it('hello-run: one agent, one LLM call → exact span + local ledger row', async () => {
    const observatory = createObservatory({ dbPath: ':memory:', now: () => Date.now() });
    const run = observatory.run('say hi', { budgetUsd: 0.5 });

    const agent = run.agent('greeter', modelSpec, {
      transport: fakeTransport(['h', 'i'], { inputTokens: 4, outputTokens: 2, exact: true }),
    });

    let streamed = '';
    const result = await agent.llm(userTurn, { onDelta: (d) => (streamed += d) });

    expect(streamed).toBe('hi');
    expect(result.text).toBe('hi');
    expect(result.spanId).toBeDefined();

    const spans = observatory.introspect.listSpans(run.id);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.status).toBe('completed');
    expect(span.usageFidelity).toBe('exact'); // endpoint reported usage
    expect(span.inputTokens).toBe(4);
    expect(span.outputTokens).toBe(2);
    expect(span.endedAt).toBeGreaterThan(span.startedAt);

    const ledger = observatory.introspect.listLedger(run.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.tokensIn + ledger[0]!.tokensOut).toBe(6);
    // openWeights without a pricing table → local $0, flagged, not "metered $0"
    expect(ledger[0]!.costClass).toBe('local');
    expect(ledger[0]!.costUsd).toBe(0);

    run.complete();
    expect(observatory.introspect.getRun(run.id)?.status).toBe('completed');
  });

  it('endpoint that reports no usage degrades to estimated, never claims exact', async () => {
    const observatory = createObservatory({ dbPath: ':memory:' });
    const run = observatory.run('usage-less probe');

    const agent = run.agent('probe', modelSpec, { transport: fakeTransport(['ok'], undefined) });
    const result = await agent.llm(userTurn);

    expect(result.usage).toBeUndefined();
    const span = observatory.introspect.listSpans(run.id)[0]!;
    expect(span.status).toBe('completed');
    expect(span.usageFidelity).toBe('estimated');
    expect(span.inputTokens).toBeUndefined(); // no fabricated zeros

    const ledger = observatory.introspect.listLedger(run.id);
    expect(ledger[0]!.fidelity).toBe('estimated');
    expect(ledger[0]!.costClass).toBe('local');
  });

  it('a failing transport marks the span failed and writes no ledger row', async () => {
    const observatory = createObservatory({ dbPath: ':memory:' });
    const run = observatory.run('will explode');

    const agent = run.agent('doomed', modelSpec, {
      transport: fakeTransport(['par', 'tial'], undefined, new Error('ECONNRESET')),
    });

    await expect(agent.llm(userTurn)).rejects.toThrow('ECONNRESET');

    const spans = observatory.introspect.listSpans(run.id);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('failed');
    expect(spans[0]!.error).toContain('ECONNRESET');
    expect(spans[0]!.endedAt).toBeDefined();

    expect(observatory.introspect.listLedger(run.id)).toHaveLength(0);
  });

  it('default transport is the OpenAI-compatible one wired to the modelRef', async () => {
    // Wire-ability check: agent() without transport must construct the
    // OpenAI-compatible transport cleanly (connect failure surfaces, not a
    // missing-module error).
    const observatory = createObservatory({ dbPath: ':memory:' });
    const run = observatory.run('wiring probe');
    const agent = run.agent('wired', modelSpec); // no injected transport
    await expect(agent.llm(userTurn)).rejects.toThrow(/stream broken|connect failed/);
  });
});
