import { describe, expect, it } from 'vitest';
import { createOpenAICompatibleTransport, type StreamEvent } from '../src';

/** Mimics undici's AggregateError wrapping of a refused connection. */
function refusedFetch(): typeof fetch {
  return (async () => {
    const endpointRefused = new Error('connect ECONNREFUSED ::1:11434');
    (endpointRefused as { code?: string }).code = 'ECONNREFUSED';
    const wrapped = new Error('fetch failed');
    (wrapped as { errors?: unknown[] }).errors = [endpointRefused];
    throw wrapped;
  }) as unknown as typeof fetch;
}

describe('openai-compatible transport', () => {
  it('surfaces the real errno from a refused connection (regression: bare "fetch failed")', async () => {
    const transport = createOpenAICompatibleTransport({
      baseURL: 'http://localhost:11434/v1',
      fetchImpl: refusedFetch(),
    });

    const events: StreamEvent[] = [];
    for await (const event of transport({
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    const [errorEvent] = events as [{ type: 'error'; error: Error }];
    expect(errorEvent.type).toBe('error');
    expect(errorEvent.error.message).toContain('connect failed');
    expect(errorEvent.error.message).toContain('ECONNREFUSED');
    // and the part that solved this very bug: WHICH stack refused
    expect(errorEvent.error.message).toContain('::1:11434');
  });

  it('surfaces HTTP status + body for non-200 responses', async () => {
    const transport = createOpenAICompatibleTransport({
      baseURL: 'http://127.0.0.1:11434/v1',
      fetchImpl: (async () =>
        new Response('{"error":"model not found"}', { status: 404 })) as unknown as typeof fetch,
    });

    const events: StreamEvent[] = [];
    for await (const event of transport({ model: 'llama3.2', messages: [] })) {
      events.push(event);
    }

    const [errorEvent] = events as [{ type: 'error'; error: Error }];
    expect(errorEvent.error.message).toContain('HTTP 404');
    expect(errorEvent.error.message).toContain('model not found');
  });
});
