import { describe, expect, it } from 'vitest';
import { AgentSchema, KnownProviderSchema, ModelRefSchema, isKnownProvider, newId } from '../src';

const t = 1730000000000;

describe('model selection (Amendment A)', () => {
  it('accepts a local Ollama model ref', () => {
    const ref = ModelRefSchema.parse({
      provider: 'ollama',
      model: 'llama3.2',
      baseURL: 'http://localhost:11434/v1',
      openWeights: true,
    });
    expect(ref.provider).toBe('ollama');
    expect(ref.openWeights).toBe(true);
  });

  it('accepts an OpenRouter free-tier model ref (no baseURL needed)', () => {
    const ref = ModelRefSchema.parse({
      provider: 'openrouter',
      model: 'openai/gpt-oss-20b:free',
      freeTier: true,
    });
    expect(ref.model).toContain(':free');
  });

  it('accepts unknown-but-OpenAI-compatible providers', () => {
    const agent = AgentSchema.parse({
      id: newId('agent'),
      runId: 'run_x',
      name: 'homelab-researcher',
      provider: 'homelab-vllm',
      model: 'Qwen2.5-7B-Instruct',
      baseURL: 'http://192.168.1.20:8000/v1',
      createdAt: t,
    });
    expect(agent.provider).toBe('homelab-vllm');
    expect(isKnownProvider(agent.provider)).toBe(false);
    expect(isKnownProvider('openrouter')).toBe(true);
  });

  it('rejects a non-http baseURL', () => {
    expect(() =>
      ModelRefSchema.parse({
        provider: 'ollama',
        model: 'llama3.2',
        baseURL: 'ftp://localhost:11434/v1',
      }),
    ).toThrow();
  });

  it('keeps the known-provider list closed and typed', () => {
    const known = KnownProviderSchema.options;
    expect(known).toContain('ollama');
    expect(known).toContain('openrouter');
    expect(known).not.toContain('homelab-vllm');
  });
});
