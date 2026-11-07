#!/usr/bin/env tsx
/**
 * `pnpm observatory` — live tail of everything the tracing spine writes.
 * M1 slice: polls SQLite every 500ms and prints span status transitions.
 * M2 replaces this with the WebSocket dashboard.
 */
import * as path from 'node:path';
import { listAllSpans, getRun, openDatabase } from '@observatory/db';
import type { Span } from '@observatory/core';

const args = process.argv.slice(2);
const dbFlag = args.indexOf('--db');
const dbPath = dbFlag !== -1 && args[dbFlag + 1] ? args[dbFlag + 1]! : 'data/observatory.db';
const once = args.includes('--once'); // print current state and exit (postmortem mode)
const db = openDatabase(path.resolve(dbPath));

const seenStatus = new Map<string, Span['status']>();

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function fmtSpan(span: Span): string {
  const duration =
    span.endedAt !== undefined
      ? `${((span.endedAt - span.startedAt) / 1000).toFixed(1)}s`
      : 'running…';
  const tokens =
    span.inputTokens !== undefined || span.outputTokens !== undefined
      ? `, tok ${span.inputTokens ?? '?'}→${span.outputTokens ?? '?'} (${
          span.usageFidelity === 'exact' ? 'exact' : 'est.'
        })`
      : '';
  const objective = getRun(db, span.runId)?.objective ?? '';
  return `${fmtTime(span.startedAt)}  ${span.runId.slice(0, 15)}…  [${span.type}] ${span.name} → ${span.status.toUpperCase()} (${duration}${tokens})${objective ? `\n           objective: ${objective}` : ''}`;
}

console.log(`observatory: tailing ${dbPath} (Ctrl+C to stop)`);
let running = true;
process.on('SIGINT', () => {
  running = false;
});

const tick = async (): Promise<void> => {
  const all = listAllSpans(db);
  for (const span of all) {
    if (seenStatus.get(span.id) !== span.status) {
      seenStatus.set(span.id, span.status);
      console.log(fmtSpan(span));
    }
  }
};

void (async () => {
  for (let first = true; running || first; first = false) {
    await tick();
    if (once) running = false;
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log('observatory: bye');
})();
