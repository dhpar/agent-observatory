import { z } from 'zod';

export const SpanType = z.enum(['llm', 'tool', 'subagent', 'custom']);
export type SpanType = z.infer<typeof SpanType>;

export const SpanStatus = z.enum(['pending', 'running', 'completed', 'failed', 'interrupted']);
export type SpanStatus = z.infer<typeof SpanStatus>;

/**
 * Whether the tokens/cost on this span are provider-reported (exact) or
 * client-estimated via tokenizer. Never claims exact without a report.
 */
export const UsageFidelity = z.enum(['exact', 'estimated']);
export type UsageFidelity = z.infer<typeof UsageFidelity>;

/** An observed unit of work under a Run. Tree-shaped via parentSpanId. */
export const SpanSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  parentSpanId: z.string().optional(),
  type: SpanType,
  name: z.string().min(1),
  status: SpanStatus,
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  usageFidelity: UsageFidelity.default('estimated'),
  error: z.string().optional(),
  /** Retry chains link back via retryOf so retries never double-count. */
  retryOf: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type Span = z.infer<typeof SpanSchema>;

/** Fields a caller may set when closing a span. Everything else is append-only. */
export const SpanPatchSchema = z.object({
  status: SpanStatus,
  endedAt: z.number().int().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  usageFidelity: UsageFidelity.optional(),
  error: z.string().optional(),
});
export type SpanPatch = z.infer<typeof SpanPatchSchema>;
