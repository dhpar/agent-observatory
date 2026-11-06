import { z } from 'zod';

export const RunId = z.string();
export type RunId = z.infer<typeof RunId>;

/** A participant: one model with a role, attached to exactly one Run. */
export const AgentSchema = z.object({
  id: z.string(),
  runId: RunId,
  name: z.string().min(1),
  role: z.string().optional(),
  /** 'openai' | 'anthropic' | 'ollama' for now; free-form for adapters later. */
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  model: z.string().min(1),
  /** Temperature, maxOutputTokens, baseURL overrides, ... */
  params: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int(),
});
export type Agent = z.infer<typeof AgentSchema>;
