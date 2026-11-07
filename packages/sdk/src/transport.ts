/**
 * The transport seam. ALL provider-specific behavior lives behind this
 * interface; the observatory/scorekeeping code is transport-agnostic and is
 * tested offline against fakes. Amendment A2: we own this seam instead of
 * depending on the AI SDK (at v7, two majors beyond a verified baseline),
 * because every endpoint we care about already speaks this thin protocol.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  /**
   * true  = the endpoint itself reported these counts
   * false = we derived/absent them — span gets fidelity 'estimated'
   */
  exact: boolean;
}

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'finish'; usage?: StreamUsage; finishReason?: string }
  | { type: 'error'; error: unknown };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}

export type ChatTransport = (request: ChatRequest) => AsyncIterable<StreamEvent>;

export type FetchLike = typeof fetch;
