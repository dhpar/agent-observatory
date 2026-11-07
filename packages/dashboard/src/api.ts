import type { Agent, Run, Span } from '@observatory/core';

export interface Store {
  runs: Run[];
  agents: Agent[];
  spans: Span[];
  connected: boolean;
}

const EMPTY: Store = { runs: [], agents: [], spans: [], connected: false };

type ServerEvent =
  | { type: 'snapshot'; snapshot: { runs: Run[]; agents: Agent[]; spans: Span[] } }
  | { type: 'run'; run: Run }
  | { type: 'agent'; agent: Agent }
  | { type: 'span'; span: Span };

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
};

/**
 * WS state sync: full snapshot on connect (freshness after refresh — plan
 * edge case E10), then live deltas; auto-reconnect every second.
 */
export function connectToObservatory(onChange: (store: Store) => void): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let store: Store = EMPTY;
  let lastSnapshot: { runs: Run[]; agents: Agent[]; spans: Span[] } = {
    runs: [],
    agents: [],
    spans: [],
  };

  const emit = (): void => onChange(store);

  const connect = (): void => {
    if (closed) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${window.location.host}/ws`);

    socket.onopen = () => {
      store = { ...store, connected: true };
      emit();
    };
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as ServerEvent;
      switch (event.type) {
        case 'snapshot':
          lastSnapshot = event.snapshot;
          store = { ...event.snapshot, connected: store.connected };
          break;
        case 'run':
          store = { ...store, runs: upsert(store.runs, event.run) };
          break;
        case 'agent':
          store = { ...store, agents: upsert(store.agents, event.agent) };
          break;
        case 'span': {
          store = { ...store, spans: upsert(store.spans, event.span) };
          break;
        }
      }
      emit();
    };
    socket.onclose = () => {
      // stale live rows may linger after reconnect until the snapshot lands;
      // running the snapshot through gives us durability.
      store = { ...lastSnapshot, connected: false };
      emit();
      window.setTimeout(connect, 1000);
    };
    socket.onerror = () => socket?.close();
  };

  connect();
  return () => {
    closed = true;
    socket?.close();
  };
}
