import type { ChatRequest, ChatTransport, FetchLike, StreamEvent, StreamUsage } from '../transport';

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export interface OpenAICompatibleOptions {
  /** e.g. http://localhost:11434/v1 — must end before /chat/completions. */
  baseURL: string;
  /** Bearer token; most local servers need none. It is used here andonly
   * here — never persisted, never logged (plan §13). */
  apiKey?: string;
  headers?: Record<string, string>;
  /** Injectable for offline tests (SSE chunk simulation). */
  fetchImpl?: FetchLike;
}

/** Undici wraps real causes (ECONNREFUSED, AggregateError...). Unwrap them. */
function describeFetchError(error: unknown): string {
  const e = error as {
    message?: string;
    code?: string;
    cause?: unknown;
    errors?: unknown[];
  } | null;
  if (!e) return String(error);
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    return e.errors.map(describeFetchError).join(' | ');
  }
  const message = e.message ?? String(error);
  const nested = e.cause !== undefined ? describeFetchError(e.cause) : undefined;
  return nested ? `${message} (${nested})` : message;
}

/**
 * Minimal OpenAI chat/completions streaming client. Speaks the protocol
 * served by Ollama, vLLM, LM Studio, llama.cpp, OpenRouter, Groq, Together
 * and paid OpenAI — one transport, many endpoints (Amendment A).
 *
 * Usage fidelity: endpoints that return a `usage` object in the final
 * chunks produce exact counts; anything missing degrades to exact:false
 * without fabrication.
 */
export function createOpenAICompatibleTransport(options: OpenAICompatibleOptions): ChatTransport {
  const doFetch = options.fetchImpl ?? fetch;
  const url = options.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...options.headers,
  };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

  return async function* stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        }),
        signal: request.signal,
      });
    } catch (error) {
      yield {
        type: 'error',
        error: new Error(`connect failed: ${describeFetchError(error)}`),
      };
      return;
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '<unreadable body>');
      yield {
        type: 'error',
        error: new Error(`HTTP ${response.status} from endpoint: ${bodyText.slice(0, 500)}`),
      };
      return;
    }
    if (!response.body) {
      yield { type: 'error', error: new Error('endpoint returned no response body') };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const usage: StreamUsage = { inputTokens: undefined, outputTokens: undefined, exact: false };
    let finishReason: string | undefined;
    let finished = false;

    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        let newlineAt = buffer.indexOf('\n');
        while (newlineAt !== -1) {
          const line = buffer.slice(0, newlineAt).trim();
          buffer = buffer.slice(newlineAt + 1);
          newlineAt = buffer.indexOf('\n');

          if (line.length === 0 || !line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            finished = true;
            break;
          }

          const parsed = asRecord(JSON.parse(payload));
          if (!parsed) continue;

          if (parsed.usage) {
            const u = asRecord(parsed.usage);
            usage.inputTokens = asNum(u?.prompt_tokens) ?? usage.inputTokens;
            usage.outputTokens = asNum(u?.completion_tokens) ?? usage.outputTokens;
            if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
              usage.exact = true;
            }
          }

          const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
          const choice = asRecord(choices[0]);
          if (!choice) continue;
          const delta = asRecord(choice.delta);
          const textDelta = asStr(delta?.content);
          if (textDelta && textDelta.length > 0) {
            yield { type: 'text-delta', delta: textDelta };
          }
          const reason = asStr(choice.finish_reason);
          if (reason) finishReason = reason;
        }
        if (finished) break;
      }
    } catch (error) {
      yield { type: 'error', error: new Error(`stream broken: ${String(error)}`) };
      return;
    }

    yield {
      type: 'finish',
      usage: usage.exact ? { ...usage } : undefined,
      finishReason,
    };
  };
}
