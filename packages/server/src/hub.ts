import type { Agent, Run, Span } from '@observatory/core';
import { listAllAgents, listAllSpans, listRuns, type Db } from '@observatory/db';

export interface Snapshot {
  runs: Run[];
  agents: Agent[];
  spans: Span[];
}

export type HubEvent =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'run'; run: Run }
  | { type: 'agent'; agent: Agent }
  | { type: 'span'; span: Span };

/**
 * Reads the SQLite file the SDK writes and produces deltas. M2 design:
 * the dashboard is a consumer of the same file, NOT a refactor of the
 * pipeline (plan §16). Every 400ms: fetch everything, diff by signature,
 * emit only the changed rows. Reconnects always start from a full
 * snapshot (plan edge case E10).
 */
export class Hub {
  private seen = new Map<string, string>();

  constructor(
    private readonly db: Db,
    private readonly pollMs = 400,
  ) {}

  snapshot(): Snapshot {
    return {
      runs: listRuns(this.db),
      agents: listAllAgents(this.db),
      spans: listAllSpans(this.db),
    };
  }

  /**
   * Full state for a NEW consumer, and marks everything seen so the next
   * poll only emits true deltas. Without this, a poll firing right after
   * the connect re-emits rows the snapshot already delivered (spurious
   * 'run'/'agent'/'span' events). REST endpoints keep using the pure
   * snapshot() — an HTTP read must not consume a WS client's delta credit.
   */
  clientSnapshot(): Snapshot {
    const snap = this.snapshot();
    this.markSeen(listRuns(this.db), 'run');
    this.markSeen(listAllAgents(this.db), 'agent');
    this.markSeen(listAllSpans(this.db), 'span');
    return snap;
  }

  /** One pass; returns everything that changed since the previous pass. */
  poll(): HubEvent[] {
    const events: HubEvent[] = [];
    this.diff(listRuns(this.db), 'run', (run) => ({ type: 'run' as const, run }), events);
    this.diff(
      listAllAgents(this.db),
      'agent',
      (agent) => ({ type: 'agent' as const, agent }),
      events,
    );
    this.diff(listAllSpans(this.db), 'span', (span) => ({ type: 'span' as const, span }), events);
    return events;
  }

  private markSeen<T extends { id: string }>(items: readonly T[], kind: string): void {
    for (const item of items) {
      this.seen.set(`${kind}:${item.id}`, JSON.stringify(item));
    }
  }

  private diff<T extends { id: string }>(
    items: readonly T[],
    kind: string,
    wrap: (item: T) => HubEvent,
    into: HubEvent[],
  ): void {
    for (const item of items) {
      const key = `${kind}:${item.id}`;
      const signature = JSON.stringify(item);
      if (this.seen.get(key) !== signature) {
        this.seen.set(key, signature);
        into.push(wrap(item));
      }
    }
  }
}
