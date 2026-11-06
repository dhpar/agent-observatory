import { z } from 'zod';

export const GuardrailSeverity = z.enum(['info', 'warning', 'critical']);
export type GuardrailSeverity = z.infer<typeof GuardrailSeverity>;

export const GuardrailAction = z.enum(['log', 'warn', 'block', 'redact']);
export type GuardrailAction = z.infer<typeof GuardrailAction>;

/** Every guardrail action must land here — nothing is ever silent. */
export const GuardrailEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  rule: z.string().min(1),
  severity: GuardrailSeverity,
  action: GuardrailAction,
  payload: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int(),
});
export type GuardrailEvent = z.infer<typeof GuardrailEventSchema>;
