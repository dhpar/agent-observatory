import { z } from 'zod';

/**
 * An Agent's provider/model now describes ANY endpoint: local Ollama,
 * an OpenRouter free tier, or a paid native API. `baseURL` + ModelRef
 * (see model.ts) make this an observation, not a vendor lock-in.
 */
export const AgentSchema = z.object({
  id: z.string(),
  runId: z.string(),
  name: z.string().min(1),
  role: z.string().optional(),
  /**
   * Any provider id — KnownProviders are suggestions, not an enum, so new
   * OpenAI-compatible endpoints work without touching the domain.
   */
  provider: z.string().min(1),
  model: z.string().min(1),
  /** Custom OpenAI-compatible endpoint, e.g. http://localhost:11434/v1. */
  baseURL: z.url().optional(),
  /** Temperature, maxOutputTokens, extra headers (never secrets), ... */
  params: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int(),
});
export type Agent = z.infer<typeof AgentSchema>;
