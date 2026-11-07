/**
 * M1 exit check: a real run against a real endpoint, observed end-to-end.
 *
 *   pnpm hello          (from repo root)
 *   pnpm observatory    (in a second terminal, to watch spans live)
 *
 * Environment (all optional — these are the defaults):
 *   OLLAMA_BASE_URL  http://localhost:11434/v1
 *   OLLAMA_MODEL     llama3.2
 *   OBSERVATORY_DB   data/observatory.db
 */
import { createObservatory, type ChatMessage } from '@observatory/sdk';

const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const model = process.env.OLLAMA_MODEL ?? 'llama3.2';
const dbPath = process.env.OBSERVATORY_DB ?? 'data/observatory.db';

const observatory = createObservatory({ dbPath });
console.log(`[hello-run] run → ${dbPath} | endpoint ${baseURL} | model ${model}`);

const run = observatory.run('Say hello and prove the tracing spine works.', {
  maxTokens: 2000,
});
console.log(`[hello-run] run id: ${run.id}`);

try {
  const agent = run.agent('demogreeter', { provider: 'ollama', model, baseURL, openWeights: true });

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content:
        'Greet the world, then in one short sentence confirm you are an observable LLM call.',
    },
  ];

  const result = await agent.llm(messages, {
    temperature: 0.2,
    onDelta: (d) => process.stdout.write(d), // stream to the terminal, as agents do
  });

  process.stdout.write('\n---\n');
  console.log(`[hello-run] span:   ${result.spanId}`);
  console.log(
    `[hello-run] tokens: ${result.usage ? JSON.stringify(result.usage) : 'not reported by endpoint (estimated)'}`,
  );

  run.complete();
  console.log('[hello-run] run completed. Watch it replay with: pnpm observatory --db ' + dbPath);
} catch (error) {
  run.fail();
  console.error('[hello-run] run failed:', error);
  process.exitCode = 1;
}
