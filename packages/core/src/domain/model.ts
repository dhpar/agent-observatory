import { z } from 'zod';

/**
 * Providers we know about up front. IMPORTANT: this is a *suggestion list*,
 * not an exclusive enum — any string id may be used, because every new
 * OpenAI-compatible endpoint (OpenRouter model channels, a friend's NGINX'd
 * vLLM, a future aggregator) is still a valid provider. Front ends validate
 * against KnownProviders and warn, not block.
 */
export const KnownProviders = [
  'ollama',
  'vllm',
  'lmstudio',
  'llama-cpp',
  'openrouter',
  'groq',
  'together',
  'hf-inference',
  'openai',
  'anthropic',
] as const;
export type KnownProvider = (typeof KnownProviders)[number];
export const KnownProviderSchema = z.enum(KnownProviders);

export function isKnownProvider(p: string): p is KnownProvider {
  return (KnownProviders as readonly string[]).includes(p);
}

/**
 * A resolved model endpoint. The SDK consumes this; prices deliberately do
 * NOT live here — per-model pricing is versioned data in packages/pricing
 * (plan §3: "prices are data, not logic"), so a price change never touches
 * an agent definition.
 */
export const ModelRefSchema = z
  .object({
    /** Any provider id; see KnownProviders for the well-known set. */
    provider: z.string().min(1),
    /** Provider-model name, e.g. 'llama3.2', 'openai/gpt-oss-20b:free', 'claude-sonnet-4'. */
    model: z.string().min(1),
    /** Custom OpenAI-compatible endpoint; omit for native adapters. */
    baseURL: z.url().optional(),
    /** True for open-weight models — metadata for the UI, plus it unlocks
     * "this run ran on my machine" reporting ($0 compute rows). */
    openWeights: z.boolean().optional(),
    /** True when served via a free tier — cost rows carry 0 USD and the
     * ledger row is flagged 'free' so budgets don't lie about it later. */
    freeTier: z.boolean().optional(),
  })
  .refine((m) => !m.baseURL || m.baseURL.startsWith('http'), {
    message: 'baseURL must be an http(s) endpoint',
  });
export type ModelRef = z.infer<typeof ModelRefSchema>;
