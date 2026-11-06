import { z } from 'zod';

export const ContextBreakdownSchema = z
  .object({
    /** Static role-system prompt portion. */
    system: z.number().int().nonnegative(),
    /** Serialized tool/JSON-schema definitions. */
    tools: z.number().int().nonnegative(),
    /** Chat history messages. */
    history: z.number().int().nonnegative(),
    /** Tool/function results sitting in history. */
    toolResults: z.number().int().nonnegative(),
    /** The most recent user message. */
    lastUserMessage: z.number().int().nonnegative(),
    /** Anything else (documents, cache probes, ...). */
    other: z.number().int().nonnegative(),
  })
  .refine((d) => Object.values(d).some((v) => v > 0), {
    message: 'breakdown must have at least one non-zero component',
  });
export type ContextBreakdown = z.infer<typeof ContextBreakdownSchema>;

/** Per-LLM-call audit of context window usage. Lampshades estimate vs exact. */
export const ContextReportSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  spanId: z.string().optional(),
  windowTokens: z.number().int().positive(),
  usedTokens: z.number().int().positive(),
  breakdown: ContextBreakdownSchema,
  fidelity: z.enum(['exact', 'estimated']),
  createdAt: z.number().int(),
});
export type ContextReport = z.infer<typeof ContextReportSchema>;

/** Advisory state machine: proposed → approved|dismissed → applied. */
export const AdvisoryStatus = z.enum(['proposed', 'approved', 'dismissed', 'applied']);
export type AdvisoryStatus = z.infer<typeof AdvisoryStatus>;

/**
 * Advisory = suggested context-minimization action. NEVER auto-applied in
 * v1: approval is a human act, and applying one must log an event (plan §13).
 */
export const AdvisorySchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  contextReportId: z.string().optional(),
  /** Rule identifier, e.g. 'stale-tool-results', 'system-prompt-heavy'. */
  type: z.string().min(1),
  evidence: z.string().min(1),
  projectedSavingTokens: z.number().int().nonnegative().optional(),
  status: AdvisoryStatus,
  createdAt: z.number().int(),
  decidedAt: z.number().int().optional(),
});
export type Advisory = z.infer<typeof AdvisorySchema>;
