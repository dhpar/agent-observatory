import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  objective: text('objective').notNull(),
  status: text('status').notNull().default('pending'),
  budgetUsd: real('budget_usd'),
  maxTokens: integer('max_tokens'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  createdAt: integer('created_at').notNull(),
  meta: text('meta'),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  params: text('params'),
  createdAt: integer('created_at').notNull(),
});

export const spans = sqliteTable('spans', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  parentSpanId: text('parent_span_id'),
  type: text('type').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),
  usageFidelity: text('usage_fidelity').notNull().default('estimated'),
  error: text('error'),
  retryOf: text('retry_of'),
  data: text('data'),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('proposed'),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  metaData: text('meta_data'),
});

export const guardrailEvents = sqliteTable('guardrail_events', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(),
  severity: text('severity').notNull(),
  action: text('action').notNull(),
  payload: text('payload'),
  createdAt: integer('created_at').notNull(),
});

export const costLedger = sqliteTable('cost_ledger', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  spanId: text('span_id'),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  costUsd: real('cost_usd').notNull(),
  costClass: text('cost_class').notNull().default('unknown'),
  priceVersion: text('price_version'),
  fidelity: text('fidelity').notNull(),
  createdAt: integer('created_at').notNull(),
});
