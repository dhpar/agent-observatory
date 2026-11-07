import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ModelRef, Run } from '@observatory/core';
import { CostLedgerEntrySchema, RunSchema, SpanSchema, newId } from '@observatory/core';
import {
  addAgent,
  appendSpan,
  closeSpan,
  createRun,
  getRun,
  listLedger,
  listSpans,
  openDatabase,
  recordCost,
  setRunStatus,
  type Db,
} from '@observatory/db';
import type { ChatMessage, ChatTransport, StreamUsage } from './transport';
import { createOpenAICompatibleTransport } from './transport/openai-compatible';

export {
  type ChatMessage,
  type ChatTransport,
  type StreamEvent,
  type StreamUsage,
} from './transport';
export { createOpenAICompatibleTransport } from './transport/openai-compatible';

export interface ObservatoryOptions {
  /** SQLite file; ':memory:' for tests. Defaults to ./data/observatory.db. */
  dbPath?: string;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export type AgentModelSpec = ModelRef & { params?: Record<string, unknown> };

export interface LlmCallOptions {
  temperature?: number;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LlmCallResult {
  text: string;
  usage?: StreamUsage;
  finishReason?: string;
  spanId: string;
}

export interface AgentHandle {
  id: string;
  modelRef: ModelRef;
  /** One observed LLM call = one span = zero or one ledger row. */
  llm(messages: ChatMessage[], options?: LlmCallOptions): Promise<LlmCallResult>;
}

export interface RunHandle {
  id: string;
  objective: string;
  complete(): void;
  fail(): void;
  cancel(): void;
  agent(
    name: string,
    modelSpec: AgentModelSpec,
    options?: { transport?: ChatTransport; role?: string },
  ): AgentHandle;
}

export interface Observatory {
  run(objective: string, options?: { budgetUsd?: number; maxTokens?: number }): RunHandle;
  introspect: {
    getRun(runId: string): Run | undefined;
    listSpans(runId: string): ReturnType<typeof listSpans>;
    listLedger(runId: string): ReturnType<typeof listLedger>;
  };
}

const DEFAULT_DB = 'data/observatory.db';

export function createObservatory(options: ObservatoryOptions = {}): Observatory {
  const dbPath = options.dbPath ?? DEFAULT_DB;
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath) || '.', { recursive: true });
  const db = openDatabase(dbPath);
  const now = options.now ?? (() => Date.now());

  function createRunHandle(run: Run): RunHandle {
    const finish = (status: 'completed' | 'failed' | 'cancelled') =>
      setRunStatus(db, run.id, status, now());

    return {
      id: run.id,
      objective: run.objective,

      complete: () => finish('completed'),
      fail: () => finish('failed'),
      cancel: () => finish('cancelled'),

      agent(name, modelSpec, agentOptions = {}) {
        const transport: ChatTransport =
          agentOptions.transport ??
          createOpenAICompatibleTransport({
            baseURL: modelSpec.baseURL ?? 'http://localhost:11434/v1',
          });

        const agent = {
          id: newId('agent'),
          runId: run.id,
          name,
          role: agentOptions.role,
          provider: modelSpec.provider,
          model: modelSpec.model,
          baseURL: modelSpec.baseURL,
          params: modelSpec.params,
          createdAt: now(),
        };
        addAgent(db, agent);

        return {
          id: agent.id,
          modelRef: {
            provider: modelSpec.provider,
            model: modelSpec.model,
            baseURL: modelSpec.baseURL,
            openWeights: modelSpec.openWeights,
            freeTier: modelSpec.freeTier,
          } satisfies ModelRef,

          async llm(messages, callOptions = {}): Promise<LlmCallResult> {
            const span = SpanSchema.parse({
              id: newId('span'),
              runId: run.id,
              agentId: agent.id,
              type: 'llm',
              name: `${modelSpec.provider}:${modelSpec.model}`,
              status: 'running',
              startedAt: now(),
            });
            appendSpan(db, span);

            try {
              let text = '';
              let usage: StreamUsage | undefined;
              let finishReason: string | undefined;

              for await (const event of transport({
                model: modelSpec.model,
                messages,
                temperature: callOptions.temperature,
                signal: callOptions.signal,
              })) {
                if (event.type === 'text-delta') {
                  text += event.delta;
                  callOptions.onDelta?.(event.delta);
                } else if (event.type === 'finish') {
                  usage = event.usage;
                  finishReason = event.finishReason;
                } else {
                  throw event.error instanceof Error ? event.error : new Error(String(event.error));
                }
              }

              closeSpan(db, span.id, {
                status: 'completed',
                endedAt: now(),
                inputTokens: usage?.inputTokens,
                outputTokens: usage?.outputTokens,
                // Local/free runs price at $0 by policy (Amendment A); the
                // ledger row's costClass carries the WHY.
                costUsd: 0,
                usageFidelity: usage?.exact ? 'exact' : 'estimated',
              });
              recordCost(
                db,
                CostLedgerEntrySchema.parse({
                  id: newId('ledger'),
                  runId: run.id,
                  spanId: span.id,
                  tokensIn: usage?.inputTokens ?? 0,
                  tokensOut: usage?.outputTokens ?? 0,
                  costUsd: 0,
                  costClass:
                    modelSpec.freeTier === true
                      ? 'free'
                      : modelSpec.openWeights === true
                        ? 'local'
                        : 'unknown',
                  priceVersion:
                    modelSpec.freeTier || modelSpec.openWeights ? undefined : 'pricing-pending',
                  fidelity: usage?.exact ? 'exact' : 'estimated',
                  createdAt: now(),
                }),
              );

              return { text, usage, finishReason, spanId: span.id };
            } catch (error) {
              closeSpan(db, span.id, {
                status: 'failed',
                endedAt: now(),
                error: error instanceof Error ? error.message : String(error),
              });
              throw error;
            }
          },
        };
      },
    };
  }

  return {
    run(objective, runOptions = {}) {
      const t = now();
      const run = RunSchema.parse({
        id: newId('run'),
        objective,
        status: 'running',
        budgetUsd: runOptions.budgetUsd,
        maxTokens: runOptions.maxTokens,
        startedAt: t,
        createdAt: t,
      });
      createRun(db, run);
      return createRunHandle(run);
    },
    introspect: {
      getRun: (runId) => getRun(db, runId),
      listSpans: (runId) => listSpans(db, runId),
      listLedger: (runId) => listLedger(db, runId),
    },
  };
}

/** Internal: the CLI tail needs the raw db handle; tests use :memory:. */
export function withDatabase<T>(dbPath: string, fn: (db: Db) => T): T {
  return fn(openDatabase(dbPath));
}
