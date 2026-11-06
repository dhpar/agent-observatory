import { z } from 'zod';

/** Lifecycle of a Run. */
export const RunStatus = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'incomplete',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/**
 * A Run is one orchestration execution: an objective, participants,
 * budgets, and everything that happened under it.
 */
export const RunSchema = z.object({
  id: z.string(),
  objective: z.string().min(1),
  status: RunStatus,
  /** Hard spend cap in USD. Omit for uncapped. */
  budgetUsd: z.number().positive().optional(),
  /** Hard token cap for the whole run. */
  maxTokens: z.number().int().positive().optional(),
  startedAt: z.number().int(),
  finishedAt: z.number().int().optional(),
  createdAt: z.number().int(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Run = z.infer<typeof RunSchema>;
